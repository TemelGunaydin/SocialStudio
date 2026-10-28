import { readFile, mkdir, writeFile, unlink, stat } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { join, extname } from 'node:path';
import { bad } from './social-ai.mjs';

export const maxImageBytes = 5_000_000;
export const imageTypes = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' };
export function validateImageBytes(bytes, extension) {
  const type = imageTypes[extension.toLowerCase()];
  if (!bytes.length || bytes.length > maxImageBytes) throw bad('Görsel 5 MB altında olmalı.');
  const valid = type === 'image/jpeg' ? bytes.length > 4 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255 && bytes.at(-2) === 255 && bytes.at(-1) === 217
    : type === 'image/png' ? bytes.length >= 33 && bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) && bytes.toString('ascii', 12, 16) === 'IHDR' && bytes.readUInt32BE(16) > 0 && bytes.readUInt32BE(20) > 0
    : type === 'image/webp' ? bytes.length >= 20 && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP' && bytes.readUInt32LE(4) + 8 === bytes.length : false;
  if (!valid) throw bad('Geçerli bir JPEG, PNG veya WebP görseli seçin. Dosyanın uzantısı içeriğiyle eşleşmeli.');
  return bytes.length;
}
export async function validateImage(path) {
  if ((await stat(path)).size > maxImageBytes) throw bad('Görsel 5 MB altında olmalı.');
  return validateImageBytes(await readFile(path), extname(path));
}
export async function saveImage(req, dataDir) {
  const type = req.headers['content-type']?.split(';')[0];
  const extension = Object.keys(imageTypes).find(key => imageTypes[key] === type);
  if (!extension) throw bad('JPEG, PNG veya WebP görseli yükleyin.');
  if (Number(req.headers['content-length']) > maxImageBytes) { req.resume(); throw bad('Görsel 5 MB altında olmalı.', 413); }
  const chunks = []; let size = 0;
  for await (const chunk of req.iterator({ destroyOnReturn: false })) {
    size += chunk.length;
    if (size > maxImageBytes) { req.resume(); throw bad('Görsel 5 MB altında olmalı.', 413); }
    chunks.push(chunk);
  }
  const bytes = Buffer.concat(chunks);
  validateImageBytes(bytes, extension);
  await mkdir(join(dataDir, 'images'), { recursive: true, mode: 0o700 });
  const stored = `${randomUUID()}${extension}`;
  try { await writeFile(join(dataDir, 'images', stored), bytes, { flag: 'wx', mode: 0o600 }); }
  catch (error) { await unlink(join(dataDir, 'images', stored)).catch(() => {}); throw error; }
  return { stored, size };
}
