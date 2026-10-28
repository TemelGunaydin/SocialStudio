import { bad } from './social-ai.mjs';
import { deliveryUrl } from './media-delivery.mjs';

export const instagramGraph = 'https://graph.instagram.com/v25.0';
export async function instagramJson(response) {
  const value = await response.json().catch(() => ({}));
  if (!response.ok || value.error) throw bad(`Instagram: ${value.error?.message || value.error_message || 'API isteği reddedildi.'}`);
  return value;
}
export async function instagramExchange(code, redirect, fetchImpl) {
  const short = await instagramJson(await fetchImpl('https://api.instagram.com/oauth/access_token', {
    method: 'POST', body: new URLSearchParams({ client_id: process.env.INSTAGRAM_CLIENT_ID, client_secret: process.env.INSTAGRAM_CLIENT_SECRET,
      grant_type: 'authorization_code', redirect_uri: redirect, code }), signal: AbortSignal.timeout(20_000)
  }));
  const access = short.access_token || short.data?.[0]?.access_token;
  if (!access) throw bad('Instagram erişim izni alınamadı.');
  const url = new URL('https://graph.instagram.com/access_token');
  url.search = new URLSearchParams({ grant_type: 'ig_exchange_token', client_secret: process.env.INSTAGRAM_CLIENT_SECRET, access_token: access });
  const token = await instagramJson(await fetchImpl(url.href, { signal: AbortSignal.timeout(20_000) }));
  if (!token.access_token || !Number(token.expires_in)) throw bad('Instagram kalıcı erişim izni alınamadı.');
  return { ...token, expires_at: Date.now() + Number(token.expires_in) * 1000 };
}
export async function instagramRefresh(token, fetchImpl) {
  if (token.expires_at <= Date.now()) throw bad('Instagram izni sona erdi. Sosyal hesaplardan yeniden bağlayın.');
  const url = new URL('https://graph.instagram.com/refresh_access_token');
  url.search = new URLSearchParams({ grant_type: 'ig_refresh_token', access_token: token.access_token });
  const updated = await instagramJson(await fetchImpl(url.href, { signal: AbortSignal.timeout(20_000) }));
  if (!updated.access_token || !Number(updated.expires_in)) throw bad('Instagram izni yenilenemedi. Hesabı yeniden bağlayın.');
  return { ...updated, expires_at: Date.now() + Number(updated.expires_in) * 1000 };
}
export async function publishInstagram(account, token, post, media, fetchImpl, wait) {
  if (!media) throw bad('Instagram için bir görsel veya Reels videosu seçin.');
  const options = JSON.parse(post.options);
  const reel = options.kind === 'reel';
  if (reel ? media.kind !== 'video' : media.kind !== 'image' || !/\.jpg$/i.test(media.stored_name)) throw bad(reel ? 'Reels için MP4 video seçin.' : 'Instagram gönderisi için JPEG görsel seçin.');
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/x-www-form-urlencoded' };
  const body = new URLSearchParams({ caption: post.text, ...(reel ? { media_type: 'REELS', video_url: deliveryUrl(media), share_to_feed: String(options.shareToFeed !== false) } : { image_url: deliveryUrl(media) }) });
  const container = await instagramJson(await fetchImpl(`${instagramGraph}/${encodeURIComponent(account.remote_id)}/media`, {
    method: 'POST', headers, body, signal: AbortSignal.timeout(30_000)
  }));
  if (!container.id) throw bad('Instagram medya hazırlama kimliği alınamadı.');
  let finished = false;
  for (let attempt = 0; attempt < 6; attempt++) {
    const state = await instagramJson(await fetchImpl(`${instagramGraph}/${encodeURIComponent(container.id)}?fields=status_code,status`, { headers, signal: AbortSignal.timeout(20_000) }));
    if (state.status_code === 'FINISHED') { finished = true; break; }
    if (['ERROR', 'EXPIRED'].includes(state.status_code)) throw bad(`Instagram medyayı hazırlayamadı: ${state.status || state.status_code}`);
    if (attempt < 5) await wait(60_000);
  }
  if (!finished) throw bad('Instagram medyayı 5 dakika içinde hazırlayamadı. Henüz yayın yapılmadı.');
  let published;
  try {
    const response = await fetchImpl(`${instagramGraph}/${encodeURIComponent(account.remote_id)}/media_publish`, {
      method: 'POST', headers, body: new URLSearchParams({ creation_id: container.id }), signal: AbortSignal.timeout(30_000)
    });
    try { published = await instagramJson(response); }
    catch (error) { error.definite = response.status >= 400 && response.status < 500; throw error; }
    if (!published.id) throw bad('Instagram yayın kimliği alınamadı. Hesabınızı kontrol edin.');
  } catch (error) { if (!error.definite) error.uncertain = true; throw error; }
  let url = null;
  try {
    const result = await instagramJson(await fetchImpl(`${instagramGraph}/${encodeURIComponent(published.id)}?fields=permalink`, { headers, signal: AbortSignal.timeout(20_000) }));
    if (/^https:\/\/(www\.)?instagram\.com\//.test(result.permalink)) url = result.permalink;
  } catch { /* Publication is already confirmed. Never repeat it for a missing permalink. */ }
  return { id: published.id, url };
}
