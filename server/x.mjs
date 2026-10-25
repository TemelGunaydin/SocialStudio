import { createHash, randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { open } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { validateVideo, videoPath } from './video.mjs';

const api = 'https://api.x.com/2';
const scopes = 'tweet.read tweet.write users.read media.write offline.access';
const tokenRefreshes = new WeakMap();

function credentials() {
  const { X_CLIENT_ID, X_CLIENT_SECRET, PUBLIC_BASE_URL } = process.env;
  if (!X_CLIENT_ID || !X_CLIENT_SECRET || !PUBLIC_BASE_URL) {
    throw new Error('X_CLIENT_ID, X_CLIENT_SECRET ve PUBLIC_BASE_URL ayarlanmalı.');
  }
  return { clientId: X_CLIENT_ID, clientSecret: X_CLIENT_SECRET, callback: `${PUBLIC_BASE_URL.replace(/\/$/, '')}/api/x/callback` };
}

function authHeader() {
  const { clientId, clientSecret } = credentials();
  return `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`;
}

async function jsonResponse(response, service) {
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = result.detail || result.error_description || result.error?.message || result.title || result.error || 'İstek başarısız.';
    const error = new Error(`${service} ${response.status}: ${detail}`);
    error.definite = true;
    throw error;
  }
  return result;
}

export function startConnection(store) {
  const { clientId, callback } = credentials();
  const state = randomBytes(24).toString('hex');
  const verifier = randomBytes(48).toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  store.setSetting.run(`oauth:${state}`, JSON.stringify({ verifier, expires: Date.now() + 10 * 60_000 }));
  const url = new URL('https://x.com/i/oauth2/authorize');
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('redirect_uri', callback);
  url.searchParams.set('scope', scopes);
  url.searchParams.set('state', state);
  url.searchParams.set('code_challenge', challenge);
  url.searchParams.set('code_challenge_method', 'S256');
  return url.href;
}

async function tokenRequest(params, fetchImpl = fetch) {
  const response = await fetchImpl(`${api}/oauth2/token`, {
    method: 'POST',
    headers: { Authorization: authHeader(), 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params),
    signal: AbortSignal.timeout(20_000)
  });
  const token = await jsonResponse(response, 'X yetkilendirmesi');
  return { ...token, expires_at: Date.now() + (token.expires_in || 7200) * 1000 };
}

export async function finishConnection(store, state, code, fetchImpl = fetch) {
  const record = store.getSetting.get(`oauth:${state}`);
  store.deleteSetting.run(`oauth:${state}`);
  if (!record || !code) throw new Error('X bağlantı isteği geçersiz veya süresi dolmuş.');
  const { verifier, expires } = JSON.parse(record.value);
  if (expires < Date.now()) throw new Error('X bağlantı isteğinin süresi dolmuş.');
  const { clientId, callback } = credentials();
  const token = await tokenRequest({
    code, grant_type: 'authorization_code', client_id: clientId,
    redirect_uri: callback, code_verifier: verifier
  }, fetchImpl);
  const meResponse = await fetchImpl(`${api}/users/me`, {
    headers: { Authorization: `Bearer ${token.access_token}` }, signal: AbortSignal.timeout(20_000)
  });
  const me = await jsonResponse(meResponse, 'X hesabı');
  token.user = { id: me.data?.id, username: me.data?.username, name: me.data?.name };
  if (!token.user.id || !token.refresh_token) throw new Error('X erişim veya yenileme bilgisi alınamadı.');
  store.setSetting.run('x_token', JSON.stringify(token));
  return token.user;
}

export function connectedAccount(store) {
  const raw = store.getSetting.get('x_token')?.value;
  return raw ? JSON.parse(raw).user : null;
}

export async function accessToken(store, fetchImpl = fetch, accountId = null) {
  const legacyRaw = store.getSetting.get('x_token')?.value;
  const legacy = legacyRaw ? JSON.parse(legacyRaw) : null;
  const account = accountId
    ? store.db.prepare("SELECT * FROM social_accounts WHERE id=? AND platform='x'").get(accountId)
    : legacy?.user?.id ? store.db.prepare("SELECT * FROM social_accounts WHERE platform='x' AND remote_id=?").get(legacy.user.id) : null;
  const raw = account?.token || (!accountId ? legacyRaw : null);
  if (!raw) throw new Error('Önce X hesabını bağlayın.');
  const token = JSON.parse(raw);
  if (token.expires_at > Date.now() + 60_000) return token.access_token;
  let requests = tokenRefreshes.get(store);
  if (!requests) { requests = new Map(); tokenRefreshes.set(store, requests); }
  const key = account?.id || 'legacy';
  if (requests.has(key)) return requests.get(key);
  const pending = (async () => {
    const { clientId } = credentials();
    const refreshed = await tokenRequest({
      grant_type: 'refresh_token', refresh_token: token.refresh_token, client_id: clientId
    }, fetchImpl);
    if (!refreshed.access_token) throw new Error('X erişim izni yenilenemedi.');
    const updated = { ...token, ...refreshed, refresh_token: refreshed.refresh_token || token.refresh_token };
    const encoded = JSON.stringify(updated);
    if (account) {
      if (!store.db.prepare('UPDATE social_accounts SET token=? WHERE id=? AND token=?').run(encoded, account.id, raw).changes) throw new Error('X bağlantısı değişti. İsteği yeniden deneyin.');
      const currentLegacy = store.getSetting.get('x_token')?.value;
      if (currentLegacy && JSON.parse(currentLegacy).user?.id === account.remote_id) store.setSetting.run('x_token', encoded);
    } else {
      if (store.getSetting.get('x_token')?.value !== raw) throw new Error('X bağlantısı değişti. İsteği yeniden deneyin.');
      store.setSetting.run('x_token', encoded);
    }
    return updated.access_token;
  })();
  requests.set(key, pending);
  try { return await pending; }
  finally { requests.delete(key); }
}

export async function readCredits(store, fetchImpl = fetch) {
  const token = await accessToken(store, fetchImpl);
  const response = await fetchImpl(`${api}/usage/credits`, {
    headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(15_000)
  });
  const { data } = await jsonResponse(response, 'X bakiye');
  if (!data || !['total_balance', 'prepaid_balance', 'free_balance'].every((key) => typeof data[key] === 'number' && Number.isFinite(data[key])) || data.total_balance < 0 || data.free_balance < 0) {
    throw new Error('X geçerli bir bakiye bilgisi döndürmedi.');
  }
  return { totalUsd: data.total_balance, prepaidUsd: data.prepaid_balance, freeUsd: data.free_balance };
}

async function uploadVideo(token, path, fetchImpl, wait) {
  const size = await validateVideo(path);
  const authorization = { Authorization: `Bearer ${token}` };
  const response = await fetchImpl(`${api}/media/upload/initialize`, {
    method: 'POST', headers: { ...authorization, 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(30_000),
    body: JSON.stringify({ media_type: 'video/mp4', media_category: 'tweet_video', total_bytes: size })
  });
  const initialized = await jsonResponse(response, 'X video başlatma');
  const id = initialized.data?.id;
  if (typeof id !== 'string' || !/^\d+$/.test(id)) throw new Error('X video kimliği döndürmedi.');
  const file = await open(path, 'r');
  try {
    const chunk = Buffer.alloc(4 * 1024 * 1024);
    let position = 0;
    let segment = 0;
    while (position < size) {
      const { bytesRead } = await file.read(chunk, 0, Math.min(chunk.length, size - position), position);
      if (!bytesRead) throw new Error('Video dosyası yükleme sırasında değişti. Yeniden seçin.');
      const form = new FormData();
      form.append('segment_index', String(segment++));
      form.append('media', new Blob([chunk.subarray(0, bytesRead)], { type: 'application/octet-stream' }), 'chunk.bin');
      await jsonResponse(await fetchImpl(`${api}/media/upload/${id}/append`, {
        method: 'POST', headers: authorization, body: form, signal: AbortSignal.timeout(60_000)
      }), 'X video parçası yükleme');
      position += bytesRead;
    }
  } finally { await file.close(); }
  const finalized = await jsonResponse(await fetchImpl(`${api}/media/upload/${id}/finalize`, {
    method: 'POST', headers: authorization, signal: AbortSignal.timeout(30_000)
  }), 'X video tamamlama');
  let processing = finalized.data?.processing_info;
  if (!finalized.data) throw new Error('X video işleme bilgisi döndürmedi.');
  if (!processing) return id;
  const deadline = Date.now() + 5 * 60_000;
  for (let attempt = 0; attempt < 30; attempt++) {
    if (processing.state === 'succeeded') return id;
    if (processing.state === 'failed') throw new Error(`X videoyu işleyemedi: ${processing.error?.message || 'MP4/H.264 ve AAC biçimini kontrol edin.'}`);
    if (!['pending', 'in_progress'].includes(processing.state)) throw new Error('X video işleme durumu tanınmadı. Gönderi yayınlanmadı.');
    const seconds = processing.check_after_secs ?? 1;
    if (typeof seconds !== 'number' || !Number.isFinite(seconds) || seconds < 0 || seconds > 60
        || Date.now() + seconds * 1000 >= deadline) break;
    await wait(seconds * 1000);
    const result = await jsonResponse(await fetchImpl(`${api}/media/upload?command=STATUS&media_id=${id}`, {
      headers: authorization, signal: AbortSignal.timeout(20_000)
    }), 'X video durumu');
    processing = result.data?.processing_info;
    if (!processing) throw new Error('X video işleme durumu eksik. Gönderi yayınlanmadı.');
  }
  if (processing.state === 'succeeded') return id;
  throw new Error('X video işleme süresi doldu. Gönderi yayınlanmadı; yeniden denemek için ayrıca onay vermelisin.');
}

export async function publish(store, draft, dataDir, fetchImpl = fetch, wait = delay) {
  const token = await accessToken(store, fetchImpl, draft.account_id);
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  const payload = { text: draft.url ? `${draft.text.trim()}\n\n${draft.url}` : draft.text.trim() };
  if (draft.media_kind === 'video') {
    const id = await uploadVideo(token, videoPath(dataDir, draft.media_path), fetchImpl, wait);
    payload.media = { media_ids: [id] };
  } else if (draft.media_kind !== 'none') {
    let bytes;
    if (draft.media_kind === 'icon') {
      const icon = store.project.get(draft.app_id)?.icon;
      if (!icon) throw new Error('Uygulama görseli bulunamadı.');
      if (icon === '/favicon.svg') throw new Error('Bu proje için ikon yok. Görselsiz yayınlayın veya görsel yükleyin.');
      if (!icon || !icon.startsWith('https://buildandruns.com/')) throw new Error('İkon kaynağı desteklenmiyor; görsel yükleyin.');
      const response = await fetchImpl(icon, { signal: AbortSignal.timeout(20_000) });
      if (!response.ok) throw new Error(`Uygulama görseli alınamadı: ${response.status}`);
      bytes = Buffer.from(await response.arrayBuffer());
    } else if (draft.media_kind === 'generated' || draft.media_kind === 'uploaded') {
      bytes = readFileSync(join(dataDir, 'images', draft.media_path));
    } else {
      throw new Error('Bilinmeyen görsel türü.');
    }
    if (bytes.length > 5_000_000) throw new Error('Görsel X sınırını aşıyor (5 MB).');
    const mediaResponse = await fetchImpl(`${api}/media/upload`, {
      method: 'POST', headers, signal: AbortSignal.timeout(45_000),
      body: JSON.stringify({ media: bytes.toString('base64'), media_category: 'tweet_image' })
    });
    const media = await jsonResponse(mediaResponse, 'X görsel yükleme');
    if (!media.data?.id) throw new Error('X görsel kimliği döndürmedi.');
    payload.media = { media_ids: [media.data.id] };
    if (draft.media_kind === 'generated') payload.made_with_ai = true;
  }
  let response;
  try {
    response = await fetchImpl(`${api}/tweets`, {
      method: 'POST', headers, body: JSON.stringify(payload), signal: AbortSignal.timeout(30_000)
    });
  } catch (error) {
    error.uncertain = true;
    throw error;
  }
  let result;
  try { result = await jsonResponse(response, 'X yayınlama'); }
  catch (error) {
    // A server error after POST may still mean X created the post. Never offer a blind retry.
    if (response.status >= 500) error.uncertain = true;
    throw error;
  }
  if (!result.data?.id) {
    const error = new Error('X yanıtında gönderi kimliği yok. Gönderi yayınlanmış olabilir.');
    error.uncertain = true;
    throw error;
  }
  return result.data.id;
}
