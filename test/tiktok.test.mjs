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
import { generateTikTokCopy } from '../server/openai.mjs';
import { linkedInInput } from '../server/linkedin.mjs';

const caption = 'A simpler home for your ideas. Keep and search notes locally. #Mac #Productivity';

test('manual TikTok captions use English feature lines and put the supplied link before hashtags',async()=>{
  const old=process.env.OPENAI_API_KEY;process.env.OPENAI_API_KEY='test-only';
  const lines=['✨ A simpler home for your ideas.','Meet Notes 📱','📝 Save your thoughts locally.','Try it today.','#Notes #Mac'];
  const app={name:'Notes',platform:'Mac',features:['Local notes'],guardrail:'No cloud claims.'};
  const draft={text:'Notlarını yerel kaydet.',feature:'Local notes',url:'https://example.com/notes'};
  try{
    const copy=await generateTikTokCopy(app,draft,async(_url,options)=>{
      const body=JSON.parse(options.body);assert.match(body.instructions,/Always write the post text and title in English/);assert.match(body.instructions,/one blank line/);
      return Response.json({output:[{content:[{type:'output_text',text:lines.join('\r\n')}]}]});
    });
    assert.equal(copy,[...lines.slice(0,-1),draft.url,lines.at(-1)].join('\n\n'));assert.equal(copy.split(draft.url).length,2);
  }finally{if(old===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=old;}
});

test('TikTok captions have their own conservative limit, verified facts and no implicit social calls', async () => {
  assert.equal(linkedInInput({ text: 'x'.repeat(2200), revision: 0 }, 2200, 'TikTok').text.length, 2200);
  assert.throws(() => linkedInInput({ text: 'x'.repeat(2201), revision: 0 }, 2200, 'TikTok'), /TikTok.*2200/);
  const previous = process.env.OPENAI_API_KEY; process.env.OPENAI_API_KEY = 'test-only';
  try {
    const app = { name: 'Notes', platform: 'Mac', features: ['Local notes'], guardrail: 'No cloud claims.' };
    const draft = { text: 'Local notes.', feature: 'Local notes', url: 'https://example.com/' };
    const fake = (text) => async (url, options) => {
      assert.equal(url, 'https://api.openai.com/v1/responses');
      const body = JSON.parse(options.body);
      assert.equal(body.store, false); assert.match(body.instructions, /TikTok video caption/);
      assert.match(body.instructions, /Do not claim to have watched/); assert.match(body.instructions, /at most 3/);
      assert.deepEqual(JSON.parse(body.input).verified_features, app.features);
      return Response.json({ output: [{ content: [{ type: 'output_text', text }] }] });
    };
    assert.equal(await generateTikTokCopy(app, draft, fake(caption)), `${caption}\n\n${draft.url}`);
    for (const text of ['', 'x'.repeat(1201), 'Visit https://unexpected.example']) await assert.rejects(generateTikTokCopy(app, draft, fake(text)), /TikTok taslağı/);
  } finally { if (previous === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = previous; }
});

test('TikTok manual workflow persists text/video reminder separately from LinkedIn and never publishes', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'studio-tiktok-'));
  const log = join(dir, 'requests.jsonl'); const preload = join(dir, 'fake-provider.mjs');
  writeFileSync(preload, `import { appendFileSync } from 'node:fs';
    globalThis.fetch = async (url) => {
      appendFileSync(${JSON.stringify(log)}, JSON.stringify(url) + '\\n');
      if (url !== 'https://api.openai.com/v1/responses') throw new Error('Social APIs blocked by test');
      return Response.json({ output: [{ content: [{ type: 'output_text', text: ${JSON.stringify(caption)} }] }] });
    };`);
  const id = randomUUID(); const store = openStore(dir);
  store.addProject.run('notes', 'Notes', 'Productivity', 'Mac', 'https://example.com/', '/favicon.svg', '#abcdef', '["Local notes"]', '');
  store.create.run(id, 'notes', 'Local notes', 'Keep notes locally.', 'https://example.com/', null, '2026-01-01', '2026-01-01');
  const original = { ...store.get.get(id) };
  store.createLinkedIn.run(id, 'Existing LinkedIn copy.', 'linkedin.mp4', '2026-01-01'); store.db.close();
  const port = 35000 + Math.floor(Math.random() * 15000); const base = `http://localhost:${port}`;
  const server = spawn(process.execPath, ['--import', preload, 'server/index.mjs'], { cwd: resolve(import.meta.dirname, '..'), stdio: 'pipe', env: {
    ...process.env, STUDIO_HOME: dir, STUDIO_READY_FILE: '', DATA_DIR: dir, HOST: '127.0.0.1', PORT: String(port), PUBLIC_BASE_URL: base,
    ADMIN_PASSWORD_HASH: '', ADMIN_PASSWORD: 'test-password', SESSION_SECRET: 'test-secret-at-least-32-characters',
    OPENAI_API_KEY: 'fake-key', X_CLIENT_ID: '', X_CLIENT_SECRET: '', SCHEDULE_ENABLED: 'false'
  } });
  let errors = ''; server.stdout.resume(); server.stderr.on('data', (chunk) => { errors += chunk; });
  try {
    let ready = false;
    for (let i = 0; i < 80; i++) {
      if (server.exitCode !== null) throw new Error(errors);
      try { if ((await fetch(`${base}/api/health`)).ok) { ready = true; break; } } catch {} await delay(50);
    }
    assert.equal(ready, true);
    const login = await fetch(`${base}/api/login`, { method: 'POST', headers: { Origin: base, 'Content-Type': 'application/json' }, body: JSON.stringify({ password: 'test-password' }) });
    const headers = { Origin: base, Cookie: login.headers.get('set-cookie').split(';')[0], 'Content-Type': 'application/json' };
    const path = `/api/drafts/${id}/tiktok`;
    const request = (path, method = 'GET', body) => fetch(`${base}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    assert.equal((await fetch(`${base}${path}`)).status, 401);
    assert.equal((await fetch(`${base}${path}/generate`, { method: 'POST', headers: { Origin: base } })).status, 401);
    assert.equal((await fetch(`${base}${path}`, { method: 'POST', headers: { ...headers, Origin: 'https://other.example' }, body: '{}' })).status, 403);
    const initial = (await (await request(path)).json()).tiktok;
    assert.equal(initial.text, `${original.text}\n\n${original.url}`); assert.equal(initial.revision, 0);
    const saved = await request(path, 'POST', { text: 'TikTok caption #Mac', videoName: 'tanıtım videosu.mp4', revision: 0 });
    assert.equal(saved.status, 200); assert.equal((await saved.json()).tiktok.revision, 1);
    assert.equal((await request(path, 'POST', { text: 'Stale', revision: 0 })).status, 409);
    assert.equal((await request(path, 'POST', { text: 'x'.repeat(2201), revision: 1 })).status, 400);
    assert.equal((await request(path, 'POST', { text: 'Caption', videoName: '../secret.mp4', revision: 1 })).status, 400);
    assert.equal((await request(`${path}/publish`, 'POST')).status, 404);
    assert.equal(existsSync(log), false);
    const generated = await request(`${path}/generate`, 'POST');
    assert.equal(generated.status, 200); assert.match((await generated.json()).text, /#Productivity/);
    assert.equal((await (await request(path)).json()).tiktok.text, 'TikTok caption #Mac', 'AI does not silently overwrite');
    assert.equal((await (await request(`/api/drafts/${id}/linkedin`)).json()).linkedin.text, 'Existing LinkedIn copy.');
    const state = await (await request('/api/state')).json(); assert.deepEqual(state.drafts[0], original);
    assert.equal(state.usage.estimate.today.posts, 0);
    assert.deepEqual(readFileSync(log, 'utf8').trim().split('\n').map(JSON.parse), ['https://api.openai.com/v1/responses']);
    const exited = once(server, 'exit'); server.kill('SIGTERM'); await exited;
    const reopened = openStore(dir);
    assert.equal(reopened.tikTok.get(id).video_name, 'tanıtım videosu.mp4');
    assert.equal(reopened.tikTok.get(id).text, 'TikTok caption #Mac');
    assert.equal(reopened.linkedIn.get(id).video_name, 'linkedin.mp4');
    assert.deepEqual({ ...reopened.get.get(id) }, original); reopened.db.close();
  } finally {
    if (server.exitCode === null && server.signalCode === null) { const exited = once(server, 'exit'); server.kill('SIGTERM'); await exited; }
    rmSync(dir, { recursive: true, force: true });
  }
});
