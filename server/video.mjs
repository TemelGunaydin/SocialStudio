import { createReadStream, statSync } from 'node:fs';
import { open, mkdir, unlink } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';

// Deliberately smaller than X's account-dependent limits, to bound local disk and upload time.
export const maxVideoBytes = 100_000_000;
const bad = (message, status = 400) => Object.assign(new Error(message), { status });

export function videoPath(dataDir, filename) {
  if (typeof filename !== 'string' || !/^[a-f0-9-]{36}\.mp4$/.test(filename)) throw bad('Geçerli bir video seçin.');
  return join(dataDir, 'videos', filename);
}

// Check the MP4 container without depending on ffmpeg. X still validates codecs/duration.
export async function validateVideo(path) {
  const file = await open(path, 'r');
  try {
    const { size } = await file.stat();
    if (!size || size > maxVideoBytes) throw bad('Video 100 MB altında olmalı.');
    let position = 0;
    const found = new Set();
    const header = Buffer.alloc(16);
    let boxes = 0;
    while (position < size) {
      if (++boxes > 10_000) throw bad('MP4 yapısı desteklenmiyor; videoyu standart MP4 olarak dışa aktarın.');
      if (size - position < 8) throw bad('MP4 dosyası eksik veya bozuk.');
      await file.read(header, 0, 16, position);
      let length = header.readUInt32BE(0);
      const kind = header.toString('ascii', 4, 8);
      let headerSize = 8;
      if (length === 1) {
        if (size - position < 16) throw bad('MP4 dosyası eksik veya bozuk.');
        const large = header.readBigUInt64BE(8);
        if (large > BigInt(size)) throw bad('MP4 dosyası eksik veya bozuk.');
        length = Number(large); headerSize = 16;
      } else if (length === 0) length = size - position;
      if (length < headerSize || length > size - position) throw bad('MP4 dosyası eksik veya bozuk.');
      if (position === 0 && (kind !== 'ftyp' || length < 16)) throw bad('MP4 video yükleyin (H.264/AAC önerilir).');
      found.add(kind);
      position += length;
    }
    if (!found.has('moov') || !found.has('mdat')) throw bad('MP4 içinde video verisi bulunamadı.');
    return size;
  } finally { await file.close(); }
}

export async function saveVideo(req, dataDir) {
  if (req.headers['content-type']?.split(';')[0] !== 'video/mp4') throw bad('MP4 video yükleyin.');
  const declared = Number(req.headers['content-length']);
  if (declared > maxVideoBytes) { req.resume(); throw bad('Video 100 MB altında olmalı.', 413); }
  await mkdir(join(dataDir, 'videos'), { recursive: true, mode: 0o700 });
  const filename = `${randomUUID()}.mp4`;
  const path = videoPath(dataDir, filename);
  const file = await open(path, 'wx', 0o600);
  let size = 0;
  try {
    try {
      // Keep the socket available for a clear size-limit error on chunked requests.
      for await (const chunk of req.iterator({ destroyOnReturn: false })) {
        size += chunk.length;
        if (size > maxVideoBytes) { req.resume(); throw bad('Video 100 MB altında olmalı.', 413); }
        await file.writeFile(chunk);
      }
    } finally { await file.close(); }
    await validateVideo(path);
    return filename;
  } catch (error) { await unlink(path).catch(() => {}); throw error; }
}

export function serveVideo(req, res, dataDir, filename) {
  const path = videoPath(dataDir, filename);
  let size;
  try { size = statSync(path).size; }
  catch { res.writeHead(404); return res.end(); }
  const headers = { 'Content-Type': 'video/mp4', 'Accept-Ranges': 'bytes', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };
  let start = 0;
  let end = size - 1;
  if (req.headers.range) {
    const range = req.headers.range.match(/^bytes=(\d*)-(\d*)$/);
    if (range && (range[1] || range[2])) {
      if (!range[1]) start = Math.max(0, size - Number(range[2]));
      else { start = Number(range[1]); if (range[2]) end = Math.min(end, Number(range[2])); }
    }
    if (!range || (!range[1] && !range[2]) || !Number.isSafeInteger(start) || !Number.isSafeInteger(end)
        || start > end || start >= size) {
      res.writeHead(416, { ...headers, 'Content-Range': `bytes */${size}` }); return res.end();
    }
    headers['Content-Range'] = `bytes ${start}-${end}/${size}`;
  }
  res.writeHead(req.headers.range ? 206 : 200, { ...headers, 'Content-Length': end - start + 1 });
  if (req.method === 'HEAD') return res.end();
  const stream = createReadStream(path, { start, end });
  stream.on('error', () => res.destroy());
  res.on('close', () => stream.destroy());
  stream.pipe(res);
}
