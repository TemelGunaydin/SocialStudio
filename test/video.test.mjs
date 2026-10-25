import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync, readdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { request as httpRequest } from 'node:http';
import { setTimeout as delay } from 'node:timers/promises';
import { openStore } from '../server/db.mjs';
import { publish } from '../server/x.mjs';
import { validateVideo, videoPath } from '../server/video.mjs';

const root = resolve(import.meta.dirname, '..');
function box(type, payload = Buffer.alloc(0)) {
  const header = Buffer.alloc(8); header.writeUInt32BE(8 + payload.length); header.write(type, 4);
  return Buffer.concat([header, payload]);
}
const mp4 = (size = 32) => Buffer.concat([box('ftyp', Buffer.from('isom0000')), box('moov'), box('mdat', Buffer.alloc(size, 42))]);
function fixture() {
  const dir = mkdtempSync(join(tmpdir(), 'studio-video-x-'));
  mkdirSync(join(dir, 'videos'));
  const store = openStore(dir);
  store.setSetting.run('x_token', JSON.stringify({ access_token: 'fake-test-token', expires_at: Date.now() + 3600_000, user: { id: '1', username: 'fake' } }));
  const filename = `${randomUUID()}.mp4`;
  return { dir, store, filename, path: videoPath(dir, filename), draft: {
    text: 'A local product preview.', url: 'https://example.com/', media_kind: 'video', media_path: filename
  } };
}

test('MP4 validation rejects missing data, non-MP4 files, corrupt boxes and unsafe paths', async () => {
  const { dir, store, path } = fixture();
  try {
    const valid = mp4(); writeFileSync(path, valid);
    assert.equal(await validateVideo(path), valid.length);
    for (const bytes of [Buffer.alloc(0), Buffer.from('not a video'), box('ftyp', Buffer.from('isom0000')), Buffer.concat([mp4(), Buffer.from('broken')])]) {
      writeFileSync(path, bytes); await assert.rejects(validateVideo(path), { status: 400 });
    }
    const badSize = mp4(); badSize.writeUInt32BE(0xfffffff0, 0);
    writeFileSync(path, badSize); await assert.rejects(validateVideo(path), /bozuk/);
    for (const name of ['../../private.mp4', 'test.mp4', null, '../secret', `${randomUUID()}.jpg`]) assert.throws(() => videoPath(dir, name));
  } finally { store.db.close(); rmSync(dir, { recursive: true, force: true }); }
});

test('approved X video is uploaded in ordered binary chunks and processed before exactly one post', async () => {
  const { dir, store, path, draft } = fixture();
  try {
    const bytes = mp4(4 * 1024 * 1024 + 17); writeFileSync(path, bytes);
    const calls = []; const chunks = []; const waits = [];
    let polls = 0;
    const fake = async (url, options) => {
      calls.push({ url, options });
      assert.equal(options.headers.Authorization, 'Bearer fake-test-token');
      if (url.endsWith('/initialize')) {
        assert.deepEqual(JSON.parse(options.body), { media_type: 'video/mp4', media_category: 'tweet_video', total_bytes: bytes.length });
        return Response.json({ data: { id: '456' } });
      }
      if (url.endsWith('/append')) {
        assert.equal(options.body.get('segment_index'), String(chunks.length));
        assert.equal(options.headers['Content-Type'], undefined, 'fetch must set multipart boundary');
        chunks.push(Buffer.from(await options.body.get('media').arrayBuffer()));
        return new Response(null, { status: 204 });
      }
      if (url.endsWith('/finalize')) return Response.json({ data: { id: '456', processing_info: { state: 'pending', check_after_secs: 2 } } });
      if (url.includes('command=STATUS')) {
        assert.equal(url, 'https://api.x.com/2/media/upload?command=STATUS&media_id=456');
        return Response.json({ data: { processing_info: ++polls === 1 ? { state: 'in_progress', check_after_secs: 0 } : { state: 'succeeded' } } });
      }
      assert.equal(polls, 2, 'no post before processing succeeds');
      assert.equal(url, 'https://api.x.com/2/tweets');
      assert.deepEqual(JSON.parse(options.body), { text: `${draft.text}\n\n${draft.url}`, media: { media_ids: ['456'] } });
      return Response.json({ data: { id: '789' } }, { status: 201 });
    };
    assert.equal(await publish(store, draft, dir, fake, async (ms) => { waits.push(ms); }), '789');
    assert.deepEqual(Buffer.concat(chunks), bytes);
    assert.equal(chunks[0].length, 4 * 1024 * 1024);
    assert.equal(chunks.length, 2);
    assert.deepEqual(waits, [2000, 0]);
    assert.equal(calls.filter((call) => call.url.endsWith('/tweets')).length, 1);
  } finally { store.db.close(); rmSync(dir, { recursive: true, force: true }); }
});

test('X video failures, malformed processing and timeouts never create a post', async () => {
  for (const mode of ['init', 'append', 'finalize', 'failed', 'timeout', 'unknown', 'missing-status', 'invalid-delay']) {
    const { dir, store, path, draft } = fixture();
    writeFileSync(path, mp4());
    let posted = false; let polls = 0;
    try {
      const fake = async (url) => {
        if (url.endsWith('/tweets')) { posted = true; throw new Error('Must not post'); }
        if (url.endsWith('/initialize')) return Response.json(mode === 'init' ? { data: {} } : { data: { id: '123' } });
        if (url.endsWith('/append')) {
          if (mode === 'append') throw new Error('Upload disconnected');
          return new Response(null, { status: 204 });
        }
        if (mode === 'finalize') return Response.json({ detail: 'Bad video' }, { status: 400 });
        if (url.includes('STATUS')) polls++;
        const processing = mode === 'failed' ? { state: 'failed', error: { message: 'Unsupported codec' } }
          : mode === 'unknown' ? { state: 'unexpected' } : { state: 'pending', check_after_secs: mode === 'invalid-delay' ? -1 : 0 };
        return Response.json(mode === 'missing-status' && polls ? { data: {} } : { data: { processing_info: processing } });
      };
      await assert.rejects(publish(store, draft, dir, fake, async () => {}), (error) => !error.uncertain, mode);
      assert.equal(posted, false, mode);
      assert.ok(polls <= 30, 'polling is bounded');
    } finally { store.db.close(); rmSync(dir, { recursive: true, force: true }); }
  }
});

test('X accepts finalized video without async processing, but ambiguous post responses stay uncertain', async () => {
  for (const mode of ['ready', 'network', 'server', 'missing-id']) {
    const { dir, store, path, draft } = fixture(); writeFileSync(path, mp4());
    try {
      const fake = async (url) => {
        if (url.endsWith('/initialize')) return Response.json({ data: { id: '123' } });
        if (url.endsWith('/append')) return new Response(null, { status: 204 });
        if (url.endsWith('/finalize')) return Response.json({ data: { id: '123' } });
        assert.equal(url, 'https://api.x.com/2/tweets');
        if (mode === 'network') throw new Error('Lost post response');
        if (mode === 'server') return Response.json({ detail: 'Internal error' }, { status: 503 });
        return Response.json(mode === 'missing-id' ? {} : { data: { id: '789' } });
      };
      if (mode === 'ready') assert.equal(await publish(store, draft, dir, fake), '789');
      else await assert.rejects(publish(store, draft, dir, fake), (error) => error.uncertain === true);
    } finally { store.db.close(); rmSync(dir, { recursive: true, force: true }); }
  }
});

test('a restart during video publication preserves the attachment and blocks automatic retries', () => {
  const { dir, store, draft } = fixture();
  const id = randomUUID();
  store.create.run(id, 'notes', 'A feature', draft.text, draft.url, null, '2026-01-01', '2026-01-01');
  store.edit.run(draft.text, 'video', draft.media_path, null, '2026-01-01', id);
  store.markPublishing.run('2026-01-02', '2026-01-02', id);
  store.db.close();
  const reopened = openStore(dir);
  try {
    const saved = reopened.get.get(id);
    assert.equal(saved.status, 'uncertain');
    assert.equal(saved.media_kind, 'video');
    assert.equal(saved.media_path, draft.media_path);
    assert.equal(reopened.markPublishing.run('2026-01-03', '2026-01-03', id).changes, 0);
    assert.equal(reopened.edit.run('Do not retry', 'none', null, null, '2026-01-03', id).changes, 0);
  } finally { reopened.db.close(); rmSync(dir, { recursive: true, force: true }); }
});

test('X video storage/preview is authenticated, survives restart, and only explicit approval calls X', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'studio-video-http-'));
  const log = join(dir, 'requests.jsonl');
  const preload = join(dir, 'fake-provider.mjs');
  writeFileSync(preload, `import { appendFileSync } from 'node:fs';
    globalThis.fetch = async (url, options) => {
      appendFileSync(${JSON.stringify(log)}, JSON.stringify({ url }) + '\\n');
      if (url.endsWith('/usage/credits')) return Response.json({ data: { total_balance: 0, prepaid_balance: 0, free_balance: 0 } });
      if (url.endsWith('/initialize')) return Response.json({ data: { id: '123' } });
      if (url.endsWith('/append')) return new Response(null, { status: 204 });
      if (url.endsWith('/finalize')) return Response.json({ data: { id: '123' } });
      if (url.endsWith('/tweets')) { await new Promise(r => setTimeout(r, 150)); return Response.json({ data: { id: '456' } }); }
      throw new Error('Unexpected external request: ' + url);
    };`);
  const id = randomUUID();
  const initial = openStore(dir);
  initial.addProject.run('notes', 'Notes', 'Productivity', 'Mac', 'https://example.com/', '/favicon.svg', '#abcdef', '["Local notes"]', '');
  initial.create.run(id, 'notes', 'Manual draft', 'A useful product.', 'https://example.com/', null, new Date().toISOString(), new Date().toISOString());
  initial.setSetting.run('x_token', JSON.stringify({ access_token: 'fake-token', expires_at: Date.now() + 3600_000, user: { id: '1', username: 'fake' } }));
  initial.db.close();
  const port = 35000 + Math.floor(Math.random() * 15000); const base = `http://localhost:${port}`;
  let server;
  async function stop() { if (!server || server.exitCode !== null) return; const end = once(server, 'exit'); server.kill('SIGTERM'); await end; }
  async function start() {
    server = spawn(process.execPath, ['--import', preload, 'server/index.mjs'], { cwd: root, stdio: 'pipe', env: {
      ...process.env, STUDIO_HOME: dir, STUDIO_READY_FILE: '', DATA_DIR: dir, PORT: String(port), HOST: '127.0.0.1', PUBLIC_BASE_URL: base,
      ADMIN_PASSWORD_HASH: '', ADMIN_PASSWORD: 'test-password', SESSION_SECRET: 'test-session-secret-at-least-32-characters',
      OPENAI_API_KEY: '', X_CLIENT_ID: '', X_CLIENT_SECRET: '', SCHEDULE_ENABLED: 'false'
    } });
    let errors = ''; server.stdout.resume(); server.stderr.on('data', (chunk) => { errors += chunk; });
    for (let i = 0; i < 80; i++) {
      if (server.exitCode !== null) throw new Error(errors);
      try { if ((await fetch(`${base}/api/health`)).ok) return; } catch {} await delay(50);
    }
    throw new Error('Server not ready');
  }
  try {
    await start();
    const login = await fetch(`${base}/api/login`, { method: 'POST', headers: { Origin: base, 'Content-Type': 'application/json' }, body: JSON.stringify({ password: 'test-password' }) });
    const headers = { Cookie: login.headers.get('set-cookie').split(';')[0], Origin: base };
    const upload = `/api/drafts/${id}/video/upload`;
    const bytes = mp4();
    const post = (path, body = {}, customHeaders = {}) => fetch(`${base}${path}`, { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json', ...customHeaders }, body: Buffer.isBuffer(body) ? body : JSON.stringify(body) });
    assert.equal((await fetch(`${base}${upload}`, { method: 'POST', headers: { Origin: base, 'Content-Type': 'video/mp4' }, body: bytes })).status, 401);
    assert.equal((await post(upload, bytes, { Origin: 'https://other.example', 'Content-Type': 'video/mp4' })).status, 403);
    assert.equal((await post(upload, bytes)).status, 400);
    assert.equal((await post(upload, Buffer.from('not MP4'), { 'Content-Type': 'video/mp4' })).status, 400);
    assert.deepEqual(readdirSync(join(dir, 'videos')), [], 'failed upload is removed');
    const response = await post(upload, bytes, { 'Content-Type': 'video/mp4' });
    assert.equal(response.status, 200);
    const draft = (await response.json()).draft;
    assert.equal(draft.media_kind, 'video');
    assert.equal(draft.status, 'draft');
    assert.equal(draft.approved_at, null);
    assert.equal(draft.text, 'A useful product.');
    assert.deepEqual(readFileSync(videoPath(dir, draft.media_path)), bytes);
    assert.equal(existsSync(log), false, 'selection never calls X');
    const preview = `${base}/api/videos/${draft.media_path}`;
    assert.equal((await fetch(preview)).status, 401);
    const full = await fetch(preview, { headers });
    assert.equal(full.headers.get('content-type'), 'video/mp4');
    assert.deepEqual(Buffer.from(await full.arrayBuffer()), bytes);
    const range = await fetch(preview, { headers: { ...headers, Range: 'bytes=4-11' } });
    assert.equal(range.status, 206);
    assert.equal(range.headers.get('content-range'), `bytes 4-11/${bytes.length}`);
    assert.deepEqual(Buffer.from(await range.arrayBuffer()), bytes.subarray(4, 12));
    const suffix = await fetch(preview, { headers: { ...headers, Range: 'bytes=-4' } });
    assert.deepEqual(Buffer.from(await suffix.arrayBuffer()), bytes.subarray(-4));
    assert.equal((await fetch(preview, { method: 'HEAD', headers })).headers.get('content-length'), String(bytes.length));
    for (const Range of ['bytes=999999-', 'bytes=-0', 'invalid', 'bytes=8-4', 'bytes=0-2,4-8']) assert.equal((await fetch(preview, { headers: { ...headers, Range } })).status, 416);
    assert.equal((await post(`/api/drafts/${id}`, { text: draft.text, mediaKind: 'uploaded' })).status, 400, 'a video cannot accidentally become an image');
    assert.equal((await post(`/api/drafts/${id}`, { text: draft.text, mediaKind: 'none' })).status, 200);
    assert.equal((await post(`/api/drafts/${id}`, { text: draft.text, mediaKind: 'video' })).status, 200);
    await stop(); await start();
    const reopened = await (await fetch(`${base}/api/state`, { headers })).json();
    assert.equal(reopened.drafts[0].media_path, draft.media_path);
    assert.equal(reopened.drafts[0].status, 'draft');

    // Hold an upload open while a second edit/publish request tries to overtake it.
    const slow = httpRequest(`${base}${upload}`, { method: 'POST', headers: { ...headers, 'Content-Type': 'video/mp4', 'Content-Length': bytes.length } });
    const slowResponse = new Promise((resolve, reject) => { slow.on('response', (res) => { res.resume(); res.on('end', () => resolve(res.statusCode)); }); slow.on('error', reject); });
    slow.write(bytes.subarray(0, 8));
    await delay(50);
    assert.equal((await post(`/api/drafts/${id}`, { text: 'Should not overtake', mediaKind: 'none' })).status, 409);
    assert.equal((await post(`/api/drafts/${id}/publish`)).status, 409);
    slow.end(bytes.subarray(8)); assert.equal(await slowResponse, 200);
    const oversized = httpRequest(`${base}${upload}`, { method: 'POST', headers: { ...headers, 'Content-Type': 'video/mp4', 'Content-Length': '100000001' } });
    const oversizedResponse = new Promise((resolve, reject) => { oversized.on('response', (res) => { res.resume(); res.on('end', () => resolve(res.statusCode)); }); oversized.on('error', reject); });
    oversized.end(); assert.equal(await oversizedResponse, 413);

    const publishing = post(`/api/drafts/${id}/publish`);
    await delay(50);
    assert.equal((await post(`/api/drafts/${id}/publish`)).status, 409);
    assert.equal((await post(upload, bytes, { 'Content-Type': 'video/mp4' })).status, 409);
    assert.equal((await publishing).status, 200);
    assert.equal((await post(`/api/drafts/${id}/publish`)).status, 409);
    const calls = readFileSync(log, 'utf8').trim().split('\n').map(JSON.parse);
    assert.equal(calls.filter((call) => call.url.endsWith('/tweets')).length, 1, 'only one mocked post, after approval');
    const final = await (await fetch(`${base}/api/state`, { headers })).json();
    assert.equal(final.drafts[0].status, 'published');
    assert.equal(final.drafts[0].x_post_id, '456');
  } finally { await stop(); rmSync(dir, { recursive: true, force: true }); }
});
