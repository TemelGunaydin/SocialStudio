import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { randomUUID } from 'node:crypto';
import { openStore } from '../server/db.mjs';
import { linkedInText, linkedInInput } from '../server/linkedin.mjs';
import { generateLinkedInCopy } from '../server/openai.mjs';

const root = resolve(import.meta.dirname, '..');
const generatedCopy = 'Keep your notes close.\n\nSave and search your notes locally on your Mac.\n\nExplore a simpler way to revisit your ideas.';

test('LinkedIn validates full copy independently of X, including Unicode and filename-only video references', () => {
  assert.equal(linkedInText('  A longer LinkedIn post.\n\nhttps://example.com  '), 'A longer LinkedIn post.\n\nhttps://example.com');
  assert.equal(linkedInText('x'.repeat(3000)).length, 3000);
  assert.equal(linkedInText('🌱'.repeat(1500)).length, 3000);
  for (const value of ['', '  ', null, {}, 42, 'x'.repeat(3001), '🌱'.repeat(1501)]) {
    assert.throws(() => linkedInText(value), { status: 400 });
  }
  assert.deepEqual(linkedInInput({ text: ' A post ', videoName: 'Türkçe tanıtım.MP4', revision: 0 }),
    { text: 'A post', videoName: 'Türkçe tanıtım.MP4', revision: 0 });
  for (const videoName of ['../private.mp4', '/tmp/promo.mp4', 'C:\\private.mp4', 'fake.mp4\n', 'a'.repeat(256), 'file.txt', {}]) {
    assert.throws(() => linkedInInput({ text: 'A post', videoName, revision: 0 }), { status: 400 });
  }
  for (const revision of [undefined, '0', -1, 0.5, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => linkedInInput({ text: 'A post', revision }), { status: 400 });
  }
});

test('LinkedIn AI uses verified facts, appends the link once, and rejects bad output without publishing', async () => {
  const previous = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = 'fake-test-key';
  const app = { name: 'Private Notes', platform: 'Mac', features: ['Local notes.', 'Local search.'], guardrail: 'No cloud backup.' };
  const draft = { text: 'Keep notes on your Mac.', feature: 'Local notes.', url: 'https://example.com/notes' };
  const requests = [];
  const fake = (text) => async (url, options) => {
    requests.push({ url, body: JSON.parse(options.body) });
    return Response.json({ output: [{ content: [{ type: 'output_text', text }] }] });
  };
  try {
    const result = await generateLinkedInCopy(app, draft, fake(generatedCopy));
    assert.equal(result, `${generatedCopy}\n\n${draft.url}`);
    assert.equal(requests.length, 1);
    assert.equal(requests[0].url, 'https://api.openai.com/v1/responses');
    assert.equal(requests[0].body.store, false);
    assert.match(requests[0].body.instructions, /LinkedIn/);
    assert.match(requests[0].body.instructions, /Always write the post text and title in English/);
    assert.match(requests[0].body.instructions, /untrusted/);
    assert.match(requests[0].body.instructions, /without inventing/);
    const input = JSON.parse(requests[0].body.input);
    assert.deepEqual(input.verified_features, app.features);
    assert.equal(input.x_draft, draft.text);
    assert.equal(input.guardrail, app.guardrail);
    for (const bad of ['', '  ', 'x'.repeat(2201), 'Learn more at https://other.example']) {
      await assert.rejects(generateLinkedInCopy(app, draft, fake(bad)), /LinkedIn taslağı/);
    }
    await assert.rejects(generateLinkedInCopy(app, draft, async () => Response.json({ error: { message: 'Mock limit' } }, { status: 429 })), /Mock limit/);
    process.env.OPENAI_API_KEY = '';
    await assert.rejects(generateLinkedInCopy(app, draft, async () => assert.fail('No request without a key')), /OPENAI_API_KEY/);
  } finally {
    if (previous === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = previous;
  }
});

test('LinkedIn schema upgrade is additive, idempotent, and leaves legacy X readers and writers usable', () => {
  const dir = mkdtempSync(join(tmpdir(), 'studio-linkedin-migration-'));
  let store;
  try {
    store = openStore(dir);
    const id = randomUUID();
    store.create.run(id, 'thokka', 'Switch sounds', 'Original X copy.', 'https://example.com/', null, '2026-01-01', '2026-01-01');
    store.edit.run('Original X copy.', 'uploaded', `${id}-upload.jpg`, 'Original alt', '2026-01-01', id);
    store.setSetting.run('x_token', 'preserve-the-token');
    store.setSetting.run('custom_setting', 'preserve-setting');
    const original = { ...store.get.get(id) };
    const projects = store.projects.all();
    store.db.exec('DROP TABLE linkedin_drafts'); // Simulate the previous schema in this temporary fixture only.
    store.db.close();
    store = openStore(dir);
    assert.deepEqual({ ...store.get.get(id) }, original);
    assert.deepEqual(store.projects.all(), projects);
    assert.equal(store.getSetting.get('x_token').value, 'preserve-the-token');
    assert.equal(store.getSetting.get('custom_setting').value, 'preserve-setting');
    store.createLinkedIn.run(id, 'Separate LinkedIn copy.', 'promo.mp4', '2026-01-02');
    assert.equal(store.createLinkedIn.run(id, 'Do not overwrite.', '', '2026-01-02').changes, 0);
    store.db.close();
    store = openStore(dir);
    assert.equal(store.linkedIn.get(id).text, 'Separate LinkedIn copy.');
    // The previous version still reads/updates the same drafts columns and ignores the additive table.
    store.edit.run('Edited through the old X API.', 'none', original.media_path, original.media_alt, '2026-01-03', id);
    assert.equal(store.get.get(id).text, 'Edited through the old X API.');
    assert.equal(store.linkedIn.get(id).text, 'Separate LinkedIn copy.');
    assert.equal(store.linkedIn.get(id).revision, 1);
  } finally { store?.db.close(); rmSync(dir, { recursive: true, force: true }); }
});

test('manual LinkedIn lifecycle is authenticated, persisted, conflict-safe, and independent of X publication', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'studio-linkedin-flow-'));
  const log = join(dir, 'provider-calls.jsonl');
  const preload = join(dir, 'fake-provider.mjs');
  writeFileSync(preload, `import { appendFileSync } from 'node:fs';
    globalThis.fetch = async (url, options) => {
      appendFileSync(${JSON.stringify(log)}, JSON.stringify({ url, body: JSON.parse(options.body || '{}') }) + '\\n');
      if (url !== 'https://api.openai.com/v1/responses') throw new Error('Unexpected external API call');
      return Response.json({ output: [{ content: [{ type: 'output_text', text: ${JSON.stringify(generatedCopy)} }] }] });
    };`);
  const port = 35000 + Math.floor(Math.random() * 15000);
  const base = `http://localhost:${port}`;
  let server;
  async function stop() {
    if (!server || server.exitCode !== null) return;
    const exited = once(server, 'exit'); server.kill('SIGTERM'); await exited;
  }
  async function start() {
    server = spawn(process.execPath, ['--import', preload, 'server/index.mjs'], {
      cwd: root, stdio: 'pipe',
      env: { ...process.env, STUDIO_HOME: dir, STUDIO_READY_FILE: '', DATA_DIR: dir,
        PORT: String(port), HOST: '127.0.0.1', PUBLIC_BASE_URL: base,
        ADMIN_PASSWORD_HASH: '', ADMIN_PASSWORD: 'test-owner-password', SESSION_SECRET: 'test-session-key-at-least-32-characters',
        SCHEDULE_ENABLED: 'false', OPENAI_API_KEY: '', X_CLIENT_ID: '', X_CLIENT_SECRET: '' }
    });
    let errors = '';
    server.stderr.on('data', (chunk) => { errors += chunk; });
    server.stdout.resume();
    for (let i = 0; i < 80; i++) {
      if (server.exitCode !== null) throw new Error(`Server exited: ${errors}`);
      try { if ((await fetch(`${base}/api/health`)).ok) return; } catch {}
      await delay(50);
    }
    throw new Error(`Server did not start: ${errors}`);
  }
  try {
    await start();
    const login = await fetch(`${base}/api/login`, { method: 'POST', headers: { Origin: base, 'Content-Type': 'application/json' }, body: JSON.stringify({ password: 'test-owner-password' }) });
    assert.equal(login.status, 200);
    const headers = { Origin: base, Cookie: login.headers.get('set-cookie').split(';')[0], 'Content-Type': 'application/json' };
    const request = (path, method = 'GET', body) => fetch(`${base}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    const projectResponse = await request('/api/projects', 'POST', { name: 'Notes', category: 'Productivity', platform: 'Mac', url: 'https://example.com/', features: 'Local notes.\nLocal search.' });
    const project = (await projectResponse.json()).project;
    const create = await request('/api/drafts/manual', 'POST', { appId: project.id, text: 'Save notes locally.' });
    const original = (await create.json()).draft;
    const path = `/api/drafts/${original.id}/linkedin`;
    for (const suffix of ['', '/generate']) {
      assert.equal((await fetch(`${base}${path}${suffix}`, { method: suffix ? 'POST' : 'GET', headers: { Origin: base } })).status, 401);
    }
    assert.equal((await fetch(`${base}${path}`, { method: 'POST', headers: { Cookie: headers.Cookie, Origin: 'https://other.example' }, body: '{}' })).status, 403);
    assert.equal((await request(path, 'PUT', {})).status, 405);
    assert.equal((await request(`/api/drafts/${randomUUID()}/linkedin`)).status, 404);
    const initial = (await (await request(path)).json()).linkedin;
    assert.equal(initial.text, `${original.text}\n\n${original.url}`);
    assert.equal(initial.revision, 0);
    const savedText = `${'A useful LinkedIn paragraph. '.repeat(15)}\n\n${original.url}`;
    const saved = await request(path, 'POST', { text: savedText, videoName: 'promo video.mp4', revision: 0 });
    assert.equal(saved.status, 200);
    assert.equal((await saved.json()).linkedin.revision, 1);
    for (const text of ['', 'x'.repeat(3001), null]) {
      assert.equal((await request(path, 'POST', { text, revision: 1 })).status, 400);
    }
    assert.equal((await request(path, 'POST', { text: savedText, videoName: '../private.mp4', revision: 1 })).status, 400);
    assert.equal((await request(path, 'POST', { text: 'Stale first save', revision: 0 })).status, 409);
    assert.equal((await request(`${path}/generate`, 'POST')).status, 400, 'missing key fails without a provider call');
    assert.equal(existsSync(log), false, 'open/save/validation do not call providers');
    const state = await (await request('/api/state')).json();
    assert.deepEqual(state.drafts[0], original, 'X copy, media, timestamps, status and approval are untouched');
    assert.equal(state.usage.estimate.today.posts, 0);
    assert.equal((await request(`/api/drafts/${original.id}/publish`, 'POST')).status, 400, 'X connection still required');

    await request('/api/settings', 'POST', { OPENAI_API_KEY: 'fake-key-test-only' });
    const suggestion = await request(`${path}/generate`, 'POST');
    assert.equal(suggestion.status, 200);
    assert.equal((await suggestion.json()).text, `${generatedCopy}\n\n${original.url}`);
    assert.equal((await (await request(path)).json()).linkedin.text, savedText, 'AI is a suggestion, never an implicit save');
    const calls = readFileSync(log, 'utf8').trim().split('\n').map(JSON.parse);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, 'https://api.openai.com/v1/responses');

    const concurrent = await Promise.all(['First tab', 'Second tab'].map((text) => request(path, 'POST', { text, revision: 1 })));
    assert.deepEqual(concurrent.map((response) => response.status).sort(), [200, 409]);
    const beforeRestart = (await (await request(path)).json()).linkedin;
    assert.equal(beforeRestart.revision, 2);
    await stop();
    const store = openStore(dir);
    assert.deepEqual({ ...store.get.get(original.id) }, original);
    store.markPublishing.run('2026-01-02', '2026-01-02', original.id);
    store.markPublished.run('fake-x-id', '2026-01-02', '2026-01-02', original.id); // Fixture only; no network.
    store.db.close();
    await start();
    assert.deepEqual((await (await request(path)).json()).linkedin, beforeRestart);
    const afterPublish = await request(path, 'POST', { text: 'Independent after X publication.', revision: 2 });
    assert.equal(afterPublish.status, 200);
    assert.equal((await afterPublish.json()).linkedin.revision, 3);
    const finalState = await (await request('/api/state')).json();
    assert.equal(finalState.drafts[0].status, 'published');
    assert.equal(finalState.drafts[0].text, original.text);
    assert.equal(finalState.drafts[0].x_post_id, 'fake-x-id');
    assert.equal(readFileSync(log, 'utf8').trim().split('\n').length, 1);
    assert.equal((await request(`${path}/publish`, 'POST')).status, 409, 'there is no LinkedIn publish operation');
    const html = await fetch(`${base}/`);
    assert.match(html.headers.get('content-security-policy'), /media-src 'self' blob:/);
    assert.equal((await fetch(`${base}/linkedin.js`)).status, 200);
  } finally { await stop(); rmSync(dir, { recursive: true, force: true }); }
});
