import process from 'node:process';
import { createServer } from 'node:http';
import { createHmac, randomUUID, randomBytes, timingSafeEqual } from 'node:crypto';
import { ownerConfigured, checkPassword, hashPassword, saveConfig, configurationChanges } from './config.mjs';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseProject, projectFromRow } from './projects.mjs';
import { openStore } from './db.mjs';
import { generateCopy, generateImage, suggestProject } from './openai.mjs';
import { loadPublicPage } from './site-import.mjs';
import { connectedAccount, finishConnection, publish, startConnection } from './x.mjs';
import { createUsageMonitor } from './usage.mjs';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const home = resolve(process.env.STUDIO_HOME || root);
const configPath = join(home, '.env');
if (existsSync(configPath)) process.loadEnvFile(configPath);
const dataDir = resolve(home, process.env.DATA_DIR || './data');
const port = Number(process.env.PORT || 3000);
const host = process.env.HOST || '127.0.0.1';
const draftHour = Number(process.env.DRAFT_HOUR || 10);
const publicUrl = new URL(process.env.PUBLIC_BASE_URL || `http://localhost:${port}`);
let sessionSecret = process.env.SESSION_SECRET || '';
let setupToken = ownerConfigured() ? null : randomBytes(32).toString('hex');
if (!setupToken && (sessionSecret.length < 32 || sessionSecret.startsWith('replace-with'))) {
  throw new Error('SESSION_SECRET en az 32 rastgele karakter olmalı. Mevcut .env dosyasını kontrol edin.');
}
if (setupToken && (host !== '127.0.0.1' || !['localhost', '127.0.0.1'].includes(publicUrl.hostname))) {
  throw new Error('İlk kurulumu yalnızca HOST=127.0.0.1 ve yerel PUBLIC_BASE_URL ile tamamlayın.');
}
process.env.PUBLIC_BASE_URL = publicUrl.origin;
const scheduleEnabled = () => process.env.SCHEDULE_ENABLED !== 'false';
if (!Number.isInteger(draftHour) || draftHour < 0 || draftHour > 23) throw new Error('DRAFT_HOUR 0 ile 23 arasında tam sayı olmalı.');
const store = openStore(dataDir);
const usage = createUsageMonitor(store);
const publicDir = join(root, 'public');
const loginAttempts = new Map();
const now = () => new Date().toISOString();

function reply(res, status, body, headers = {}) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    ...headers
  });
  res.end(JSON.stringify(body));
}

function fail(res, status, message) { reply(res, status, { error: message }); }

async function readJson(req, maxBytes = 8_000_000) {
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > maxBytes) throw Object.assign(new Error('İstek çok büyük.'), { status: 413 });
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'); }
  catch { throw Object.assign(new Error('Geçersiz JSON.'), { status: 400 }); }
}

function signature(value) { return createHmac('sha256', sessionSecret).update(value).digest('base64url'); }

function makeSession() {
  const value = Buffer.from(JSON.stringify({ expires: Date.now() + 14 * 86400_000, nonce: randomUUID() })).toString('base64url');
  return `${value}.${signature(value)}`;
}

function authenticated(req) {
  const token = (req.headers.cookie || '').split('; ').find((part) => part.startsWith('studio_session='))?.slice(15);
  if (!token || !ownerConfigured()) return false;
  const [value, mac] = token.split('.');
  if (!value || !mac) return false;
  const expected = signature(value);
  if (mac.length !== expected.length || !timingSafeEqual(Buffer.from(mac), Buffer.from(expected))) return false;
  try { return JSON.parse(Buffer.from(value, 'base64url').toString()).expires > Date.now(); }
  catch { return false; }
}

function sameOrigin(req) {
  const origin = req.headers.origin;
  return origin === publicUrl.origin;
}

function safeEqual(a, b) {
  const ah = createHmac('sha256', sessionSecret).update(a).digest();
  const bh = createHmac('sha256', sessionSecret).update(b).digest();
  return timingSafeEqual(ah, bh);
}

function weightedLength(text) {
  return [...text].reduce((sum, ch) => sum + (ch.codePointAt(0) > 0x10ff ? 2 : 1), 0);
}

function cleanText(input) {
  const value = String(input || '').trim();
  if (!value) throw Object.assign(new Error('Gönderi metni boş olamaz.'), { status: 400 });
  if (/https?:\/\//i.test(value)) throw Object.assign(new Error('Link ayrı ekleniyor. Metinden URL’yi çıkarın.'), { status: 400 });
  if (weightedLength(value) + 2 + 23 > 280) throw Object.assign(new Error('Metin X karakter sınırını aşıyor.'), { status: 400 });
  return value;
}

function getApp(id) { return projectFromRow(store.project.get(id)); }
function catalog() { return store.projects.all().map(projectFromRow); }
function chooseApp(id) {
  if (id) {
    const app = getApp(id);
    if (!app) throw Object.assign(new Error('Proje bulunamadı.'), { status: 400 });
    return app;
  }
  const apps = catalog();
  if (!apps.length) throw Object.assign(new Error('Önce tanıtılacak bir proje ekleyin.'), { status: 400 });
  const last = store.lastApp.get()?.app_id;
  const index = apps.findIndex((app) => app.id === last);
  return apps[(index + 1) % apps.length];
}

let suggestionBusy = false;
let generationBusy = false;
async function createDraft(appId, scheduledDate = null) {
  if (generationBusy) throw Object.assign(new Error('Bir taslak zaten üretiliyor. Biraz sonra tekrar deneyin.'), { status: 409 });
  generationBusy = true;
  try {
    const app = chooseApp(appId);
    const count = store.appCount.get(app.id).count;
    const feature = app.features[count % app.features.length];
    const recent = store.list.all().filter((draft) => draft.app_id === app.id).slice(0, 4).map((draft) => draft.text);
    const text = cleanText(await generateCopy(app, feature, recent));
    const id = randomUUID();
    const stamp = now();
    store.create.run(id, app.id, feature, text, app.url, scheduledDate, stamp, stamp);
    return store.get.get(id);
  } finally { generationBusy = false; }
}

function localDayAndHour() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Istanbul', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23'
  }).formatToParts(new Date());
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return { day: `${value.year}-${value.month}-${value.day}`, hour: Number(value.hour) };
}

let dailyBusy = false;
async function checkDaily() {
  if (!ownerConfigured() || !scheduleEnabled() || dailyBusy || generationBusy || !process.env.OPENAI_API_KEY || !store.projects.all().length) return;
  const { day, hour } = localDayAndHour();
  if (hour < draftHour || store.dailyRun.get(day)) return;
  const start = store.dailyStart.run(day, now());
  if (!start.changes) return;
  dailyBusy = true;
  try {
    await createDraft(null, day);
    store.dailyFinish.run('created', null, day);
  } catch (error) {
    store.dailyFinish.run('failed', error.message, day);
    console.error(`Daily draft ${day}: ${error.message}`);
  } finally { dailyBusy = false; }
}

function serveFile(res, path, contentType) {
  const bytes = readFileSync(path);
  res.writeHead(200, {
    'Content-Type': contentType,
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: https://buildandruns.com https://www.buildandruns.com; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'"
  });
  res.end(bytes);
}

let xConnectionBusy = false;
async function handle(req, res) {
  if (req.headers.host !== publicUrl.host) return fail(res, 403, 'Paneli yapılandırılmış adresinden açın.');
  const url = new URL(req.url, publicUrl);
  const path = url.pathname;
  if (req.method === 'GET' && path === '/') return serveFile(res, join(publicDir, 'index.html'), 'text/html; charset=utf-8');
  if (req.method === 'GET' && path === '/app.js') return serveFile(res, join(publicDir, 'app.js'), 'text/javascript; charset=utf-8');
  if (req.method === 'GET' && path === '/onboarding.js') return serveFile(res, join(publicDir, 'onboarding.js'), 'text/javascript; charset=utf-8');
  if (req.method === 'GET' && path === '/onboarding.css') return serveFile(res, join(publicDir, 'onboarding.css'), 'text/css; charset=utf-8');
  if (req.method === 'GET' && path === '/api/health') return reply(res, 200, { service: 'social-studio' });
  if (req.method === 'GET' && path === '/api/setup/status') return reply(res, 200, { needsOwner: !ownerConfigured() });
  if (req.method === 'GET' && path === '/style.css') return serveFile(res, join(publicDir, 'style.css'), 'text/css; charset=utf-8');
  if (req.method === 'GET' && path === '/favicon.svg') return serveFile(res, join(publicDir, 'favicon.svg'), 'image/svg+xml');

  if (req.method !== 'GET' && !sameOrigin(req)) return fail(res, 403, 'İstek kaynağı doğrulanamadı. PUBLIC_BASE_URL adresini kontrol edin.');

  if (req.method === 'POST' && path === '/api/setup/owner') {
    if (!setupToken || ownerConfigured()) return fail(res, 409, 'Kurulum zaten tamamlandı. Giriş yapın.');
    if (!['127.0.0.1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress)
        || !safeEqual(String(req.headers['x-setup-token'] || ''), setupToken)) return fail(res, 403, 'Uygulamanın açtığı kurulum bağlantısını kullanın.');
    const input = await readJson(req, 2048);
    if (!setupToken || ownerConfigured()) return fail(res, 409, 'Kurulum zaten tamamlandı. Giriş yapın.');
    const hash = hashPassword(input?.password);
    const secret = randomBytes(48).toString('base64url');
    saveConfig(configPath, { ADMIN_PASSWORD_HASH: hash, SESSION_SECRET: secret,
      PUBLIC_BASE_URL: publicUrl.origin, HOST: host, PORT: String(port), SCHEDULE_ENABLED: 'false' });
    sessionSecret = secret;
    setupToken = null;
    return reply(res, 201, { ok: true }, { 'Set-Cookie': `studio_session=${makeSession()}; HttpOnly; SameSite=Lax; Path=/; Max-Age=1209600` });
  }
  if (req.method === 'POST' && path === '/api/login') {
    const ip = req.socket.remoteAddress || 'unknown';
    const attempt = loginAttempts.get(ip) || { count: 0, until: 0 };
    if (attempt.until > Date.now()) return fail(res, 429, 'Çok fazla deneme. Biraz sonra tekrar deneyin.');
    const { password } = await readJson(req, 2048);
    if (!ownerConfigured() || !checkPassword(String(password || ''))) {
      attempt.count += 1;
      if (attempt.count >= 5) { attempt.until = Date.now() + 15 * 60_000; attempt.count = 0; }
      loginAttempts.set(ip, attempt);
      return fail(res, 401, 'Şifre yanlış.');
    }
    loginAttempts.delete(ip);
    const cookie = `studio_session=${makeSession()}; HttpOnly; SameSite=Lax; Path=/; Max-Age=1209600${publicUrl.protocol === 'https:' ? '; Secure' : ''}`;
    return reply(res, 200, { ok: true }, { 'Set-Cookie': cookie });
  }

  if (!authenticated(req)) return fail(res, 401, 'Oturum açın.');

  if (req.method === 'POST' && path === '/api/logout') {
    return reply(res, 200, { ok: true }, { 'Set-Cookie': `studio_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${publicUrl.protocol === 'https:' ? '; Secure' : ''}` });
  }
  if (req.method === 'GET' && path === '/api/state') {
    const { day } = localDayAndHour();
    return reply(res, 200, {
      drafts: store.list.all(), catalog: catalog(), xAccount: connectedAccount(store),
      openaiConfigured: Boolean(process.env.OPENAI_API_KEY),
      xConfigured: Boolean(process.env.X_CLIENT_ID && process.env.X_CLIENT_SECRET),
      dailyRun: store.dailyRun.get(day) || null,
      draftHour, scheduleEnabled: scheduleEnabled(), callbackUrl: `${publicUrl.origin}/api/x/callback`, usage: usage.summary()
    });
  }
  if (req.method === 'POST' && path === '/api/settings') {
    if (generationBusy || suggestionBusy || dailyBusy || xConnectionBusy || store.list.all().some((draft) => draft.status === 'publishing')) {
      return fail(res, 409, 'Devam eden işlemin bitmesini bekleyip ayarları yeniden kaydedin.');
    }
    const changes = configurationChanges(await readJson(req, 8000));
    const xChanged = ['X_CLIENT_ID', 'X_CLIENT_SECRET'].some((key) => changes[key] !== undefined && changes[key] !== process.env[key]);
    saveConfig(configPath, changes);
    if (xChanged) {
      store.deleteSetting.run('x_token'); store.deleteSetting.run('x_credits');
      store.db.prepare("DELETE FROM settings WHERE key LIKE 'oauth:%'").run();
      usage.invalidate();
    }
    return reply(res, 200, { ok: true, reconnectX: xChanged });
  }
  if (req.method === 'POST' && path === '/api/projects/suggest') {
    if (!process.env.OPENAI_API_KEY) return fail(res, 400, 'Öneri almak için OPENAI_API_KEY gerekli. Projeyi elle ekleyebilirsin.');
    if (suggestionBusy) return fail(res, 409, 'Başka bir sayfa okunuyor; biraz sonra tekrar dene.');
    const { url: input } = await readJson(req, 2500);
    suggestionBusy = true;
    try {
      const { url: source, text } = await loadPublicPage(input);
      return reply(res, 200, { suggestion: await suggestProject(source, text) });
    } finally { suggestionBusy = false; }
  }
  if (req.method === 'POST' && path === '/api/projects') {
    const input = await readJson(req, 16_000);
    let app;
    try { app = parseProject(input); }
    catch (error) { return fail(res, 400, error.message); }
    const id = randomUUID();
    store.addProject.run(id, app.name, app.category, app.platform, app.url,
      app.icon, app.color, JSON.stringify(app.features), app.guardrail);
    return reply(res, 201, { project: getApp(id) });
  }
  if (req.method === 'GET' && path === '/api/usage') {
    return reply(res, 200, { usage: await usage.refresh() });
  }
  if (req.method === 'POST' && path === '/api/usage/refresh') {
    return reply(res, 200, { usage: await usage.refresh(true) });
  }
  if (req.method === 'GET' && path === '/api/x/connect') {
    res.writeHead(302, { Location: startConnection(store), 'Cache-Control': 'no-store' });
    return res.end();
  }
  if (req.method === 'GET' && path === '/api/x/callback') {
    if (xConnectionBusy) return fail(res, 409, 'X bağlantısı zaten işleniyor.');
    xConnectionBusy = true;
    try {
      await finishConnection(store, url.searchParams.get('state'), url.searchParams.get('code'));
      store.deleteSetting.run('x_credits');
      usage.invalidate();
      res.writeHead(302, { Location: '/?x=connected' });
    } catch (error) {
      res.writeHead(302, { Location: `/?x_error=${encodeURIComponent(error.message)}` });
    } finally { xConnectionBusy = false; }
    return res.end();
  }
  if (req.method === 'POST' && path === '/api/x/disconnect') {
    store.deleteSetting.run('x_token');
    store.deleteSetting.run('x_credits');
    return reply(res, 200, { ok: true });
  }
  if (req.method === 'POST' && path === '/api/drafts/generate') {
    const { appId } = await readJson(req, 2048);
    return reply(res, 201, { draft: await createDraft(appId || null) });
  }
  if (req.method === 'POST' && path === '/api/drafts/manual') {
    const { appId, text } = await readJson(req, 4000);
    const app = chooseApp(appId);
    const copy = cleanText(text);
    const id = randomUUID();
    const stamp = now();
    store.create.run(id, app.id, 'Manual draft', copy, app.url, null, stamp, stamp);
    return reply(res, 201, { draft: store.get.get(id) });
  }
  const match = path.match(/^\/api\/drafts\/([a-f0-9-]{36})(?:\/(.*))?$/);
  if (match) {
    const id = match[1];
    const action = match[2] || '';
    const draft = store.get.get(id);
    if (!draft) return fail(res, 404, 'Taslak bulunamadı.');
    if (req.method !== 'POST') return fail(res, 405, 'Yöntem desteklenmiyor.');
    if (draft.status !== 'draft') return fail(res, 409, 'Bu taslak artık düzenlenemez.');
    if (action === '') {
      const input = await readJson(req, 5000);
      const text = cleanText(input.text);
      const kind = input.mediaKind || 'none';
      if (!['none', 'icon', 'generated', 'uploaded'].includes(kind)) return fail(res, 400, 'Geçersiz görsel seçimi.');
      if (kind === 'icon' && getApp(draft.app_id)?.icon === '/favicon.svg') return fail(res, 400, 'Bu proje için ikon yok; görsel yükleyin veya görselsiz yayınlayın.');
      if (['generated', 'uploaded'].includes(kind) && !draft.media_path) return fail(res, 400, 'Önce görsel oluşturun veya yükleyin.');
      store.edit.run(text, kind, draft.media_path, draft.media_alt, now(), id);
      return reply(res, 200, { draft: store.get.get(id) });
    }
    if (action === 'image/generate') {
      const app = getApp(draft.app_id);
      const filename = await generateImage(draft, app, dataDir);
      store.edit.run(draft.text, 'generated', filename, null, now(), id);
      return reply(res, 200, { draft: store.get.get(id) });
    }
    if (action === 'image/upload') {
      const input = await readJson(req, 8_000_000);
      const types = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' };
      const ext = types[input.type];
      if (!ext || typeof input.base64 !== 'string') return fail(res, 400, 'PNG, JPEG veya WebP yükleyin.');
      const bytes = Buffer.from(input.base64, 'base64');
      if (!bytes.length || bytes.length > 5_000_000) return fail(res, 400, 'Görsel 5 MB altında olmalı.');
      const valid = (ext === 'png' && bytes.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex')))
        || (ext === 'jpg' && bytes.subarray(0, 3).equals(Buffer.from('ffd8ff', 'hex')))
        || (ext === 'webp' && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP');
      if (!valid) return fail(res, 400, 'Görsel dosyası doğrulanamadı.');
      const imageDir = join(dataDir, 'images');
      mkdirSync(imageDir, { recursive: true, mode: 0o700 });
      const filename = `${id}-upload.${ext}`;
      writeFileSync(join(imageDir, filename), bytes, { mode: 0o600 });
      store.edit.run(draft.text, 'uploaded', filename, null, now(), id);
      return reply(res, 200, { draft: store.get.get(id) });
    }
    if (action === 'reject') {
      store.reject.run(now(), id);
      return reply(res, 200, { draft: store.get.get(id) });
    }
    if (action === 'publish') {
      if (!connectedAccount(store)) return fail(res, 400, 'Önce X hesabını bağlayın.');
      cleanText(draft.text);
      const stamp = now();
      if (!store.markPublishing.run(stamp, stamp, id).changes) return fail(res, 409, 'Taslak zaten işleniyor.');
      try {
        const xId = await publish(store, draft, dataDir);
        store.markPublished.run(xId, now(), now(), id);
        return reply(res, 200, { draft: store.get.get(id) });
      } catch (error) {
        store.markFailed.run(error.uncertain ? 'uncertain' : 'draft', error.message, now(), id);
        throw error;
      } finally { usage.invalidate(); }
    }
    return fail(res, 404, 'İşlem bulunamadı.');
  }
  const image = path.match(/^\/api\/images\/([a-f0-9-]{36}(?:-upload)?\.(?:jpg|png|webp))$/);
  if (req.method === 'GET' && image) {
    const filename = image[1];
    const contentType = { '.jpg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' }[extname(filename)];
    return serveFile(res, join(dataDir, 'images', filename), contentType);
  }
  return fail(res, 404, 'Bulunamadı.');
}

const server = createServer((req, res) => {
  handle(req, res).catch((error) => {
    console.error(error);
    if (!res.headersSent) fail(res, error.status || 500, error.message || 'Sunucu hatası.');
  });
});

server.listen(port, host, () => {
  const launchUrl = `${publicUrl.origin}/${setupToken ? `#setup=${setupToken}` : ''}`;
  // Only the local launcher receives the one-use setup token; never expose it via HTTP.
  if (process.env.STUDIO_READY_FILE) {
    writeFileSync(process.env.STUDIO_READY_FILE, JSON.stringify({ url: launchUrl }), { mode: 0o600 });
  } else console.log(`Social Studio: ${launchUrl}`);
  setTimeout(checkDaily, 2000).unref();
  setInterval(checkDaily, 60_000).unref();
});
