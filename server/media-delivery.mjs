import { createHmac, timingSafeEqual } from 'node:crypto';
import { bad } from './social-ai.mjs';

const lifetime = 3600;
export function deliveryReady() {
  try {
    const url = new URL(process.env.PUBLIC_BASE_URL);
    return url.protocol === 'https:' && !/^(localhost$|127\.|0\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.|\[)/i.test(url.hostname)
      && !/\.(local|localhost|ts\.net)$/i.test(url.hostname) && (process.env.SESSION_SECRET || '').length >= 32;
  } catch { return false; }
}
function signature(id, expires) {
  return createHmac('sha256', process.env.SESSION_SECRET).update(`social-delivery:${id}:${expires}`).digest('hex');
}
export function deliveryUrl(media) {
  if (!deliveryReady()) throw bad('Instagram ve TikTok fotoğrafları için PUBLIC_BASE_URL herkese açık HTTPS adresi olmalı. API kurulum rehberini açın.');
  const expires = String(Math.floor(Date.now() / 1000) + lifetime);
  const url = new URL(`/api/social/delivery/${media.id}`, process.env.PUBLIC_BASE_URL);
  url.search = new URLSearchParams({ expires, signature: signature(media.id, expires) });
  return url.href;
}
export function verifyDelivery(id, url) {
  const expires = url.searchParams.get('expires') || '';
  const supplied = url.searchParams.get('signature') || '';
  const now = Math.floor(Date.now() / 1000);
  if ((process.env.SESSION_SECRET || '').length < 32 || !/^\d{10}$/.test(expires) || Number(expires) <= now || Number(expires) > now + lifetime || !/^[a-f0-9]{64}$/.test(supplied)) return false;
  return timingSafeEqual(Buffer.from(supplied, 'hex'), Buffer.from(signature(id, expires), 'hex'));
}
