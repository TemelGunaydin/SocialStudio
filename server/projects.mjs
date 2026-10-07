// Project claims are entered and reviewed by the owner; no arbitrary URL is fetched.
export function parseProject(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Proje bilgileri gerekli.');
  const field = (key, max) => {
    if (typeof input[key] !== 'string' || !input[key].trim() || input[key].trim().length > max) {
      throw new Error(`${key} alanı gerekli (en fazla ${max} karakter).`);
    }
    return input[key].trim();
  };
  const name = field('name', 80);
  const category = field('category', 60);
  const platform = field('platform', 60);
  const raw = field('url', 2000);
  let url;
  try { url = new URL(raw); } catch { throw new Error('Geçerli bir HTTPS ürün bağlantısı girin.'); }
  if (url.protocol !== 'https:' || !url.hostname || url.username || url.password || /[\u0000-\u001f\u007f]/.test(raw)) {
    throw new Error('Kimlik bilgisi içermeyen bir HTTPS ürün bağlantısı girin.');
  }
  const features = typeof input.features === 'string' ? input.features.split(/\r?\n/).map((item) => item.trim()).filter(Boolean) : [];
  if (features.length < 1 || features.length > 12 || features.some((feature) => feature.length > 240)) {
    throw new Error('Her satıra bir doğrulanmış özellik yazın (1–12 satır, satır başına en fazla 240 karakter).');
  }
  const guardrail = typeof input.guardrail === 'string' ? input.guardrail.trim() : '';
  if (guardrail.length > 500) throw new Error('Dikkat notu en fazla 500 karakter olabilir.');
  url.hash = '';
  return { name, category, platform, url: url.href, features, guardrail,
    icon: '/favicon.svg', color: '#dcece2' };
}

export function projectFromRow(row) {
  if (!row) return null;
  return { ...row, features: JSON.parse(row.features) };
}
