import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtempSync, readFileSync, writeFileSync, rmSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { setTimeout as delay } from 'node:timers/promises';
import { saveConfig, configurationChanges, hashPassword, checkPassword } from '../server/config.mjs';

const root = resolve(import.meta.dirname, '..');

test('wizard settings preserve unrelated env values, reject injection and store a salted owner hash', () => {
  const dir = mkdtempSync(join(tmpdir(), 'studio-config-'));
  try {
    const path = join(dir, '.env');
    writeFileSync(path, '# existing config\nHOST=192.0.2.10\nPORT=3000\nOPENAI_API_KEY=old-key\n');
    const env = {};
    saveConfig(path, configurationChanges({ OPENAI_API_KEY: 'new-key', X_CLIENT_ID: '', HOST: '0.0.0.0', SCHEDULE_ENABLED: false }), env);
    assert.match(readFileSync(path, 'utf8'), /HOST=192\.0\.2\.10/);
    assert.equal(statSync(path).mode & 0o777, 0o600);
    assert.equal(env.OPENAI_API_KEY, 'new-key');
    assert.equal(env.SCHEDULE_ENABLED, 'false');
    assert.equal(env.X_CLIENT_ID, undefined);
    assert.equal(configurationChanges({ X_CLIENT_ID: 'Y2xpZW50LWlk==' }).X_CLIENT_ID, 'Y2xpZW50LWlk==');
    assert.throws(() => configurationChanges({ OPENAI_API_KEY: 'key\nHOST=0.0.0.0' }));
    assert.throws(() => configurationChanges({ SCHEDULE_ENABLED: 'true' }));
    const password = 'my-very-long-passphrase';
    const hash = hashPassword(password);
    assert.notEqual(hash, hashPassword(password));
    assert.equal(checkPassword(password, { ADMIN_PASSWORD_HASH: hash }), true);
    assert.equal(checkPassword('wrong-password', { ADMIN_PASSWORD_HASH: hash }), false);
    assert.equal(checkPassword(password, { ADMIN_PASSWORD: password }), true);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('first-run ownership is token-protected; authenticated wizard persists keys without calls or credential leakage', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'studio-onboarding-'));
  const port = 35000 + Math.floor(Math.random() * 15000);
  const base = `http://localhost:${port}`;
  const env = { ...process.env, STUDIO_HOME: dir, PORT: String(port), HOST: '127.0.0.1', PUBLIC_BASE_URL: base };
  for (const key of ['ADMIN_PASSWORD', 'ADMIN_PASSWORD_HASH', 'SESSION_SECRET', 'OPENAI_API_KEY', 'X_CLIENT_ID', 'X_CLIENT_SECRET', 'DATA_DIR', 'SCHEDULE_ENABLED', 'STUDIO_READY_FILE']) delete env[key];
  let child;
  let output = '';
  async function start() {
    output = '';
    child = spawn(process.execPath, ['server/index.mjs'], { cwd: root, env, stdio: 'pipe' });
    child.stdout.on('data', (chunk) => { output += chunk; });
    for (let i = 0; i < 100; i++) {
      if (child.exitCode !== null) throw new Error(`Server exited: ${child.exitCode}`);
      if (output.includes('Social Studio:')) return;
      await delay(30);
    }
    throw new Error('Server did not start');
  }
  async function stop() {
    if (child?.exitCode === null) { const done = once(child, 'exit'); child.kill('SIGTERM'); await done; }
  }
  const post = (path, body, headers = {}) => fetch(`${base}${path}`, { method: 'POST', headers: { Origin: base, 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });
  try {
    await start();
    const token = output.match(/#setup=([a-f0-9]{64})/)[1];
    const status = await (await fetch(`${base}/api/setup/status`)).json();
    assert.deepEqual(status, { needsOwner: true });
    assert.equal((await fetch(`${base}/api/state`)).status, 401);
    assert.equal((await post('/api/settings', { OPENAI_API_KEY: 'fake-key' })).status, 401);
    assert.equal((await post('/api/setup/owner', { password: 'a-long-passphrase' })).status, 403);
    assert.equal((await post('/api/setup/owner', { password: 'a-long-passphrase' }, { 'X-Setup-Token': token, Origin: 'https://evil.example' })).status, 403);
    assert.equal((await post('/api/setup/owner', { password: 'short' }, { 'X-Setup-Token': token })).status, 400);
    const claim = await post('/api/setup/owner', { password: 'a-long-passphrase' }, { 'X-Setup-Token': token });
    assert.equal(claim.status, 201);
    const cookie = claim.headers.get('set-cookie').split(';')[0];
    const headers = { Cookie: cookie };
    assert.equal((await post('/api/setup/owner', { password: 'replacement-passphrase' }, { 'X-Setup-Token': token })).status, 409);
    let state = await (await fetch(`${base}/api/state`, { headers })).json();
    assert.equal(state.scheduleEnabled, false);
    assert.equal(state.callbackUrl, `${base}/api/x/callback`);
    assert.equal(state.catalog.length, 0);
    const save = await post('/api/settings', { OPENAI_API_KEY: 'fake-openai-key', X_CLIENT_ID: 'fake-client-id', X_CLIENT_SECRET: 'fake-client-secret' }, headers);
    assert.equal(save.status, 200);
    const auth = await fetch(`${base}/api/x/connect`, { headers, redirect: 'manual' });
    assert.equal(auth.status, 302); // Redirect is not followed: no external request.
    assert.equal((await post('/api/settings', { X_CLIENT_SECRET: 'replacement-client-secret' }, headers)).status, 200);
    const oauthState = new URL(auth.headers.get('location')).searchParams.get('state');
    const stale = await fetch(`${base}/api/x/callback?state=${oauthState}&code=not-real`, { headers, redirect: 'manual' });
    assert.match(stale.headers.get('location'), /x_error=/, 'old OAuth request invalidated before network call');
    state = await (await fetch(`${base}/api/state`, { headers })).json();
    assert.equal(state.openaiConfigured, true);
    assert.equal(state.xConfigured, true);
    assert.doesNotMatch(JSON.stringify(state), /fake-openai-key|fake-client|replacement-client-secret/);
    assert.equal(state.dailyRun, null);
    const disk = readFileSync(join(dir, '.env'), 'utf8');
    assert.doesNotMatch(disk, /a-long-passphrase/);
    assert.match(disk, /ADMIN_PASSWORD_HASH=/);
    assert.equal((await post('/api/settings', { OPENAI_API_KEY: '', X_CLIENT_ID: '', X_CLIENT_SECRET: '' }, headers)).status, 200);
    assert.equal(readFileSync(join(dir, '.env'), 'utf8'), disk);
    await stop();
    await start();
    assert.doesNotMatch(output, /#setup=/);
    assert.deepEqual(await (await fetch(`${base}/api/setup/status`)).json(), { needsOwner: false });
    const login = await post('/api/login', { password: 'a-long-passphrase' });
    assert.equal(login.status, 200);
    const reloaded = await (await fetch(`${base}/api/state`, { headers: { Cookie: login.headers.get('set-cookie').split(';')[0] } })).json();
    assert.equal(reloaded.openaiConfigured, true);
    assert.equal(reloaded.xConfigured, true);
    assert.equal(reloaded.scheduleEnabled, false);
    assert.equal(reloaded.catalog.length, 0);
  } finally { await stop(); rmSync(dir, { recursive: true, force: true }); }
});
