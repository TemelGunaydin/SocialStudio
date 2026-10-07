import { resolve4 } from 'node:dns/promises';
import { request } from 'node:https';
import { isIP } from 'node:net';

function problem(message, status = 400) { return Object.assign(new Error(message), { status }); }

export function publicHttpsUrl(input) {
  let url;
  try { url = new URL(input); } catch { throw problem('Geçerli bir HTTPS ürün bağlantısı girin.'); }
  if (typeof input !== 'string' || input.length > 2000 || /[\u0000-\u001f\u007f]/.test(input)
      || url.protocol !== 'https:' || url.port || url.username || url.password || !url.hostname
      || isIP(url.hostname) || url.hostname.startsWith('[')) {
    throw problem('Yalnızca herkese açık HTTPS ürün sayfaları okunabilir (port, IP ve giriş bilgisi kullanmayın).');
  }
  url.hash = '';
  return url;
}

export function publicIPv4(address) {
  if (isIP(address) !== 4) return false;
  const [a, b, c] = address.split('.').map(Number);
  // Block non-global ranges, including cloud metadata, CGNAT, test networks and multicast.
  if (a === 0 || a === 10 || a === 127 || a >= 224 || a === 169 && b === 254
      || a === 172 && b >= 16 && b <= 31 || a === 192 && (b === 168 || b === 0 && c === 0)
      || a === 100 && b >= 64 && b <= 127 || a === 198 && (b === 18 || b === 19)
      || a === 192 && b === 88 && c === 99
      || a === 192 && b === 0
      || a === 198 && b === 51 && c === 100 || a === 203 && b === 0 && c === 113) return false;
  return true;
}

export async function resolvePublicHost(hostname, resolveImpl = resolve4) {
  let addresses;
  try { addresses = await resolveImpl(hostname); }
  catch { throw problem('Siteye ulaşılamadı. Adresi kontrol edin veya bilgileri elle girin.', 422); }
  if (!addresses.length || addresses.some((address) => !publicIPv4(address))) {
    throw problem('Bu adres güvenli bir herkese açık web sitesine ait değil. Bilgileri elle girin.');
  }
  return addresses[0];
}

export function pinnedLookup(address) {
  return (_host, options, callback) => {
    if (options.all) callback(null, [{ address, family: 4 }]);
    else callback(null, address, 4);
  };
}

function getHtml(url, address) {
  return new Promise((resolve, reject) => {
    const req = request(url, {
      method: 'GET', agent: false, timeout: 8000,
      lookup: pinnedLookup(address),
      headers: { 'Accept': 'text/html', 'Accept-Encoding': 'identity', 'User-Agent': 'SocialStudio/1.0 (user-requested project import)' }
    }, (res) => {
      res.on('error', reject);
      if ([301, 302, 303, 307, 308].includes(res.statusCode)) {
        const location = res.headers.location;
        res.destroy();
        return location ? resolve({ redirect: location }) : reject(problem('Yönlendirme adresi bulunamadı.', 422));
      }
      if (res.statusCode !== 200) { res.destroy(); return reject(problem(`Ürün sayfası HTTP ${res.statusCode} döndürdü. Bilgileri elle girin.`, 422)); }
      if (!String(res.headers['content-type'] || '').toLowerCase().includes('text/html')
          || res.headers['content-encoding'] && res.headers['content-encoding'] !== 'identity') {
        res.destroy(); return reject(problem('Sayfa okunabilir HTML döndürmedi. Bilgileri elle girin.', 422));
      }
      let size = 0;
      const chunks = [];
      if (Number(res.headers['content-length']) > 350_000) {
        res.destroy(); return reject(problem('Sayfa çok büyük. Bilgileri elle girin.', 422));
      }
      res.on('data', (chunk) => {
        size += chunk.length;
        if (size > 350_000) { req.destroy(problem('Sayfa çok büyük. Bilgileri elle girin.', 422)); return; }
        chunks.push(chunk);
      });
      res.on('end', () => resolve({ html: Buffer.concat(chunks).toString('utf8') }));
    });
    const timer = setTimeout(() => req.destroy(problem('Site zaman aşımına uğradı. Bilgileri elle girin.', 422)), 10_000);
    timer.unref();
    req.on('close', () => clearTimeout(timer));
    req.on('timeout', () => req.destroy(problem('Site zaman aşımına uğradı. Bilgileri elle girin.', 422)));
    req.on('error', reject);
    req.end();
  });
}

export async function loadPublicPage(input, resolveImpl = resolve4, getImpl = getHtml) {
  let url = publicHttpsUrl(input);
  for (let hop = 0; hop < 4; hop++) {
    const address = await resolvePublicHost(url.hostname, resolveImpl);
    let result;
    try { result = await getImpl(url, address); }
    catch (error) {
      if (error.status) throw error;
      throw problem('Siteye güvenli bağlantı kurulamadı. Adresi kontrol edin veya bilgileri elle girin.', 422);
    }
    if (!result.redirect) return { url: url.href, text: pageText(result.html) };
    url = publicHttpsUrl(new URL(result.redirect, url).href);
  }
  throw problem('Site çok fazla yönlendirme yaptı. Bilgileri elle girin.', 422);
}

export function pageText(html) {
  if (typeof html !== 'string') throw problem('Sayfa içeriği okunamadı.', 422);
  const decode = (value) => value.replace(/&(?:amp|lt|gt|quot|apos|nbsp|#(\d+)|#x([0-9a-f]+));/gi,
    (entity, decimal, hex) => {
      if (decimal || hex) {
        const code = decimal ? Number(decimal) : parseInt(hex, 16);
        return code <= 0x10ffff ? String.fromCodePoint(code) : entity;
      }
      return ({ '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&apos;': "'", '&nbsp;': ' ' })[entity.toLowerCase()] || entity;
    });
  const descriptions = [...html.matchAll(/<meta\b[^>]*>/gi)].flatMap(([tag]) => {
    const kind = tag.match(/(?:name|property)\s*=\s*["']([^"']+)["']/i)?.[1]?.toLowerCase();
    const content = tag.match(/content\s*=\s*["']([^"']+)["']/i)?.[1];
    return ['description', 'og:title', 'og:description'].includes(kind) && content ? [content] : [];
  });
  const cleaned = html.replace(/<\s*(script|style|svg|nav|footer|header|noscript|iframe|form)\b[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, ' ')
    .replace(/<[^>]*>/g, ' ');
  const text = decode([...descriptions, cleaned].join(' ')).replace(/\s+/g, ' ').trim().slice(0, 20_000);
  if (text.length < 80) throw problem('Sayfada yeterli okunabilir ürün bilgisi bulunamadı. Bilgileri elle girin.', 422);
  return text;
}
