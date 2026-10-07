import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync, renameSync, mkdirSync, rmSync } from 'node:fs';
import { dirname } from 'node:path';

const bad = (message) => Object.assign(new Error(message), { status: 400 });
export function ownerConfigured(env = process.env) {
  return Boolean(env.ADMIN_PASSWORD_HASH || (env.ADMIN_PASSWORD && !env.ADMIN_PASSWORD.startsWith('change-this')));
}
export function hashPassword(password) {
  if (typeof password !== 'string' || password.length < 12 || password.length > 200) throw bad('En az 12, en fazla 200 karakterlik bir şifre belirleyin.');
  const salt = randomBytes(16).toString('hex');
  return `${salt}:${scryptSync(password, salt, 32).toString('hex')}`;
}
export function checkPassword(password, env = process.env) {
  if (env.ADMIN_PASSWORD_HASH) {
    const [salt, hash] = env.ADMIN_PASSWORD_HASH.split(':');
    if (!/^[a-f0-9]{32}$/.test(salt) || !/^[a-f0-9]{64}$/.test(hash)) return false;
    return timingSafeEqual(scryptSync(password, salt, 32), Buffer.from(hash, 'hex'));
  }
  return Boolean(env.ADMIN_PASSWORD) && timingSafeEqual(scryptSync(password, 'legacy-owner', 32), scryptSync(env.ADMIN_PASSWORD, 'legacy-owner', 32));
}

// Update only explicitly supplied keys, preserving unrelated settings/comments. Never log values.
export function saveConfig(path, changes, env = process.env) {
  let content = existsSync(path) ? readFileSync(path, 'utf8') : '';
  for (const [key, value] of Object.entries(changes)) {
    if (!/^[A-Z_]+$/.test(key) || typeof value !== 'string' || /[\r\n\u0000]/.test(value)) throw bad('Geçersiz ayar.');
    const line = `${key}=${JSON.stringify(value)}`;
    const pattern = new RegExp(`^(?:export\\s+)?${key}\\s*=.*$`, 'gm');
    if (pattern.test(content)) content = content.replace(pattern, () => line);
    else content += `${content.endsWith('\n') || !content ? '' : '\n'}${line}\n`;
  }
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const temporary = `${path}.${randomBytes(8).toString('hex')}.tmp`;
  try {
    writeFileSync(temporary, content, { flag: 'wx', mode: 0o600 });
    renameSync(temporary, path);
  } finally { rmSync(temporary, { force: true }); }
  Object.assign(env, changes);
}

export function configurationChanges(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw bad('Ayarlar geçersiz.');
  const changes = {};
  for (const key of ['OPENAI_API_KEY', 'X_CLIENT_ID', 'X_CLIENT_SECRET']) {
    if (input[key] === undefined || input[key] === '') continue; // Blank means keep, never erase a working key.
    if (typeof input[key] !== 'string' || !/^[A-Za-z0-9_~.+\/=-]{4,2048}$/.test(input[key])) throw bad(`${key} değerini başında/sonunda boşluk olmadan yapıştırın.`);
    changes[key] = input[key];
  }
  if (input.SCHEDULE_ENABLED !== undefined) {
    if (typeof input.SCHEDULE_ENABLED !== 'boolean') throw bad('Günlük üretim seçimi geçersiz.');
    changes.SCHEDULE_ENABLED = String(input.SCHEDULE_ENABLED);
  }
  return changes;
}
