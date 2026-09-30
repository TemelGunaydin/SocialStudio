import { connectedAccount, readCredits } from './x.mjs';

// X's published URL-post rate, verified 2026-09-30. This is an estimate,
// not a billing ledger. See https://docs.x.com/x-api/getting-started/pricing.
const urlPostCostUsd = 0.2;
const cacheDuration = 5 * 60_000;
const refreshCooldown = 30_000;

function localDay(date) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Istanbul', year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function createUsageMonitor(store, { fetchImpl = fetch, clock = () => Date.now() } = {}) {
  let lastAttempt = null;
  let error = null;
  let pending = null;
  let activeKey = null;
  let snapshot = null;

  function syncAccount() {
    const account = connectedAccount(store);
    const key = account ? `${process.env.X_CLIENT_ID || ''}:${account.id}` : null;
    if (key !== activeKey) {
      activeKey = key;
      lastAttempt = null;
      error = null;
      const saved = store.getSetting.get('x_credits')?.value;
      snapshot = saved ? JSON.parse(saved) : null;
      if (!key || snapshot?.accountKey !== key) snapshot = null;
      if (snapshot) lastAttempt = new Date(snapshot.updatedAt).getTime();
    }
    return key;
  }

  function summary() {
    const connected = Boolean(syncAccount());
    const timestamp = clock();
    const day = localDay(new Date(timestamp));
    const month = day.slice(0, 7);
    // Istanbul uses UTC+03:00. Query all stored posts, beyond the queue's 120-row limit.
    const todayStart = new Date(`${day}T00:00:00+03:00`).toISOString();
    const monthStart = new Date(`${month}-01T00:00:00+03:00`).toISOString();
    const counts = store.publishedUsage.get(todayStart, monthStart, new Date(timestamp).toISOString());
    const estimate = (posts) => ({ posts, costUsd: Math.round(posts * urlPostCostUsd * 100) / 100 });
    return {
      connected,
      balance: snapshot ? { totalUsd: snapshot.totalUsd, prepaidUsd: snapshot.prepaidUsd, freeUsd: snapshot.freeUsd, updatedAt: snapshot.updatedAt } : null,
      stale: Boolean(snapshot && (error || timestamp - new Date(snapshot.updatedAt).getTime() >= cacheDuration)),
      error,
      estimate: { day, month, today: estimate(counts.today), monthToDate: estimate(counts.month), urlPostCostUsd, pricingCheckedAt: '2026-09-30' }
    };
  }

  async function refresh(force = false) {
    const key = syncAccount();
    if (!key) return summary();
    if (pending) { await pending; return summary(); }
    const timestamp = clock();
    if (lastAttempt !== null && timestamp - lastAttempt < (force ? refreshCooldown : cacheDuration)) return summary();
    lastAttempt = timestamp;
    pending = (async () => {
      try {
        const credits = await readCredits(store, fetchImpl);
        if (syncAccount() !== key) return;
        snapshot = { ...credits, accountKey: key, updatedAt: new Date(clock()).toISOString() };
        store.setSetting.run('x_credits', JSON.stringify(snapshot));
        error = null;
      } catch (failure) {
        if (syncAccount() === key) error = failure.message;
      }
    })();
    try { await pending; } finally { pending = null; }
    return summary();
  }

  function invalidate() { lastAttempt = null; }
  return { summary, refresh, invalidate };
}
