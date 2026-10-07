import { onboarding } from './onboarding.js';
const $ = (selector) => document.querySelector(selector);
let state = null;
let selectedId = null;
let filter = 'draft';
let busy = false;
let dirty = false;
let usageBusy = false;

const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
const appFor = (id) => state.catalog.find((app) => app.id === id);
const selected = () => state?.drafts.find((draft) => draft.id === selectedId);
const formatDate = (value) => new Intl.DateTimeFormat('tr-TR', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Europe/Istanbul' }).format(new Date(value));
const formatUsd = (value) => new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'USD' }).format(value);

function toast(message, error = false) {
  const node = $('#toast');
  node.textContent = message;
  node.classList.toggle('error', error);
  node.classList.add('show');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => node.classList.remove('show'), 5000);
}

async function api(path, method = 'GET', body, extraHeaders = {}) {
  const response = await fetch(path, {
    method,
    credentials: 'same-origin',
    headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...extraHeaders },
    body: body ? JSON.stringify(body) : undefined
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || `İstek başarısız (${response.status}).`);
  return result;
}

function setLoggedIn(value) {
  $('#login').classList.toggle('hidden', value);
  $('#workspace').classList.toggle('hidden', !value);
  if (!value) $('#onboarding').close();
}

async function refresh(preserve = true) {
  try {
    const next = await api('/api/state');
    state = next;
    setLoggedIn(true);
    if (!preserve || !state.drafts.some((draft) => draft.id === selectedId)) selectedId = state.drafts.find((draft) => draft.status === 'draft')?.id || state.drafts[0]?.id || null;
    dirty = false;
    render();
    refreshUsage();
  } catch (error) {
    if (error.message === 'Oturum açın.') setLoggedIn(false);
    else toast(error.message, true);
  }
}

function render() {
  if (!state) return;
  const drafts = state.drafts;
  const pending = drafts.filter((draft) => draft.status === 'draft').length;
  const monthParts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul', year: 'numeric', month: '2-digit' }).formatToParts(new Date());
  const monthValues = Object.fromEntries(monthParts.map((part) => [part.type, part.value]));
  const month = `${monthValues.year}-${monthValues.month}`;
  const published = drafts.filter((draft) => draft.status === 'published' && draft.published_at?.slice(0, 7) === month).length;
  $('#metric-pending').textContent = pending;
  $('#nav-pending').textContent = pending;
  $('#metric-published').textContent = published;
  $('#metric-next').textContent = state.scheduleEnabled ? `${String(state.draftHour).padStart(2, '0')}:00` : 'Kapalı';
  $('#generation-hint').textContent = state.openaiConfigured ? 'Yapay zekâ ile yeni metin' : 'OPENAI_API_KEY eklenince AI taslakları açılır';
  $('#generate').disabled = !state.openaiConfigured || !state.catalog.length || busy;
  $('#manual-open').disabled = !state.catalog.length;
  $('#project-suggest').disabled = !state.openaiConfigured;
  if (!$('#project-dialog').open) $('#project-suggest-status').textContent = state.openaiConfigured
    ? 'OpenAI okuması ücretlendirilir. Önerileri kontrol etmeden kaydetme.'
    : 'OPENAI_API_KEY yok; proje bilgilerini elle doldurabilirsin.';
  $('#project-summary').textContent = state.catalog.length ? `${state.catalog.length} proje · Yeni proje ekleyebilir, mevcut taslakları koruyabilirsin.` : 'Önce ürün bağlantısını ve doğrulanmış özelliklerini ekle.';
  $('#app-select').innerHTML = '<option value="">Sıradaki uygulama</option>' + state.catalog.map((app) => `<option value="${app.id}">${escapeHtml(app.name)}</option>`).join('');
  $('#manual-app').innerHTML = state.catalog.map((app) => `<option value="${app.id}">${escapeHtml(app.name)}</option>`).join('');
  renderConnection();
  renderBanners();
  renderUsage();
  renderList();
  renderReview();
  setup.update(state);
}

function renderUsage() {
  const usage = state?.usage;
  if (!usage) return;
  const { balance, estimate, connected, stale, error } = usage;
  $('#usage-balance').textContent = balance ? formatUsd(balance.totalUsd) : '-';
  $('#balance-label').textContent = stale ? 'SON BİLİNEN X BAKİYESİ' : 'KALAN X BAKİYESİ';
  $('#usage-balance-detail').textContent = balance ? `Ön ödemeli ${formatUsd(balance.prepaidUsd)} · Ücretsiz ${formatUsd(balance.freeUsd)}` : connected ? "X API'den alınır · USD" : 'Bakiyeyi görmek için X hesabını bağla';
  $('#usage-today').textContent = formatUsd(estimate.today.costUsd);
  $('#usage-month').textContent = formatUsd(estimate.monthToDate.costUsd);
  $('#usage-today-detail').textContent = `${estimate.today.posts} bağlantılı gönderi · İstanbul saati`;
  $('#usage-month-detail').textContent = `${estimate.monthToDate.posts} bağlantılı gönderi · Ay başından bugüne`;
  $('#usage-unit-price').textContent = formatUsd(estimate.urlPostCostUsd);
  $('#usage-pricing-date').textContent = `Fiyat kontrolü: ${estimate.pricingCheckedAt.split('-').reverse().join('.')}`;
  $('#usage-updated').textContent = usageBusy ? 'Kontrol ediliyor…' : balance ? `Son güncelleme: ${formatDate(balance.updatedAt)}` : connected ? 'Bakiye henüz alınamadı' : 'X bağlantısı gerekli';
  $('#usage-refresh').disabled = !connected || usageBusy;
  $('#usage-error').classList.toggle('hidden', !error);
  $('#usage-error').textContent = error ? `${balance ? 'Son bilinen bakiye gösteriliyor. ' : ''}Bakiye güncellenemedi: ${error}` : '';
}

async function refreshUsage(force = false) {
  if (!state || usageBusy) return;
  usageBusy = true;
  renderUsage();
  try {
    const result = await api(force ? '/api/usage/refresh' : '/api/usage', force ? 'POST' : 'GET');
    if (state) state.usage = result.usage;
  } catch (error) {
    if (state) { state.usage.error = error.message; state.usage.stale = Boolean(state.usage.balance); }
  } finally {
    usageBusy = false;
    if (state) renderUsage();
  }
}

function renderConnection() {
  const account = state.xAccount;
  $('#connection-card').innerHTML = account ? `
    <div class="connection-top"><span class="status-light"></span><span>X HESABI BAĞLI</span></div>
    <div class="connection-account"><div class="x-logo">𝕏</div><div><strong>@${escapeHtml(account.username)}</strong><small>Yayın için hazır</small></div></div>
    <button id="disconnect" class="connection-action">Bağlantıyı kes <span>↗</span></button>` : `
    <div class="connection-top"><span class="status-light off"></span><span>X HESABI BAĞLI DEĞİL</span></div>
    <p>Onaylanan gönderileri yayınlamak için hesabını bağla.</p>
    ${state.xConfigured ? '<a href="/api/x/connect" class="connection-action">X hesabını bağla <span>↗</span></a>' : '<small class="config-hint">OAuth 2.0 Client ID ve Client Secret gerekli. API Key farklıdır.</small>'}`;
  $('#disconnect')?.addEventListener('click', async () => {
    try { await api('/api/x/disconnect', 'POST'); await refresh(); toast('X bağlantısı kesildi.'); }
    catch (error) { toast(error.message, true); }
  });
}

function renderBanners() {
  const missing = [];
  if (!state.openaiConfigured) missing.push('OpenAI API anahtarı');
  if (!state.xConfigured) missing.push('X uygulama bilgileri');
  if (!state.catalog.length) missing.push('tanıtılacak proje');
  $('#setup-banner').classList.toggle('hidden', !missing.length);
  $('#setup-banner').innerHTML = missing.length ? `<span class="banner-icon">✳</span><div><strong>Kurulum tamamlanıyor</strong><p>${escapeHtml(missing.join(' ve '))} henüz ayarlanmadı. Manuel taslak oluşturup paneli inceleyebilirsin.</p></div>` : '';
  const run = state.dailyRun;
  $('#daily-banner').classList.toggle('hidden', run?.result !== 'failed');
  $('#daily-banner').textContent = run?.result === 'failed' ? `Bugünkü otomatik taslak oluşturulamadı: ${run.error}` : '';
}

function listForFilter() {
  if (filter === 'draft') return state.drafts.filter((draft) => ['draft', 'publishing', 'uncertain'].includes(draft.status));
  if (filter === 'published') return state.drafts.filter((draft) => draft.status === 'published');
  return state.drafts;
}

function statusLabel(status) {
  return { draft: 'Onay bekliyor', publishing: 'Yayınlanıyor', published: 'Yayınlandı', rejected: 'Reddedildi', uncertain: 'X üzerinde kontrol et' }[status] || status;
}

function renderList() {
  document.querySelectorAll('.nav-item').forEach((button) => button.classList.toggle('active', button.dataset.filter === filter));
  const title = { draft: 'İnceleme bekleyenler', published: 'Yayınlananlar', all: 'Tüm taslaklar' }[filter];
  $('#queue-title').textContent = title;
  const drafts = listForFilter();
  $('#queue-count').textContent = `${drafts.length} taslak`;
  $('#draft-list').innerHTML = drafts.length ? drafts.map((draft) => {
    const app = appFor(draft.app_id);
    return `<button class="draft-card ${selectedId === draft.id ? 'selected' : ''}" data-id="${draft.id}">
      <img src="${app.icon}" alt="" class="draft-icon">
      <div class="draft-body"><div class="draft-top"><strong>${escapeHtml(app.name)}</strong><span>${formatDate(draft.created_at)}</span></div>
      <p>${escapeHtml(draft.text)}</p><div class="draft-bottom"><span class="status-badge ${draft.status}"><i></i>${statusLabel(draft.status)}</span>${draft.media_kind !== 'none' ? '<span class="image-flag">▧ Görsel</span>' : ''}</div></div>
    </button>`;
  }).join('') : `<div class="empty-queue"><div class="empty-icon">✧</div><strong>Burada henüz taslak yok.</strong><p>${filter === 'draft' ? 'Yeni bir taslak üret veya manuel olarak ekle.' : 'Bu bölümde henüz kayıt bulunmuyor.'}</p></div>`;
  document.querySelectorAll('.draft-card').forEach((button) => button.addEventListener('click', () => {
    if (dirty && !confirm('Kaydedilmemiş değişiklikleri bırakmak istiyor musun?')) return;
    selectedId = button.dataset.id;
    dirty = false;
    renderList(); renderReview();
  }));
}

function mediaUrl(draft, app) {
  if (draft.media_kind === 'icon') return app.icon;
  if (['generated', 'uploaded'].includes(draft.media_kind) && draft.media_path) return `/api/images/${draft.media_path}`;
  return null;
}

function weightedLength(value) {
  return [...value].reduce((sum, ch) => sum + (ch.codePointAt(0) > 0x10ff ? 2 : 1), 0);
}

function renderReview() {
  const draft = selected();
  if (!draft) {
    $('#review-panel').innerHTML = `<div class="review-empty"><div class="review-empty-art">✦</div><span class="eyebrow">REVIEW DESK</span><h2>Taslak seç</h2><p>İncelemek istediğin taslağa dokun. Metin, görsel ve link burada görünecek.</p></div>`;
    return;
  }
  const app = appFor(draft.app_id);
  const editable = draft.status === 'draft';
  const image = mediaUrl(draft, app);
  $('#review-panel').innerHTML = `
    <div class="review-header"><div><span class="eyebrow">REVIEW DESK / ${escapeHtml(app.category.toUpperCase())}</span><h2>${escapeHtml(app.name)}</h2></div><span class="status-badge ${draft.status}"><i></i>${statusLabel(draft.status)}</span></div>
    <div class="review-inner">
      <div class="source-note"><div class="source-icon">⌁</div><div><strong>${draft.feature === 'Manual draft' ? 'Manuel taslak' : 'Ürün sayfasından alınan özellik'}</strong><p>${draft.feature === 'Manual draft' ? 'Metni yayınlamadan önce ürün sayfasındaki bilgilerle karşılaştır.' : escapeHtml(draft.feature)}</p><a href="${app.url}" target="_blank" rel="noopener noreferrer">Ürün sayfasını aç ↗</a></div></div>
      <div class="field-head"><label for="post-text">Gönderi metni</label><span id="char-count">${280 - weightedLength(draft.text) - 25} karakter kaldı</span></div>
      <textarea id="post-text" rows="5" ${editable ? '' : 'disabled'}>${escapeHtml(draft.text)}</textarea>
      <div class="field-head link-head"><span>Bağlantı</span><span>Otomatik eklenir</span></div><div class="link-box"><span>↗</span><span>${escapeHtml(draft.url)}</span></div>
      <div class="field-head media-head"><span>Görsel</span><span>İsteğe bağlı</span></div>
      <div class="media-choices ${editable ? '' : 'disabled'}">
        <button data-media="none" class="media-choice ${draft.media_kind === 'none' ? 'active' : ''}" ${editable ? '' : 'disabled'}>Görselsiz</button>
        <button data-media="icon" class="media-choice ${draft.media_kind === 'icon' ? 'active' : ''}" ${editable && app.icon !== '/favicon.svg' ? '' : 'disabled'}>Uygulama ikonu</button>
        <button id="image-generate" class="media-choice ${draft.media_kind === 'generated' ? 'active' : ''}" ${editable && state.openaiConfigured ? '' : 'disabled'}>✦ Görsel üret</button>
        <button id="image-upload" class="media-choice ${draft.media_kind === 'uploaded' ? 'active' : ''}" ${editable ? '' : 'disabled'}>▧ Görsel yükle</button>
        <input type="file" id="image-file" accept="image/png,image/jpeg,image/webp" hidden>
      </div>
      ${image ? `<div class="media-preview"><img src="${image}" alt="Seçilen gönderi görseli"><span>${draft.media_kind === 'generated' ? 'AI GÖRSELİ' : draft.media_kind === 'uploaded' ? 'YÜKLENEN GÖRSEL' : 'UYGULAMA İKONU'}</span></div>` : ''}
      <div class="preview-heading"><span class="eyebrow">LIVE PREVIEW</span><span>X üzerinde yaklaşık görünüm</span></div>
      <div class="post-preview"><div class="preview-avatar">X</div><div class="preview-content"><div class="preview-author"><strong>${escapeHtml(state.xAccount?.name || 'X hesabın')}</strong><span>@${escapeHtml(state.xAccount?.username || 'x-hesabin')} · şimdi</span><span class="preview-x">𝕏</span></div><p id="preview-copy">${escapeHtml(draft.text)}</p><a href="${app.url}" target="_blank" rel="noopener noreferrer">${escapeHtml(draft.url)}</a>${image ? `<img src="${image}" class="preview-image" alt="Gönderi görseli">` : ''}<div class="preview-engagement">♡ <span>◌</span> ⇄ <span>↗</span></div></div></div>
      ${draft.error ? `<div class="draft-error">${escapeHtml(draft.error)}</div>` : ''}
      ${draft.status === 'uncertain' ? '<div class="uncertain-note">X yanıtı kesinleşmedi. Yeni bir gönderi oluşturmadan önce X hesabındaki son paylaşımları kontrol et.</div>' : ''}
      ${draft.status === 'published' && draft.x_post_id ? `<a class="published-link" href="https://x.com/i/web/status/${draft.x_post_id}" target="_blank" rel="noopener noreferrer">X gönderisini aç ↗</a>` : ''}
      ${editable ? `<div class="review-actions"><button id="reject" class="button light">Reddet</button><button id="save" class="button light">Değişiklikleri kaydet</button><button id="publish" class="button primary" ${state.xAccount ? '' : 'disabled'}>Onayla ve yayınla ↗</button></div>${state.xAccount ? '' : '<p class="publish-hint">Yayınlamak için önce X hesabını bağla.</p>'}` : ''}
    </div>`;
  if (editable) bindEditor(draft);
}

function bindEditor(draft) {
  const textarea = $('#post-text');
  textarea.addEventListener('input', () => {
    dirty = true;
    const remaining = 280 - weightedLength(textarea.value.trim()) - 25;
    $('#char-count').textContent = `${remaining} karakter kaldı`;
    $('#char-count').classList.toggle('over', remaining < 0);
    $('#preview-copy').textContent = textarea.value;
  });
  document.querySelectorAll('[data-media]').forEach((button) => button.addEventListener('click', async () => {
    try { await saveDraft(draft.id, button.dataset.media); toast('Görsel seçimi kaydedildi.'); }
    catch (error) { toast(error.message, true); }
  }));
  $('#save').addEventListener('click', async () => {
    try { await saveDraft(draft.id, draft.media_kind); toast('Taslak kaydedildi.'); }
    catch (error) { toast(error.message, true); }
  });
  $('#reject').addEventListener('click', async () => {
    if (!confirm('Bu taslağı reddetmek istiyor musun?')) return;
    try { await api(`/api/drafts/${draft.id}/reject`, 'POST'); await refresh(); toast('Taslak reddedildi.'); }
    catch (error) { toast(error.message, true); }
  });
  $('#publish')?.addEventListener('click', async () => {
    if (busy) return;
    busy = true;
    $('#publish').disabled = true;
    $('#publish').textContent = 'Yayınlanıyor…';
    try {
      if (dirty) await saveDraft(draft.id, draft.media_kind);
      await api(`/api/drafts/${draft.id}/publish`, 'POST');
      await refresh(); toast('Gönderi X üzerinde yayınlandı.');
    } catch (error) { await refresh(); toast(error.message, true); }
    finally { busy = false; }
  });
  $('#image-generate').addEventListener('click', async () => {
    if (busy) return;
    busy = true;
    $('#image-generate').textContent = 'Üretiliyor…';
    $('#image-generate').disabled = true;
    try {
      if (dirty) await saveDraft(draft.id, draft.media_kind);
      await api(`/api/drafts/${draft.id}/image/generate`, 'POST');
      await refresh(); toast('Yeni görsel taslağa eklendi.');
    } catch (error) { toast(error.message, true); renderReview(); }
    finally { busy = false; }
  });
  $('#image-upload').addEventListener('click', () => $('#image-file').click());
  $('#image-file').addEventListener('change', async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > 5_000_000) return toast('Görsel 5 MB altında olmalı.', true);
    try {
      if (dirty) await saveDraft(draft.id, draft.media_kind);
      const base64 = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result).split(',')[1]);
        reader.onerror = () => reject(new Error('Dosya okunamadı.'));
        reader.readAsDataURL(file);
      });
      await api(`/api/drafts/${draft.id}/image/upload`, 'POST', { type: file.type, base64 });
      await refresh(); toast('Görsel taslağa eklendi.');
    } catch (error) { toast(error.message, true); }
  });
}

async function saveDraft(id, mediaKind) {
  const text = $('#post-text').value;
  await api(`/api/drafts/${id}`, 'POST', { text, mediaKind });
  await refresh();
}

$('#login-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  try { await api('/api/login', 'POST', { password: $('#password').value }); $('#password').value = ''; await refresh(false); }
  catch (error) { toast(error.message, true); }
});

$('#logout').addEventListener('click', async () => {
  try { await api('/api/logout', 'POST'); state = null; setLoggedIn(false); }
  catch (error) { toast(error.message, true); }
});

$('#usage-refresh').addEventListener('click', () => refreshUsage(true));
setInterval(() => { if (state && !document.hidden) refreshUsage(); }, 5 * 60_000);
document.addEventListener('visibilitychange', () => { if (state && !document.hidden) refreshUsage(); });

document.querySelectorAll('.nav-item').forEach((button) => button.addEventListener('click', () => {
  filter = button.dataset.filter;
  const visible = listForFilter();
  if (!visible.some((draft) => draft.id === selectedId)) selectedId = visible[0]?.id || null;
  renderList(); renderReview();
}));

$('#generate').addEventListener('click', async () => {
  if (busy) return;
  busy = true;
  $('#generate').disabled = true;
  $('#generate').textContent = 'Üretiliyor…';
  try {
    const result = await api('/api/drafts/generate', 'POST', { appId: $('#app-select').value || null });
    selectedId = result.draft.id; filter = 'draft'; await refresh(); toast('Yeni taslak hazır.');
  } catch (error) { toast(error.message, true); render(); }
  finally { busy = false; }
});

$('#project-open').addEventListener('click', () => $('#project-dialog').showModal());
$('#project-url').addEventListener('input', () => {
  $('#project-evidence').replaceChildren();
  $('#project-evidence').classList.add('hidden');
  $('#project-reviewed').checked = false;
  $('#project-suggest-status').textContent = 'Bağlantı değişti. Önerileri yeniden getir veya bilgileri elle doğrula.';
});
$('#project-suggest').addEventListener('click', async () => {
  const input = $('#project-url');
  if (!input.reportValidity()) return;
  const requested = input.value.trim();
  const button = $('#project-suggest');
  button.disabled = true;
  $('#project-suggest-status').textContent = 'Sayfa okunuyor ve öneriler hazırlanıyor…';
  try {
    const { suggestion } = await api('/api/projects/suggest', 'POST', { url: requested });
    if (!$('#project-dialog').open || input.value.trim() !== requested) return;
    input.value = suggestion.url;
    $('#project-name').value = suggestion.name;
    $('#project-category').value = suggestion.category;
    $('#project-platform').value = suggestion.platform;
    $('#project-features').value = suggestion.features.join('\n');
    $('#project-guardrail').value = suggestion.guardrail;
    $('#project-reviewed').checked = false;
    const evidence = $('#project-evidence');
    evidence.replaceChildren();
    const title = document.createElement('strong'); title.textContent = 'Kaynakta bulunan alıntılar — iddiaları yine de kontrol et';
    const list = document.createElement('ul');
    for (const item of suggestion.evidence) {
      const row = document.createElement('li'); row.textContent = `“${item.quote}”`; list.append(row);
    }
    evidence.append(title, list); evidence.classList.remove('hidden');
    $('#project-suggest-status').textContent = 'Öneriler hazır. Özellikleri düzenle, alıntıları ve ürün sayfasını karşılaştır.';
  } catch (error) { $('#project-suggest-status').textContent = error.message; toast(error.message, true); }
  finally { button.disabled = !state?.openaiConfigured; }
});
$('#project-close').addEventListener('click', () => $('#project-dialog').close());
$('#project-cancel').addEventListener('click', () => $('#project-dialog').close());
$('#project-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = $('#project-form');
  const button = form.querySelector('[type="submit"]');
  button.disabled = true;
  try {
    await api('/api/projects', 'POST', {
      name: $('#project-name').value, url: $('#project-url').value,
      category: $('#project-category').value, platform: $('#project-platform').value,
      features: $('#project-features').value, guardrail: $('#project-guardrail').value
    });
    form.reset(); $('#project-evidence').replaceChildren(); $('#project-evidence').classList.add('hidden');
    $('#project-dialog').close(); await refresh(); toast('Proje eklendi. İlk taslağını hazırlayabilirsin.');
  } catch (error) { toast(error.message, true); }
  finally { button.disabled = false; }
});
$('#manual-open').addEventListener('click', () => $('#manual-dialog').showModal());
$('#manual-close').addEventListener('click', () => $('#manual-dialog').close());
$('#manual-cancel').addEventListener('click', () => $('#manual-dialog').close());
$('#manual-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  try {
    const result = await api('/api/drafts/manual', 'POST', { appId: $('#manual-app').value, text: $('#manual-text').value });
    $('#manual-text').value = ''; $('#manual-dialog').close(); selectedId = result.draft.id; filter = 'draft'; await refresh(); toast('Manuel taslak eklendi.');
  } catch (error) { toast(error.message, true); }
});

const params = new URLSearchParams(location.search);
if (params.has('x_error')) toast(params.get('x_error'), true);
if (params.get('x') === 'connected') toast('X hesabı bağlandı.');
if (params.size) history.replaceState(null, '', '/');
const setup = onboarding({ api, refresh, toast });
setup.start();
