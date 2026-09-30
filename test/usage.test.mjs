import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openStore } from '../server/db.mjs';
import { createUsageMonitor } from '../server/usage.mjs';
import { readCredits, publish } from '../server/x.mjs';

function connect(store, id = 'owner') {
  store.setSetting.run('x_token', JSON.stringify({ access_token: 'private-test-token', expires_at: Date.now() + 3600_000, user: { id, username: 'test' } }));
}

const credits = (total = 9.4) => new Response(JSON.stringify({ data: { total_balance: total, prepaid_balance: total, free_balance: 0 } }));

test('credits use the existing user token and reject malformed amounts', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'studio-credits-'));
  const store = openStore(dir);
  try {
    connect(store);
    const balance = await readCredits(store, async (url, options) => {
      assert.equal(url, 'https://api.x.com/2/usage/credits');
      assert.equal(options.headers.Authorization, 'Bearer private-test-token');
      assert.equal(options.method, undefined, 'read-only request');
      return credits();
    });
    assert.deepEqual(balance, { totalUsd: 9.4, prepaidUsd: 9.4, freeUsd: 0 });
    await assert.rejects(readCredits(store, async () => new Response(JSON.stringify({ data: { total_balance: null, prepaid_balance: 0, free_balance: 0 } }))), /geçerli bir bakiye/);
    const negative = await readCredits(store, async () => new Response(JSON.stringify({ data: { total_balance: 0, prepaid_balance: -0.01, free_balance: 0 } })));
    assert.equal(negative.prepaidUsd, -0.01);
  } finally { store.db.close(); rmSync(dir, { recursive: true, force: true }); }
});

test('balance and publishing share token refresh without restoring a disconnected account', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'studio-token-refresh-'));
  const store = openStore(dir);
  const original = { X_CLIENT_ID: process.env.X_CLIENT_ID, X_CLIENT_SECRET: process.env.X_CLIENT_SECRET, PUBLIC_BASE_URL: process.env.PUBLIC_BASE_URL };
  try {
    process.env.X_CLIENT_ID = 'client';
    process.env.X_CLIENT_SECRET = 'secret';
    process.env.PUBLIC_BASE_URL = 'http://localhost:3000';
    const expired = JSON.stringify({ access_token: 'expired', refresh_token: 'refresh', expires_at: 0, user: { id: 'owner' } });
    store.setSetting.run('x_token', expired);
    let refreshes = 0;
    const fetchImpl = async (url, options) => {
      if (url.endsWith('/oauth2/token')) {
        refreshes += 1;
        return new Response(JSON.stringify({ access_token: 'renewed', refresh_token: 'rotated', expires_in: 7200 }));
      }
      assert.equal(options.headers.Authorization, 'Bearer renewed');
      return url.endsWith('/usage/credits') ? credits() : new Response(JSON.stringify({ data: { id: 'post' } }), { status: 201 });
    };
    const [balance, postId] = await Promise.all([
      readCredits(store, fetchImpl),
      publish(store, { text: 'Reviewed', url: 'https://example.com/', media_kind: 'none' }, dir, fetchImpl)
    ]);
    assert.equal(refreshes, 1);
    assert.equal(balance.totalUsd, 9.4);
    assert.equal(postId, 'post');
    assert.equal(JSON.parse(store.getSetting.get('x_token').value).refresh_token, 'rotated');

    store.setSetting.run('x_token', expired);
    let resolveToken;
    const request = readCredits(store, () => new Promise((resolve) => { resolveToken = resolve; }));
    store.deleteSetting.run('x_token');
    resolveToken(new Response(JSON.stringify({ access_token: 'renewed', expires_in: 7200 })));
    await assert.rejects(request, /bağlantısı değişti/);
    assert.equal(store.getSetting.get('x_token'), undefined);
  } finally {
    for (const [key, value] of Object.entries(original)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
    store.db.close(); rmSync(dir, { recursive: true, force: true });
  }
});

test('cached balances survive restart, failed refresh retains dated data, and accounts stay isolated', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'studio-usage-cache-'));
  const store = openStore(dir);
  let timestamp = Date.parse('2026-09-30T12:00:00Z');
  let calls = 0;
  let failure = false;
  const fetchImpl = async () => {
    calls += 1;
    if (failure) throw new Error('X unavailable');
    return credits();
  };
  const options = { fetchImpl, clock: () => timestamp };
  try {
    connect(store);
    let monitor = createUsageMonitor(store, options);
    const [first, second] = await Promise.all([monitor.refresh(), monitor.refresh()]);
    assert.equal(calls, 1);
    assert.equal(first.balance.totalUsd, 9.4);
    assert.deepEqual(first, second);
    assert.equal(JSON.stringify(first).includes('private-test-token'), false);
    monitor = createUsageMonitor(store, options);
    await monitor.refresh(true);
    assert.equal(calls, 1, 'restart and forced refresh respect the cooldown');
    timestamp += 31_000;
    await monitor.refresh(true);
    assert.equal(calls, 2);
    timestamp += 5 * 60_000;
    failure = true;
    const unavailable = await monitor.refresh();
    assert.equal(unavailable.balance.totalUsd, 9.4);
    assert.equal(unavailable.balance.updatedAt, '2026-09-30T12:00:31.000Z');
    assert.equal(unavailable.stale, true);
    assert.match(unavailable.error, /unavailable/);
    await monitor.refresh();
    assert.equal(calls, 3, 'failed requests also have a cooldown');
    store.deleteSetting.run('x_token');
    assert.equal(monitor.summary().balance, null);
    assert.equal((await monitor.refresh()).connected, false);
    connect(store, 'different-owner');
    assert.equal(monitor.summary().balance, null);
  } finally { store.db.close(); rmSync(dir, { recursive: true, force: true }); }
});

test('estimates count all successful posts at Istanbul day and month boundaries', () => {
  const dir = mkdtempSync(join(tmpdir(), 'studio-usage-dates-'));
  const store = openStore(dir);
  let timestamp = Date.parse('2026-09-30T22:30:00Z'); // October 1, 01:30 in Istanbul.
  try {
    const add = (id, stamp, status = 'published') => {
      store.create.run(id, 'thokka', 'feature', 'Reviewed text', 'https://buildandruns.com/thokka/', null, stamp, stamp);
      if (status === 'draft') return;
      store.markPublishing.run(stamp, stamp, id);
      if (status === 'published') store.markPublished.run(`post-${id}`, stamp, stamp, id);
      else store.markFailed.run(status, 'Unconfirmed', stamp, id);
    };
    for (let i = 0; i < 125; i++) add(String(i), '2026-09-30T21:05:00.000Z');
    add('prior-month', '2026-09-30T20:59:59.000Z');
    add('future', '2026-10-02T12:00:00.000Z');
    add('unconfirmed', '2026-09-30T21:05:00.000Z', 'uncertain');
    add('draft', '2026-09-30T21:05:00.000Z', 'draft');
    assert.equal(store.list.all().length, 120);
    const monitor = createUsageMonitor(store, { clock: () => timestamp });
    let usage = monitor.summary();
    assert.equal(usage.estimate.day, '2026-10-01');
    assert.equal(usage.estimate.month, '2026-10');
    assert.deepEqual(usage.estimate.today, { posts: 125, costUsd: 25 });
    assert.deepEqual(usage.estimate.monthToDate, { posts: 125, costUsd: 25 });
    timestamp = Date.parse('2026-10-02T10:00:00Z');
    usage = monitor.summary();
    assert.deepEqual(usage.estimate.today, { posts: 0, costUsd: 0 });
    assert.deepEqual(usage.estimate.monthToDate, { posts: 125, costUsd: 25 });
  } finally { store.db.close(); rmSync(dir, { recursive: true, force: true }); }
});
