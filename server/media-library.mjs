import { randomUUID } from 'node:crypto';
import { copyFile, readdir, lstat, realpath, mkdir, link, unlink, open } from 'node:fs/promises';
import { join, resolve, basename, isAbsolute, dirname } from 'node:path';
import { constants } from 'node:fs';
import { homedir } from 'node:os';
import { validateVideo, maxVideoBytes } from './video.mjs';
import { bad } from './social-ai.mjs';

export async function listFolders(input = '') {
  if (typeof input !== 'string' || (input.trim() && !isAbsolute(input.trim()))) throw bad('Geçerli bir klasör yolu seçin.');
  const folder = await realpath(input.trim() || homedir()).catch(() => { throw bad('Klasör bulunamadı veya erişilemiyor.'); });
  let entries;
  try { entries = await readdir(folder, { withFileTypes: true }); }
  catch { throw bad('Bu klasör açılamıyor. Başka bir klasör seçin.'); }
  const parent = dirname(folder);
  return { folder, parent: parent === folder ? null : parent,
    folders: entries.filter(entry => entry.isDirectory() && !entry.name.startsWith('.'))
      .sort((a, b) => a.name.localeCompare(b.name, 'tr')).map(entry => ({ name: entry.name, path: join(folder, entry.name) })) };
}

export function insertMedia(store, { name, source = null, stored, kind, size }) {
  const id = randomUUID();
  store.db.prepare('INSERT INTO media_library (id,name,source_path,stored_name,kind,size,created_at) VALUES (?,?,?,?,?,?,?)')
    .run(id, name.slice(0, 240), source, stored, kind, size, new Date().toISOString());
  return store.db.prepare('SELECT * FROM media_library WHERE id = ?').get(id);
}
export async function scanFolder(store, dataDir, input) {
  if (typeof input !== 'string' || !isAbsolute(input.trim())) throw bad('Bu bilgisayardaki klasörün tam yolunu girin.');
  const folder = await realpath(input.trim()).catch(() => { throw bad('Klasör bulunamadı veya erişilemiyor.'); });
  if (!(await lstat(folder)).isDirectory()) throw bad('Bir klasör yolu girin.');
  const entries = await readdir(folder, { withFileTypes: true });
  const skipped = [];
  let imported = 0;
  await mkdir(join(dataDir, 'videos'), { recursive: true, mode: 0o700 });
  // Only top-level regular MP4s. Archived folders and symlinks are never scanned.
  for (const entry of entries.filter(item => item.isFile() && /\.mp4$/i.test(item.name)).slice(0, 500)) {
    const source = join(folder, entry.name);
    if (store.db.prepare('SELECT 1 FROM media_library WHERE source_path = ?').get(source)) continue;
    const stored = `${randomUUID()}.mp4`;
    const target = join(dataDir, 'videos', stored);
    try {
      const info = await lstat(source);
      if (!info.isFile() || info.isSymbolicLink() || !info.size || info.size > maxVideoBytes) throw bad('Video 100 MB altında, normal bir MP4 dosyası olmalı.');
      await copyFile(source, target, constants.COPYFILE_EXCL);
      const size = await validateVideo(target);
      insertMedia(store, { name: entry.name, source, stored, kind: 'video', size });
      imported++;
    } catch (error) {
      await unlink(target).catch(() => {});
      skipped.push({ name: entry.name, error: error.message });
    }
  }
  store.setSetting.run('social_folder', folder);
  return { imported, skipped, folder };
}
async function identical(a, b) {
  const left = await open(a, 'r');
  const right = await open(b, 'r');
  try {
    const size = (await left.stat()).size;
    if ((await right.stat()).size !== size) return false;
    const aa = Buffer.alloc(1024 * 1024), bb = Buffer.alloc(1024 * 1024);
    for (let pos = 0; pos < size; pos += aa.length) {
      const count = Math.min(aa.length, size - pos);
      await left.read(aa, 0, count, pos); await right.read(bb, 0, count, pos);
      if (!aa.subarray(0, count).equals(bb.subarray(0, count))) return false;
    }
    return true;
  } finally { await left.close(); await right.close(); }
}
export async function archiveMedia(store, dataDir, mediaId) {
  const media = store.db.prepare('SELECT * FROM media_library WHERE id = ?').get(mediaId);
  if (!media || media.status === 'published') return;
  const posts = store.db.prepare('SELECT status FROM social_posts WHERE media_id = ?').all(mediaId);
  // A shared asset moves only after every attached post succeeded.
  if (!posts.length || posts.some(post => post.status !== 'published')) return;
  try {
    let archivedSource = media.source_path;
    if (media.source_path) {
      const source = resolve(media.source_path);
      const sourceInfo = await lstat(source).catch(error => { if (error.code === 'ENOENT') return null; throw error; });
      const preview = join(dataDir, 'videos', media.stored_name);
      if (sourceInfo && (!sourceInfo.isFile() || sourceInfo.isSymbolicLink() || !(await identical(source, preview)))) throw bad('Kaynak video değişmiş; orijinal taşınmadı.');
      const archive = join(dirname(source), 'paylasildi');
      await mkdir(archive, { recursive: true });
      if ((await lstat(archive)).isSymbolicLink()) throw bad('Arşiv klasörü sembolik bağlantı olamaz.');
      const destination = join(archive, `${media.id}-${basename(source)}`);
      const destinationInfo = await lstat(destination).catch(error => { if (error.code === 'ENOENT') return null; throw error; });
      if (destinationInfo) {
        // Recover a stop between linking, unlinking, and recording the completed move.
        if (!destinationInfo.isFile() || destinationInfo.isSymbolicLink() || !(await identical(destination, preview))
            || (sourceInfo && (sourceInfo.ino !== destinationInfo.ino || sourceInfo.dev !== destinationInfo.dev))) throw bad('Arşiv hedefi zaten var; dosyaların üzerine yazılmadı.');
      } else {
        if (!sourceInfo) throw bad('Kaynak video bulunamadı.');
        // Hard-link then unlink is no-clobber and stays on the source volume.
        await link(source, destination);
      }
      if (sourceInfo) await unlink(source);
      archivedSource = destination;
    }
    store.db.prepare("UPDATE media_library SET status = 'published', source_path = ?, error = NULL WHERE id = ?").run(archivedSource, mediaId);
  } catch (error) {
    store.db.prepare('UPDATE media_library SET error = ? WHERE id = ?').run(`Yayın tamamlandı, arşivleme bekliyor: ${error.message}`, mediaId);
  }
}
