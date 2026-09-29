import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { openStore } from '../server/db.mjs';
import { publish, startConnection, finishConnection } from '../server/x.mjs';

const root = resolve(import.meta.dirname, '..');

test('owner reviews a draft and publishing stays blocked without X authorization', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'social-studio-flow-'));
  const port = 35000 + Math.floor(Math.random() * 15000);
  const base = `http://localhost:${port}`;
  const server = spawn(process.execPath, ['server/index.mjs'], {
    cwd: root,
    env: {
      ...process.env, PORT: String(port), PUBLIC_BASE_URL: base, DATA_DIR: dir,
      ADMIN_PASSWORD: 'test-owner-password', SESSION_SECRET: 'test-session-key-at-least-32-characters',
      OPENAI_API_KEY: '', X_CLIENT_ID: '', X_CLIENT_SECRET: ''
    },
    stdio: 'pipe'
  });
  try {
    let ready = false;
    for (let i = 0; i < 80; i++) {
      if (server.exitCode !== null) throw new Error(`Server exited: ${server.exitCode}`);
      try { const response = await fetch(`${base}/api/state`); ready = response.status === 401; if (ready) break; }
      catch { await delay(100); }
    }
    assert.equal(ready, true, 'server started');
    const unauthorized = await fetch(`${base}/api/state`);
    assert.equal(unauthorized.status, 401);
    const crossSite = await fetch(`${base}/api/login`, { method: 'POST', body: JSON.stringify({ password: 'test-owner-password' }) });
    assert.equal(crossSite.status, 403);
    const login = await fetch(`${base}/api/login`, {
      method: 'POST', headers: { Origin: base, 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: 'test-owner-password' })
    });
    assert.equal(login.status, 200);
    assert.match(login.headers.get('set-cookie'), /SameSite=Lax/);
    const cookie = login.headers.get('set-cookie').split(';')[0];
    const headers = { Origin: base, Cookie: cookie, 'Content-Type': 'application/json' };
    const state = await (await fetch(`${base}/api/state`, { headers })).json();
    assert.equal(state.catalog.length, 6);
    const create = await fetch(`${base}/api/drafts/manual`, {
      method: 'POST', headers, body: JSON.stringify({ appId: 'heptapod', text: 'Follow spoken words with a private transcript on your Mac.' })
    });
    assert.equal(create.status, 201);
    const { draft } = await create.json();
    assert.equal(draft.status, 'draft');
    const edit = await fetch(`${base}/api/drafts/${draft.id}`, {
      method: 'POST', headers,
      body: JSON.stringify({ text: 'Keep a private transcript of speech playing on your Mac.', mediaKind: 'icon' })
    });
    assert.equal(edit.status, 200);
    const publishAttempt = await fetch(`${base}/api/drafts/${draft.id}/publish`, { method: 'POST', headers });
    assert.equal(publishAttempt.status, 400);
    const afterAttempt = await (await fetch(`${base}/api/state`, { headers })).json();
    assert.equal(afterAttempt.drafts[0].status, 'draft');
    const reject = await fetch(`${base}/api/drafts/${draft.id}/reject`, { method: 'POST', headers });
    assert.equal(reject.status, 200);
    const editRejected = await fetch(`${base}/api/drafts/${draft.id}`, {
      method: 'POST', headers, body: JSON.stringify({ text: 'Something else', mediaKind: 'none' })
    });
    assert.equal(editRejected.status, 409);
  } finally {
    server.kill('SIGTERM');
    rmSync(dir, { recursive: true, force: true });
  }
});

test('approved post sends the exact reviewed copy and link once', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'social-studio-x-'));
  try {
    const store = openStore(dir);
    store.setSetting.run('x_token', JSON.stringify({ access_token: 'test-token', expires_at: Date.now() + 3600_000, user: { id: '1', username: 'test' } }));
    const requests = [];
    const fetchMock = async (url, options) => {
      requests.push({ url, options });
      return new Response(JSON.stringify({ data: { id: '123456789' } }), { status: 201, headers: { 'Content-Type': 'application/json' } });
    };
    const id = await publish(store, {
      text: 'A clearer look at your daily sky.', url: 'https://buildandruns.com/astrofuture/', media_kind: 'none'
    }, dir, fetchMock);
    assert.equal(id, '123456789');
    assert.equal(requests.length, 1);
    assert.equal(requests[0].url, 'https://api.x.com/2/tweets');
    assert.deepEqual(JSON.parse(requests[0].options.body), {
      text: 'A clearer look at your daily sky.\n\nhttps://buildandruns.com/astrofuture/'
    });
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('generated image is uploaded before an AI-labeled post', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'social-studio-media-'));
  try {
    const store = openStore(dir);
    store.setSetting.run('x_token', JSON.stringify({ access_token: 'test-token', expires_at: Date.now() + 3600_000, user: { id: '1', username: 'test' } }));
    mkdirSync(join(dir, 'images'));
    writeFileSync(join(dir, 'images', 'sample.jpg'), Buffer.from('ffd8ffe0', 'hex'));
    const calls = [];
    const fetchMock = async (url, options) => {
      calls.push({ url, options });
      return new Response(JSON.stringify(url.endsWith('/media/upload') ? { data: { id: '456' } } : { data: { id: '789' } }), {
        status: url.endsWith('/media/upload') ? 200 : 201,
        headers: { 'Content-Type': 'application/json' }
      });
    };
    const id = await publish(store, {
      text: 'A mechanical feel for your Mac.', url: 'https://buildandruns.com/thokka/',
      media_kind: 'generated', media_path: 'sample.jpg'
    }, dir, fetchMock);
    assert.equal(id, '789');
    assert.equal(calls.length, 2);
    assert.equal(calls[0].url, 'https://api.x.com/2/media/upload');
    assert.equal(JSON.parse(calls[0].options.body).media_category, 'tweet_image');
    assert.deepEqual(JSON.parse(calls[1].options.body).media, { media_ids: ['456'] });
    assert.equal(JSON.parse(calls[1].options.body).made_with_ai, true);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('X OAuth connection uses PKCE and stores the authorized account', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'social-studio-oauth-'));
  const original = { X_CLIENT_ID: process.env.X_CLIENT_ID, X_CLIENT_SECRET: process.env.X_CLIENT_SECRET, PUBLIC_BASE_URL: process.env.PUBLIC_BASE_URL };
  try {
    process.env.X_CLIENT_ID = 'client-id';
    process.env.X_CLIENT_SECRET = 'client-secret';
    process.env.PUBLIC_BASE_URL = 'https://studio.example.com';
    const store = openStore(dir);
    const url = new URL(startConnection(store));
    assert.equal(url.searchParams.get('code_challenge_method'), 'S256');
    assert.match(url.searchParams.get('scope'), /media\.write/);
    const state = url.searchParams.get('state');
    const calls = [];
    const fetchMock = async (endpoint, options) => {
      calls.push({ endpoint, options });
      const data = endpoint.endsWith('/oauth2/token') ? {
        access_token: 'user-token', refresh_token: 'refresh-token', expires_in: 7200
      } : { data: { id: '42', username: 'buildandruns', name: 'Build & Runs' } };
      return new Response(JSON.stringify(data), { status: 200, headers: { 'Content-Type': 'application/json' } });
    };
    const account = await finishConnection(store, state, 'authorization-code', fetchMock);
    assert.equal(account.username, 'buildandruns');
    assert.equal(calls.length, 2);
    assert.equal(new URLSearchParams(calls[0].options.body).get('grant_type'), 'authorization_code');
    assert.equal(new URLSearchParams(calls[0].options.body).get('redirect_uri'), 'https://studio.example.com/api/x/callback');
    assert.ok(store.getSetting.get('x_token'));
  } finally {
    for (const [key, value] of Object.entries(original)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
    rmSync(dir, { recursive: true, force: true });
  }
});
