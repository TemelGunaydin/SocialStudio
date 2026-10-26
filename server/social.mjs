import { randomUUID } from 'node:crypto';
import { mkdir, writeFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { configurationChanges, saveConfig } from './config.mjs';
import { projectFromRow } from './projects.mjs';
import { openaiRequest } from './openai.mjs';
import { saveVideo } from './video.mjs';
import { insertMedia, scanFolder, archiveMedia, listFolders } from './media-library.mjs';
import { textModels, imageModels, modelId, bad, socialCopy, selectVideo, validateCopy } from './social-ai.mjs';
import { platforms, platformConfig, importXAccount, oauthStart, oauthFinish, creatorInfo, publishSocial } from './social-platforms.mjs';

export function createSocialStudio({ store, dataDir, configPath, readJson, reply, fetchImpl = fetch, publisher = publishSocial, isConfigBusy = () => false }) {
  const db = store.db;
  const busy = new Set();
  let automationBusy = false;
  const stamp = () => new Date().toISOString();
  const posts = () => db.prepare(`SELECT p.*, a.name AS account_name, a.username AS account_username, m.name AS media_name, m.kind AS media_kind, m.stored_name
    FROM social_posts p LEFT JOIN social_accounts a ON a.id=p.account_id LEFT JOIN media_library m ON m.id=p.media_id ORDER BY p.created_at DESC, p.rowid DESC LIMIT 300`).all();
  const media = () => db.prepare('SELECT * FROM media_library ORDER BY created_at DESC LIMIT 1000').all();
  const account = id => db.prepare('SELECT * FROM social_accounts WHERE id=?').get(id);
  const getPost = id => db.prepare('SELECT * FROM social_posts WHERE id=?').get(id);
  const getMedia = id => id ? db.prepare('SELECT * FROM media_library WHERE id=?').get(id) : null;
  const getAutomation = () => JSON.parse(store.getSetting.get('social_automation')?.value || '{"enabled":false}');
  importXAccount(store);
  function availableVideos() {
    return db.prepare(`SELECT m.* FROM media_library m WHERE m.kind='video' AND m.status='available'
      AND NOT EXISTS (SELECT 1 FROM social_posts p WHERE p.media_id=m.id AND p.status IN ('scheduled','publishing','published','uncertain')) ORDER BY m.created_at DESC LIMIT 100`).all();
  }
  function validateTarget(platform, id) {
    if (id && account(id)?.platform !== platform) throw bad('Seçilen hesap platformla eşleşmiyor.');
    return id || null;
  }
  function validateOptions(platform, value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw bad('Yayın seçenekleri geçersiz.');
    if (platform === 'youtube' && !['private', 'unlisted', 'public'].includes(value.privacy)) throw bad('YouTube görünürlüğünü seçin.');
    if (platform === 'tiktok' && value.privacy && !['SELF_ONLY', 'PUBLIC_TO_EVERYONE', 'MUTUAL_FOLLOW_FRIENDS', 'FOLLOWER_OF_CREATOR'].includes(value.privacy)) throw bad('TikTok görünürlüğü geçersiz.');
    return JSON.stringify(Object.fromEntries(['privacy','consent','duration','madeForKids','aiGenerated','ownBrand','branded','allowComment','allowDuet','allowStitch'].filter(key => value[key] !== undefined).map(key => [key, value[key]])));
  }
  async function locked(key, operation) {
    if (busy.has(key)) throw bad('Bu işlem zaten sürüyor. Tamamlanmasını bekleyin.', 409);
    busy.add(key); try { return await operation(); } finally { busy.delete(key); }
  }
  function createPosts(input) {
    if (typeof input.context !== 'string' || !input.context.trim() || input.context.length > 20_000) throw bad('1-20.000 karakter arasında bağlam girin.');
    if (!Array.isArray(input.targets) || !input.targets.length || input.targets.length > 20) throw bad('En az bir platform veya hesap seçin.');
    const model = modelId(input.model || process.env.OPENAI_TEXT_MODEL || 'gpt-6-luna');
    const keys = new Set();
    const targets = input.targets.map(target => {
      if (!platforms.includes(target.platform)) throw bad('Platform desteklenmiyor.');
      const id = validateTarget(target.platform, target.accountId);
      const key = `${target.platform}:${id}`;
      if (keys.has(key)) throw bad('Aynı hesap iki kez seçilemez.');
      keys.add(key); return { platform: target.platform, account: id };
    });
    const batch = randomUUID();
    const created = [];
    db.exec('BEGIN');
    try {
      for (const target of targets) {
        const id = randomUUID();
        db.prepare('INSERT INTO social_posts (id,batch_id,platform,account_id,context,model,options,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)')
          .run(id, batch, target.platform, target.account, input.context.trim(), model, JSON.stringify(target.platform === 'youtube' ? { privacy: 'private' } : {}), stamp(), stamp());
        created.push(getPost(id));
      }
      db.exec('COMMIT');
    } catch (error) { db.exec('ROLLBACK'); throw error; }
    return created;
  }
  async function generate(post, choose = false) {
    let video = getMedia(post.media_id);
    let reason = '';
    if (choose) {
      const selection = await selectVideo(post.context, post.platform, post.model, availableVideos(), fetchImpl);
      video = getMedia(selection.id); reason = selection.reason;
    }
    const copy = await socialCopy({ ...post, video }, fetchImpl);
    db.prepare("UPDATE social_posts SET text=?,title=?,media_id=?,revision=revision+1,updated_at=? WHERE id=? AND status='draft'")
      .run(copy.text, copy.title, video?.id || null, stamp(), post.id);
    return { post: getPost(post.id), reason };
  }
  function publishReady(post) {
    if (!post.account_id || account(post.account_id)?.platform !== post.platform) throw bad('Yayın için bağlı bir hesap seçin.');
    validateCopy(post.platform, post.text, post.title);
    if (post.platform !== 'x' && getMedia(post.media_id)?.kind !== 'video') throw bad('Bu platform için MP4 video seçin.');
    if (post.platform === 'tiktok') {
      const options = JSON.parse(post.options);
      if (!options.privacy || options.consent !== true || !Number.isFinite(options.duration) || options.duration <= 0) throw bad('TikTok görünürlüğü, video önizlemesi ve müzik kullanım onayı gerekli.');
    }
  }
  async function send(post) {
    publishReady(post);
    if (!db.prepare("UPDATE social_posts SET status='publishing',error=NULL,updated_at=? WHERE id=? AND status IN ('draft','scheduled') AND revision=?").run(stamp(), post.id, post.revision).changes) throw bad('Gönderi değişti veya zaten işleniyor.', 409);
    try {
      const result = await publisher(store, post, getMedia(post.media_id), dataDir, fetchImpl);
      db.prepare("UPDATE social_posts SET status='published',remote_id=?,remote_url=?,error=NULL,updated_at=? WHERE id=?").run(result.id, result.url, stamp(), post.id);
      if (post.media_id) await archiveMedia(store, dataDir, post.media_id);
    } catch (error) {
      db.prepare('UPDATE social_posts SET status=?,error=?,updated_at=? WHERE id=?').run(error.uncertain ? 'uncertain' : 'failed', error.message, stamp(), post.id);
      throw error;
    }
    return getPost(post.id);
  }
  async function scheduler() {
    for (const post of db.prepare("SELECT * FROM social_posts WHERE status='scheduled' AND scheduled_at <= ? ORDER BY scheduled_at LIMIT 10").all(stamp())) {
      try { await locked(post.id, () => send(post)); } catch { /* persisted per post, never blindly retry */ }
    }
    const rule = getAutomation();
    if (!rule.enabled || automationBusy || rule.nextAt > stamp()) return;
    automationBusy = true;
    const nextAt = new Date(Date.now() + rule.intervalHours * 3_600_000).toISOString();
    store.setSetting.run('social_automation', JSON.stringify({ ...rule, nextAt, lastRun: stamp(), lastError: null }));
    try {
      if (rule.folder) await locked('library', () => scanFolder(store, dataDir, rule.folder));
      const created = createPosts({ context: rule.context, model: rule.model, targets: rule.targets });
      // Reserve one video for the complete campaign, so X and YouTube can share it.
      const selection = await selectVideo(rule.context, 'youtube', rule.model, availableVideos(), fetchImpl);
      for (const post of created) db.prepare('UPDATE social_posts SET media_id=? WHERE id=?').run(selection.id, post.id);
      for (const item of created) {
        await locked(item.id, async () => {
          const post = getPost(item.id);
          const { post: ready } = await generate(post);
          const options = ready.platform === 'youtube' ? { privacy: rule.privacy || 'private', madeForKids: Boolean(rule.madeForKids), aiGenerated: Boolean(rule.aiGenerated) } : {};
          db.prepare('UPDATE social_posts SET options=? WHERE id=?').run(JSON.stringify(options), ready.id);
          await send(getPost(ready.id));
        });
      }
    } catch (error) {
      const current = getAutomation();
      store.setSetting.run('social_automation', JSON.stringify({ ...current, lastError: error.message }));
    } finally { automationBusy = false; }
  }
  async function handle(req, res, url) {
    const path = url.pathname;
    if (!path.startsWith('/api/social/')) return false;
    const respond = (body, status = 200) => { reply(res, status, body); return true; };
    if (req.method === 'GET' && path === '/api/social/state') {
      return respond({ posts: posts(), accounts: db.prepare('SELECT id,platform,remote_id,name,username FROM social_accounts ORDER BY platform,name').all(),
        media: media(), textModels, imageModels, textModel: process.env.OPENAI_TEXT_MODEL || 'gpt-6-luna', imageModel: process.env.OPENAI_IMAGE_MODEL || 'gpt-image-1-mini',
        context: store.getSetting.get('social_context')?.value || '', folder: store.getSetting.get('social_folder')?.value || '',
        openaiConfigured: Boolean(process.env.OPENAI_API_KEY), automation: getAutomation(),
        connections: Object.fromEntries(platforms.map(platform => [platform, { configured: platformConfig(platform), callback: `${process.env.PUBLIC_BASE_URL}${platform === 'x' ? '/api/x/callback' : `/api/social/oauth/${platform}/callback`}` }])) });
    }
    const oauth = path.match(/^\/api\/social\/oauth\/(youtube|tiktok)\/(connect|callback)$/);
    if (req.method === 'GET' && oauth) {
      if (oauth[2] === 'connect') { res.writeHead(302, { Location: oauthStart(store, oauth[1]), 'Cache-Control': 'no-store' }); res.end(); return true; }
      let location = '/?social=connected';
      try { await locked(`oauth:${url.searchParams.get('state')}`, () => oauthFinish(store, oauth[1], url.searchParams.get('state'), url.searchParams.get('code'), fetchImpl)); }
      catch (error) { location = `/?social_error=${encodeURIComponent(error.message)}`; }
      res.writeHead(302, { Location: location, 'Cache-Control': 'no-store' }); res.end(); return true;
    }
    if (req.method === 'POST' && path === '/api/social/settings') {
      if (busy.size || automationBusy || isConfigBusy()) throw bad('Devam eden işlemin bitmesini bekleyin.', 409);
      const input = await readJson(req, 16000);
      if (busy.size || automationBusy || isConfigBusy()) throw bad('Devam eden işlemin bitmesini bekleyin.', 409);
      const changes = configurationChanges(input);
      for (const key of ['OPENAI_TEXT_MODEL', 'OPENAI_IMAGE_MODEL']) if (input[key]) changes[key] = modelId(input[key], key === 'OPENAI_IMAGE_MODEL');
      const changed = platforms.filter(platform => {
        const prefix = platform === 'x' ? 'X' : platform.toUpperCase();
        return ['CLIENT_ID','CLIENT_SECRET'].some(key => changes[`${prefix}_${key}`] && changes[`${prefix}_${key}`] !== process.env[`${prefix}_${key}`]);
      });
      saveConfig(configPath, changes);
      for (const platform of changed) db.prepare('DELETE FROM social_accounts WHERE platform=?').run(platform);
      if (changed.includes('x')) { store.deleteSetting.run('x_token'); store.deleteSetting.run('x_credits'); }
      if (changed.length) db.prepare("DELETE FROM settings WHERE key LIKE 'social_oauth:%' OR key LIKE 'oauth:%'").run();
      return respond({ ok: true });
    }
    if (req.method === 'POST' && path === '/api/social/posts') {
      const input = await readJson(req, 80000);
      const created = createPosts(input);
      store.setSetting.run('social_context', input.context);
      return respond({ posts: created }, 201);
    }
    if (req.method === 'POST' && path === '/api/social/library/folders') {
      const input = await readJson(req, 4000);
      return respond(await listFolders(input.folder));
    }
    if (req.method === 'POST' && path === '/api/social/library/scan') {
      const input = await readJson(req, 4000);
      return respond(await locked('library', () => scanFolder(store, dataDir, input.folder)));
    }
    if (req.method === 'POST' && path === '/api/social/library/upload') {
      const name = decodeURIComponent(req.headers['x-file-name'] || 'video.mp4');
      const stored = await saveVideo(req, dataDir);
      const size = (await stat(join(dataDir, 'videos', stored))).size;
      return respond({ media: insertMedia(store, { name, stored, kind: 'video', size }) }, 201);
    }
    const archive = path.match(/^\/api\/social\/library\/([a-f0-9-]{36})\/archive$/);
    if (req.method === 'POST' && archive) {
      await locked('library', () => archiveMedia(store, dataDir, archive[1]));
      return respond({ ok: true });
    }
    if (req.method === 'POST' && path === '/api/social/automation') {
      if (automationBusy) throw bad('Otomatik yayının tamamlanmasını bekleyin.', 409);
      const input = await readJson(req, 80000);
      if (input.enabled === false) { store.setSetting.run('social_automation', JSON.stringify({ ...getAutomation(), enabled: false })); return respond({ ok: true }); }
      if (input.enabled !== true || !process.env.OPENAI_API_KEY || typeof input.context !== 'string' || !input.context.trim() || input.context.length > 20000 || !Array.isArray(input.targets) || !input.targets.length || input.targets.length > 20) throw bad('Bağlam, OpenAI anahtarı ve hedef hesaplar gerekli.');
      for (const target of input.targets) {
        if (!['x','youtube'].includes(target.platform) || !target.accountId) throw bad('Otomatik akış X ve YouTube hesapları içindir. TikTok her gönderide ayrıca onay ister.');
        validateTarget(target.platform, target.accountId);
      }
      if (new Set(input.targets.map(item => item.accountId)).size !== input.targets.length) throw bad('Aynı hesap iki kez seçilemez.');
      if (!Number.isInteger(input.intervalHours) || input.intervalHours < 1 || input.intervalHours > 168) throw bad('Aralık 1-168 saat olmalı.');
      if (!['private','unlisted','public'].includes(input.privacy)) throw bad('YouTube görünürlüğünü seçin.');
      const rule = { enabled: true, context: input.context, targets: input.targets, model: modelId(input.model), intervalHours: input.intervalHours,
        privacy: input.privacy, madeForKids: Boolean(input.madeForKids), aiGenerated: Boolean(input.aiGenerated), folder: store.getSetting.get('social_folder')?.value || '',
        nextAt: new Date(Date.now() + input.intervalHours * 3_600_000).toISOString(), lastError: null };
      store.setSetting.run('social_automation', JSON.stringify(rule));
      return respond({ automation: rule });
    }
    const acc = path.match(/^\/api\/social\/accounts\/([a-f0-9-]{36})(?:\/(creator))?$/);
    if (acc) {
      const value = account(acc[1]); if (!value) throw bad('Hesap bulunamadı.', 404);
      if (req.method === 'GET' && acc[2] === 'creator' && value.platform === 'tiktok') return respond({ creator: await creatorInfo(store, value, fetchImpl) });
      if (req.method === 'DELETE' && !acc[2]) {
        if (busy.size || automationBusy) throw bad('Devam eden işlemin bitmesini bekleyin.', 409);
        db.prepare('DELETE FROM social_accounts WHERE id=?').run(value.id);
        if (value.platform === 'x') {
          const legacy = store.getSetting.get('x_token')?.value;
          if (legacy && JSON.parse(legacy).user?.id === value.remote_id) { store.deleteSetting.run('x_token'); store.deleteSetting.run('x_credits'); }
        }
        return respond({ ok: true });
      }
    }
    const match = path.match(/^\/api\/social\/posts\/([a-f0-9-]{36})(?:\/([a-z-]+))?$/);
    if (req.method === 'POST' && match) return locked(match[1], async () => {
      const post = getPost(match[1]); if (!post) throw bad('Gönderi bulunamadı.', 404);
      const action = match[2] || 'save';
      if (action === 'cancel' && ['scheduled','failed'].includes(post.status)) {
        db.prepare("UPDATE social_posts SET status='draft',scheduled_at=NULL,revision=revision+1 WHERE id=?").run(post.id); return respond({ post: getPost(post.id) });
      }
      if (action === 'resolve' && post.status === 'uncertain') {
        const input = await readJson(req, 2048);
        if (input.published !== true) throw bad('Yayını platform hesabında doğrulayın.');
        db.prepare("UPDATE social_posts SET status='published',error=NULL,updated_at=? WHERE id=?").run(stamp(), post.id);
        if (post.media_id) await archiveMedia(store, dataDir, post.media_id);
        return respond({ post: getPost(post.id) });
      }
      if (post.status !== 'draft') throw bad('Bu gönderi düzenlenemez. Planı iptal edin veya başarısız yayını taslağa alın.', 409);
      if (action === 'save') {
        const input = await readJson(req, 80000);
        if (input.context !== undefined && (typeof input.context !== 'string' || !input.context.trim() || input.context.length > 20000)) throw bad('Bağlam 1-20.000 karakter olmalı.');
        const context = input.context ?? post.context;
        const model = input.model ? modelId(input.model) : post.model;
        if (typeof input.text !== 'string' || input.text.length > 5000 || typeof input.title !== 'string' || input.title.length > 100) throw bad('Başlık veya metin çok uzun.');
        const selected = getMedia(input.mediaId);
        if (input.mediaId && (!selected || selected.status === 'published')) throw bad('Kullanılabilir bir medya seçin.');
        if (!db.prepare("UPDATE social_posts SET title=?,text=?,account_id=?,media_id=?,options=?,context=?,model=?,revision=revision+1,updated_at=? WHERE id=? AND revision=? AND status='draft'")
          .run(input.title, input.text, validateTarget(post.platform, input.accountId), selected?.id || null, validateOptions(post.platform, input.options || {}), context, model, stamp(), post.id, input.revision).changes) throw bad('Gönderi başka sekmede değişti. Yenileyip tekrar deneyin.', 409);
        return respond({ post: getPost(post.id) });
      }
      if (action === 'generate' || action === 'generate-video') return respond(await generate(post, action === 'generate-video'));
      if (action === 'select-video') {
        const selection = await selectVideo(post.context, post.platform, post.model, availableVideos(), fetchImpl);
        db.prepare('UPDATE social_posts SET media_id=?,revision=revision+1,updated_at=? WHERE id=?').run(selection.id, stamp(), post.id);
        return respond({ post: getPost(post.id), reason: selection.reason });
      }
      if (action === 'image') {
        const input = await readJson(req, 4000);
        const imageModel = modelId(input.model || process.env.OPENAI_IMAGE_MODEL || 'gpt-image-1-mini', true);
        const result = await openaiRequest('images/generations', { model: imageModel, prompt: `Create a polished social media illustration. No invented product interfaces or claims. Context: ${post.context.slice(0, 12000)}. Post: ${post.text}. ${typeof input.prompt === 'string' ? input.prompt.slice(0, 2000) : ''}`, size: '1024x1024', quality: 'low', output_format: 'jpeg', n: 1 }, fetchImpl);
        if (!result.data?.[0]?.b64_json) throw bad('Görsel API yanıtı boş.');
        const bytes = Buffer.from(result.data[0].b64_json, 'base64');
        if (!bytes.length || bytes.length > 5_000_000) throw bad('Görsel 5 MB sınırını aşıyor.');
        const stored = `${randomUUID()}.jpg`;
        await mkdir(join(dataDir, 'images'), { recursive: true, mode: 0o700 });
        await writeFile(join(dataDir, 'images', stored), bytes, { mode: 0o600 });
        const asset = insertMedia(store, { name: `${post.platform}-gorsel.jpg`, stored, kind: 'image', size: bytes.length });
        // On video platforms the image is a separate creative asset, not a video attachment.
        if (post.platform === 'x') db.prepare('UPDATE social_posts SET media_id=?,revision=revision+1 WHERE id=?').run(asset.id, post.id);
        return respond({ media: asset, attached: post.platform === 'x' });
      }
      if (action === 'publish') return respond({ post: await send(post) });
      if (action === 'schedule') {
        const input = await readJson(req, 2048); publishReady(post);
        const time = Date.parse(input.at);
        if (!Number.isFinite(time) || time < Date.now() + 30_000) throw bad('En az 30 saniye sonraki bir yayın zamanı seçin.');
        db.prepare("UPDATE social_posts SET status='scheduled',scheduled_at=?,revision=revision+1,updated_at=? WHERE id=?").run(new Date(time).toISOString(), stamp(), post.id);
        return respond({ post: getPost(post.id) });
      }
      throw bad('İşlem bulunamadı.', 404);
    });
    throw bad('İşlem bulunamadı.', 404);
  }
  return { handle, scheduler, get isBusy() { return busy.size > 0 || automationBusy; } };
}
