import { randomBytes, randomUUID } from 'node:crypto';
import { openAsBlob } from 'node:fs';
import { open } from 'node:fs/promises';
import { join, extname } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { publish as publishX, accessToken as xAccessToken } from './x.mjs';
import { validateVideo } from './video.mjs';
import { bad } from './social-ai.mjs';
import { instagramGraph, instagramJson, instagramExchange, instagramRefresh, publishInstagram } from './instagram.mjs';
import { deliveryUrl } from './media-delivery.mjs';
import { imageTypes, validateImage } from './image.mjs';

export const platforms = ['x', 'youtube', 'tiktok', 'instagram'];
export function mediaFits(platform, media, options = {}) {
  if (!media) return platform === 'x';
  if (platform === 'youtube') return media.kind === 'video';
  if (platform === 'instagram') return options.kind === 'reel' ? media.kind === 'video' : media.kind === 'image' && /\.jpg$/.test(media.stored_name);
  if (platform === 'tiktok') return media.kind === 'video' || /\.(jpg|webp)$/.test(media.stored_name);
  return platform === 'x';
}
const refreshes = new Map();
const definitions = {
  youtube: { auth: 'https://accounts.google.com/o/oauth2/v2/auth', token: 'https://oauth2.googleapis.com/token', prefix: 'YOUTUBE', scope: 'https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube.readonly' },
  tiktok: { auth: 'https://www.tiktok.com/v2/auth/authorize/', token: 'https://open.tiktokapis.com/v2/oauth/token/', prefix: 'TIKTOK', scope: 'user.info.basic,video.publish' },
  instagram: { auth: 'https://www.instagram.com/oauth/authorize', prefix: 'INSTAGRAM', scope: 'instagram_business_basic,instagram_business_content_publish' }
};
export function platformConfig(platform) {
  const prefix = platform === 'x' ? 'X' : definitions[platform]?.prefix;
  return Boolean(prefix && process.env[`${prefix}_CLIENT_ID`] && process.env[`${prefix}_CLIENT_SECRET`]);
}
export function upsertAccount(store, platform, remoteId, name, username, token) {
  if (!remoteId || !token.access_token) throw bad('Hesap kimliği veya erişim izni alınamadı.');
  store.db.prepare(`INSERT INTO social_accounts (id,platform,remote_id,name,username,token) VALUES (?,?,?,?,?,?)
    ON CONFLICT(platform,remote_id) DO UPDATE SET name=excluded.name,username=excluded.username,token=excluded.token`)
    .run(randomUUID(), platform, remoteId, name || username || remoteId, username || remoteId, JSON.stringify(token));
}
export function importXAccount(store) {
  const raw = store.getSetting.get('x_token')?.value;
  if (!raw) return;
  const token = JSON.parse(raw);
  if (token.user?.id && !store.db.prepare("SELECT 1 FROM social_accounts WHERE platform='x' AND remote_id=?").get(token.user.id)) {
    upsertAccount(store, 'x', token.user.id, token.user.name, token.user.username, token);
  }
}
export function oauthStart(store, platform) {
  const def = definitions[platform];
  if (!def || !platformConfig(platform)) throw bad('Önce bağlantı ayarlarından Developer API bilgilerini kaydedin.');
  const state = randomBytes(24).toString('hex');
  store.setSetting.run(`social_oauth:${state}`, JSON.stringify({ platform, expires: Date.now() + 600_000 }));
  const url = new URL(def.auth);
  url.search = new URLSearchParams({ response_type: 'code', [platform === 'tiktok' ? 'client_key' : 'client_id']: process.env[`${def.prefix}_CLIENT_ID`],
    redirect_uri: `${process.env.PUBLIC_BASE_URL}/api/social/oauth/${platform}/callback`, scope: def.scope, state }).toString();
  if (platform === 'youtube') { url.searchParams.set('access_type', 'offline'); url.searchParams.set('prompt', 'consent select_account'); }
  if (platform === 'instagram') { url.searchParams.set('enable_fb_login', '0'); url.searchParams.set('force_authentication', '1'); }
  return url.href;
}
async function json(response, service) {
  const value = await response.json().catch(() => ({}));
  if (!response.ok || (value.error && value.error.code !== 'ok')) {
    const detail = value.error?.message || value.error_description || value.error?.code || (typeof value.error === 'string' ? value.error : 'İstek reddedildi');
    throw bad(`${service}: ${detail}`, 400);
  }
  return value;
}
async function tokenRequest(platform, params, fetchImpl) {
  const def = definitions[platform];
  const body = new URLSearchParams({ [platform === 'tiktok' ? 'client_key' : 'client_id']: process.env[`${def.prefix}_CLIENT_ID`],
    client_secret: process.env[`${def.prefix}_CLIENT_SECRET`], ...params });
  const token = await json(await fetchImpl(def.token, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body,
    signal: AbortSignal.timeout(20_000) }), 'Hesap yetkilendirmesi');
  if (!token.access_token) throw bad('Erişim izni alınamadı. Hesabı yeniden bağlayın.');
  return { ...token, expires_at: Date.now() + Number(token.expires_in || 3600) * 1000 };
}
export async function oauthFinish(store, platform, state, code, fetchImpl = fetch) {
  const record = store.getSetting.get(`social_oauth:${state}`);
  store.deleteSetting.run(`social_oauth:${state}`);
  if (!record || !code) throw bad('Bağlantı isteği geçersiz veya süresi doldu.');
  const saved = JSON.parse(record.value);
  if (saved.platform !== platform || saved.expires < Date.now()) throw bad('Bağlantı isteğinin süresi doldu.');
  if (platform === 'instagram') {
    const token = await instagramExchange(code, `${process.env.PUBLIC_BASE_URL}/api/social/oauth/instagram/callback`, fetchImpl);
    const me = await instagramJson(await fetchImpl(`${instagramGraph}/me?fields=user_id,username`, { headers: { Authorization: `Bearer ${token.access_token}` }, signal: AbortSignal.timeout(20_000) }));
    upsertAccount(store, platform, String(me.user_id || me.id || ''), me.username, me.username, token);
    return;
  }
  const token = await tokenRequest(platform, { code, grant_type: 'authorization_code', redirect_uri: `${process.env.PUBLIC_BASE_URL}/api/social/oauth/${platform}/callback` }, fetchImpl);
  const endpoint = platform === 'youtube' ? 'https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true'
    : 'https://open.tiktokapis.com/v2/user/info/?fields=open_id,display_name';
  const me = await json(await fetchImpl(endpoint, { headers: { Authorization: `Bearer ${token.access_token}` }, signal: AbortSignal.timeout(20_000) }), 'Hesap bilgisi');
  const account = platform === 'youtube' ? me.items?.[0] : me.data?.user;
  if (platform === 'youtube' && me.items?.length > 1) throw bad('Birden fazla kanal döndü. Google izin ekranında yayınlanacak YouTube kanalını seçerek tekrar bağlayın.');
  if (token.scope && definitions[platform].scope.split(platform === 'tiktok' ? ',' : ' ').some(scope => !token.scope.split(/[ ,]+/).includes(scope))) throw bad('Yayın izni verilmedi. Hesabı yeniden bağlayıp istenen izinlerin tamamını onaylayın.');
  if (!account) throw bad('Bu hesap için kanal bulunamadı.');
  const id = account.id || account.open_id;
  const previous = store.db.prepare('SELECT token FROM social_accounts WHERE platform=? AND remote_id=?').get(platform, id);
  token.refresh_token ||= previous && JSON.parse(previous.token).refresh_token;
  if (!token.refresh_token) throw bad('Kalıcı izin alınamadı. Hesabı yeniden yetkilendirin.');
  upsertAccount(store, platform, id, account.snippet?.title || account.display_name, account.snippet?.customUrl || account.display_name, token);
}
export async function accountToken(store, account, fetchImpl = fetch) {
  if (account.platform === 'x') return xAccessToken(store, fetchImpl, account.id);
  const fresh = store.db.prepare('SELECT * FROM social_accounts WHERE id=?').get(account.id);
  if (!fresh) throw bad('Hesap bağlantısı kaldırılmış.');
  const token = JSON.parse(fresh.token);
  if (token.expires_at > Date.now() + (account.platform === 'instagram' ? 7 * 86400_000 : 60_000)) return token.access_token;
  if (refreshes.has(account.id)) return refreshes.get(account.id);
  const pending = (async () => {
    const updated = account.platform === 'instagram' ? await instagramRefresh(token, fetchImpl)
      : await tokenRequest(account.platform, { grant_type: 'refresh_token', refresh_token: token.refresh_token }, fetchImpl);
    const merged = { ...token, ...updated, refresh_token: updated.refresh_token || token.refresh_token };
    if (!store.db.prepare('UPDATE social_accounts SET token=? WHERE id=? AND token=?').run(JSON.stringify(merged), account.id, fresh.token).changes) throw bad('Hesap bağlantısı değişti. Yeniden deneyin.');
    return merged.access_token;
  })();
  refreshes.set(account.id, pending);
  try { return await pending; } finally { refreshes.delete(account.id); }
}
export async function creatorInfo(store, account, fetchImpl = fetch) {
  const token = await accountToken(store, account, fetchImpl);
  return (await json(await fetchImpl('https://open.tiktokapis.com/v2/post/publish/creator_info/query/', { method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: '{}', signal: AbortSignal.timeout(20_000) }), 'TikTok hesap bilgisi')).data;
}
function uploadUrl(value, platform) {
  let url;
  try { url = new URL(value); } catch { throw bad('API güvenli bir yükleme adresi döndürmedi.'); }
  const allowed = platform === 'youtube' ? url.hostname === 'www.googleapis.com' : /(^|\.)tiktokapis\.com$/.test(url.hostname);
  if (url.protocol !== 'https:' || !allowed || url.username || url.password || (url.port && url.port !== '443')) throw bad('API yükleme adresi doğrulanamadı.');
  return url.href;
}
async function tikTokStatus(id, token, creator, kind, fetchImpl, wait) {
  for (let index = 0; index < 30; index++) {
    const result = await json(await fetchImpl('https://open.tiktokapis.com/v2/post/publish/status/fetch/', { method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ publish_id: id }), signal: AbortSignal.timeout(20_000) }), 'TikTok yayın durumu');
    if (result.data?.status === 'PUBLISH_COMPLETE') {
      const remote = result.data.publicaly_available_post_id?.[0];
      return { id: remote || id, url: remote ? `https://www.tiktok.com/@${encodeURIComponent(creator.creator_username)}/${kind}/${encodeURIComponent(remote)}` : null };
    }
    if (result.data?.status === 'FAILED') { const error = bad(`TikTok yayını başarısız: ${result.data.fail_reason || 'Medya reddedildi'}`); error.definite = true; throw error; }
    await wait(5000);
  }
  throw bad(`TikTok işleme sürüyor. Yayın kimliği: ${id}. Hesabı kontrol edin.`);
}
async function publishTikTokPhoto(store, account, token, post, media, fetchImpl, wait) {
  const options = JSON.parse(post.options);
  const creator = await creatorInfo(store, account, fetchImpl);
  if (!creator?.privacy_level_options?.includes(options.privacy)) throw bad('TikTok görünürlüğünü hesap bilgilerini yenileyerek seçin.');
  if (options.consent !== true) throw bad('TikTok müzik kullanım koşullarını kabul edin.');
  if (options.branded && options.privacy === 'SELF_ONLY') throw bad('Ücretli iş birliği gizli paylaşılamaz.');
  if (!/\.(jpg|webp)$/.test(media.stored_name)) throw bad('TikTok fotoğrafı için JPEG veya WebP seçin.');
  if (post.title.length > 90) throw bad('TikTok fotoğraf başlığı en fazla 90 karakter olmalı.');
  const imageUrl = deliveryUrl(media);
  try {
    const response = await fetchImpl('https://open.tiktokapis.com/v2/post/publish/content/init/', { method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(30_000),
      body: JSON.stringify({ post_mode: 'DIRECT_POST', media_type: 'PHOTO', is_aigc: Boolean(options.aiGenerated || media.ai_generated), post_info: { title: post.title, description: post.text,
        privacy_level: options.privacy, disable_comment: creator.comment_disabled || !options.allowComment, auto_add_music: Boolean(options.autoMusic),
        brand_organic_toggle: Boolean(options.ownBrand), brand_content_toggle: Boolean(options.branded) },
      source_info: { source: 'PULL_FROM_URL', photo_cover_index: 0, photo_images: [imageUrl] } }) });
    let result;
    try { result = await json(response, 'TikTok fotoğraf yayını'); }
    catch (error) { error.definite = response.status < 500 && response.status >= 400; throw error; }
    if (!result.data?.publish_id) throw bad('TikTok fotoğraf yayın kimliği alınamadı. Hesabınızı kontrol edin.');
    return await tikTokStatus(result.data.publish_id, token, creator, 'photo', fetchImpl, wait);
  } catch (error) { if (!error.definite) error.uncertain = true; throw error; }
}
export async function publishSocial(store, post, media, dataDir, fetchImpl = fetch, wait = delay) {
  const account = store.db.prepare('SELECT * FROM social_accounts WHERE id=?').get(post.account_id);
  if (!account || account.platform !== post.platform) throw bad('Bu platform için bağlı bir hesap seçin.');
  const token = await accountToken(store, account, fetchImpl);
  if (post.platform === 'x') {
    const id = await publishX(store, { account_id: account.id, text: post.text, url: '', media_kind: media ? media.kind === 'video' ? 'video' : media.ai_generated ? 'generated' : 'uploaded' : 'none', media_path: media?.stored_name }, dataDir, fetchImpl, wait);
    return { id, url: `https://x.com/i/status/${id}` };
  }
  if (post.platform === 'instagram') return publishInstagram(account, token, post, media, fetchImpl, wait);
  if (post.platform === 'tiktok' && media?.kind === 'image') return publishTikTokPhoto(store, account, token, post, media, fetchImpl, wait);
  if (!media || media.kind !== 'video') throw bad('YouTube ve TikTok video yayını için MP4 video seçin.');
  const path = join(dataDir, 'videos', media.stored_name);
  const size = await validateVideo(path);
  const options = JSON.parse(post.options);
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  if (post.platform === 'youtube') {
    const response = await fetchImpl('https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status', {
      method: 'POST', headers: { ...headers, 'X-Upload-Content-Type': 'video/mp4', 'X-Upload-Content-Length': String(size) },
      body: JSON.stringify({ snippet: { title: post.title, description: post.text, categoryId: '22' }, status: {
        privacyStatus: options.privacy || 'private', selfDeclaredMadeForKids: Boolean(options.madeForKids), containsSyntheticMedia: Boolean(options.aiGenerated)
      } }), signal: AbortSignal.timeout(30_000), redirect: 'error'
    });
    if (!response.ok) await json(response, 'YouTube video başlatma');
    const target = uploadUrl(response.headers.get('location'), 'youtube');
    try {
      const result = await json(await fetchImpl(target, { method: 'PUT', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'video/mp4', 'Content-Length': String(size) },
        body: await openAsBlob(path), signal: AbortSignal.timeout(300_000), redirect: 'error' }), 'YouTube video yükleme');
      if (!result.id) throw bad('YouTube video kimliği alınamadı.');
      const published = { id: result.id, url: `https://www.youtube.com/watch?v=${encodeURIComponent(result.id)}` };
      if (options.thumbnailId) {
        try {
          const thumbnail = store.db.prepare("SELECT * FROM media_library WHERE id=? AND kind='image'").get(options.thumbnailId);
          if (!thumbnail || !/\.(jpg|png)$/.test(thumbnail.stored_name)) throw bad('YouTube kapağı için JPEG veya PNG görsel seçin.');
          const imagePath = join(dataDir, 'images', thumbnail.stored_name);
          await validateImage(imagePath);
          await json(await fetchImpl(`https://www.googleapis.com/upload/youtube/v3/thumbnails/set?videoId=${encodeURIComponent(result.id)}&uploadType=media`, {
            method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': imageTypes[extname(thumbnail.stored_name)] },
            body: await openAsBlob(imagePath), signal: AbortSignal.timeout(45_000)
          }), 'YouTube kapak yükleme');
        } catch (error) { published.warning = `Video yayınlandı, kapak yüklenemedi: ${error.message}`; }
      }
      return published;
    } catch (error) { error.uncertain = true; throw error; }
  }
  const creator = await creatorInfo(store, account, fetchImpl);
  if (!creator?.privacy_level_options?.includes(options.privacy)) throw bad('TikTok görünürlüğünü hesap bilgilerini yenileyerek seçin.');
  if (!options.consent) throw bad('TikTok müzik kullanım koşullarını kabul edin.');
  if (!Number.isFinite(options.duration) || options.duration <= 0 || options.duration > creator.max_video_post_duration_sec) throw bad('TikTok video süresi hesap sınırına uygun olmalı. Önizlemeyi yükleyin.');
  if (options.branded && options.privacy === 'SELF_ONLY') throw bad('Ücretli iş birliği gizli paylaşılamaz.');
  const chunkSize = Math.min(size, 10_000_000);
  const count = Math.max(1, Math.floor(size / chunkSize));
  const init = await json(await fetchImpl('https://open.tiktokapis.com/v2/post/publish/video/init/', { method: 'POST', headers,
    body: JSON.stringify({ post_info: { title: post.text, privacy_level: options.privacy,
      disable_comment: creator.comment_disabled || !options.allowComment, disable_duet: creator.duet_disabled || !options.allowDuet, disable_stitch: creator.stitch_disabled || !options.allowStitch,
      brand_organic_toggle: Boolean(options.ownBrand), brand_content_toggle: Boolean(options.branded), is_aigc: Boolean(options.aiGenerated) },
    source_info: { source: 'FILE_UPLOAD', video_size: size, chunk_size: chunkSize, total_chunk_count: count } }), signal: AbortSignal.timeout(30_000) }), 'TikTok video başlatma');
  if (!init.data?.publish_id) throw bad('TikTok yayın kimliği alınamadı.');
  const id = init.data.publish_id;
  const target = uploadUrl(init.data.upload_url, 'tiktok');
  const file = await open(path, 'r');
  try {
    for (let index = 0; index < count; index++) {
      const start = index * chunkSize;
      const length = index === count - 1 ? size - start : chunkSize;
      const bytes = Buffer.alloc(length); await file.read(bytes, 0, length, start);
      const response = await fetchImpl(target, { method: 'PUT', headers: { 'Content-Type': 'video/mp4', 'Content-Length': String(length), 'Content-Range': `bytes ${start}-${start + length - 1}/${size}` },
        body: bytes, signal: AbortSignal.timeout(120_000), redirect: 'error' });
      if (!response.ok) throw bad('TikTok video aktarımı tamamlanamadı.');
    }
    return await tikTokStatus(id, token, creator, 'video', fetchImpl, wait);
  } catch (error) { if (!error.definite) error.uncertain = true; throw error; }
  finally { await file.close(); }
}
