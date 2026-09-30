import { createHash, randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { getApp } from './catalog.mjs';

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

async function accessToken(store, fetchImpl = fetch) {
  const raw = store.getSetting.get('x_token')?.value;
  if (!raw) throw new Error('Önce X hesabını bağlayın.');
  const token = JSON.parse(raw);
  if (token.expires_at > Date.now() + 60_000) return token.access_token;
  if (tokenRefreshes.has(store)) return tokenRefreshes.get(store);
  const pending = (async () => {
    const { clientId } = credentials();
    const refreshed = await tokenRequest({
      grant_type: 'refresh_token', refresh_token: token.refresh_token, client_id: clientId
    }, fetchImpl);
    if (store.getSetting.get('x_token')?.value !== raw) throw new Error('X bağlantısı değişti. İsteği yeniden deneyin.');
    const updated = { ...token, ...refreshed, refresh_token: refreshed.refresh_token || token.refresh_token };
    store.setSetting.run('x_token', JSON.stringify(updated));
    return updated.access_token;
  })();
  tokenRefreshes.set(store, pending);
  try { return await pending; }
  finally { tokenRefreshes.delete(store); }
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

export async function publish(store, draft, dataDir, fetchImpl = fetch) {
  const token = await accessToken(store, fetchImpl);
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  const payload = { text: `${draft.text.trim()}\n\n${draft.url}` };
  if (draft.media_kind !== 'none') {
    let bytes;
    if (draft.media_kind === 'icon') {
      const icon = getApp(draft.app_id)?.icon;
      if (!icon) throw new Error('Uygulama görseli bulunamadı.');
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
  const result = await jsonResponse(response, 'X yayınlama');
  if (!result.data?.id) {
    const error = new Error('X yanıtında gönderi kimliği yok. Gönderi yayınlanmış olabilir.');
    error.uncertain = true;
    throw error;
  }
  return result.data.id;
}
