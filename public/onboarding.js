const $ = (selector) => document.querySelector(selector);

export function onboarding({ api, refresh, toast }) {
  const dialog = $('#onboarding');
  let step = 0;
  let offered = false;
  let resumeAfterProject = false;
  let setupToken = new URLSearchParams(location.hash.slice(1)).get('setup') || '';
  if (setupToken) history.replaceState(null, '', location.pathname + location.search);

  function showStep(value) {
    step = value;
    document.querySelectorAll('[data-setup-page]').forEach((node) => { node.hidden = Number(node.dataset.setupPage) !== step; });
    document.querySelectorAll('[data-step]').forEach((node) => {
      if (Number(node.dataset.step) === step) node.setAttribute('aria-current', 'step');
      else node.removeAttribute('aria-current');
    });
    $('#setup-back').disabled = step === 0;
    $('#setup-next').hidden = step === 3;
    $('#setup-feedback').textContent = '';
    dialog.scrollTop = 0;
    if (dialog.open) $('#onboarding-title').focus();
  }
  function open(value = 0) {
    offered = true;
    showStep(value);
    if (!dialog.open) dialog.showModal();
  }
  function update(state) {
    $('#setup-ai-state').textContent = state.openaiConfigured ? 'Anahtar kayıtlı. Yeni değer girmediğinde korunur. Kaydetmek bağlantıyı test etmez.' : 'Henüz bir OpenAI anahtarı kayıtlı değil.';
    $('#setup-project-state').textContent = state.catalog.length ? `${state.catalog.length} proje hazır. İstersen başka bir proje ekleyebilirsin.` : 'Henüz proje eklemedin. API anahtarı olmadan elle de ekleyebilirsin.';
    $('#setup-callback').value = state.callbackUrl;
    $('#setup-x-state').textContent = state.xAccount ? `@${state.xAccount.username} bağlı.` : state.xConfigured ? 'X uygulama bilgileri kayıtlı. Şimdi kendi hesabına izin ver.' : 'OAuth 2.0 bilgilerini yukarıya gir.';
    $('#setup-x-connect').classList.toggle('hidden', !state.xConfigured || Boolean(state.xAccount));
    $('#setup-schedule').checked = state.scheduleEnabled;
    $('#setup-hour').textContent = `${String(state.draftHour).padStart(2, '0')}:00`;
    $('#setup-summary').textContent = [state.openaiConfigured ? 'OpenAI anahtarı kayıtlı' : 'OpenAI: elle taslak kullanabilirsin', `${state.catalog.length} proje`, state.xAccount ? `X: @${state.xAccount.username}` : 'X henüz bağlı değil; yayın öncesinde bağlamalısın'].join(' · ');
    if (!offered && (!state.openaiConfigured || !state.catalog.length || !state.xConfigured)) open();
  }
  async function save(form, changes, success) {
    const button = form.querySelector('button[type="submit"]');
    button.disabled = true;
    $('#setup-feedback').textContent = 'Kaydediliyor…';
    try {
      await api('/api/settings', 'POST', changes);
      form.querySelectorAll('input[type="password"]').forEach((input) => { input.value = ''; });
      await refresh();
      $('#setup-feedback').textContent = success;
    } catch (error) { $('#setup-feedback').textContent = error.message; }
    finally { button.disabled = false; }
  }
  $('#onboarding-open').addEventListener('click', () => open());
  $('#onboarding-close').addEventListener('click', () => dialog.close());
  $('#setup-finish').addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => dialog.querySelectorAll('input[type="password"]').forEach((input) => { input.value = ''; }));
  document.querySelectorAll('[data-step]').forEach((button) => button.addEventListener('click', () => showStep(Number(button.dataset.step))));
  $('#setup-next').addEventListener('click', () => showStep(Math.min(3, step + 1)));
  $('#setup-back').addEventListener('click', () => showStep(Math.max(0, step - 1)));
  $('#setup-add-project').addEventListener('click', () => { resumeAfterProject = true; dialog.close(); $('#project-dialog').showModal(); });
  $('#project-dialog').addEventListener('close', () => {
    if (resumeAfterProject) { resumeAfterProject = false; open(1); }
  });
  $('#ai-settings-form').addEventListener('submit', (event) => {
    event.preventDefault();
    save(event.currentTarget, { OPENAI_API_KEY: $('#setup-openai-key').value.trim() }, 'Anahtar kaydedildi. Sonraki adımda projenin URL’sini ekleyebilirsin.');
  });
  $('#x-settings-form').addEventListener('submit', (event) => {
    event.preventDefault();
    save(event.currentTarget, { X_CLIENT_ID: $('#setup-x-id').value.trim(), X_CLIENT_SECRET: $('#setup-x-secret').value.trim() }, 'X bilgileri kaydedildi. Bilgiler değiştiyse X izin ekranını açarak yeniden bağlan.');
  });
  $('#schedule-form').addEventListener('submit', (event) => {
    event.preventDefault();
    save(event.currentTarget, { SCHEDULE_ENABLED: $('#setup-schedule').checked }, 'Günlük üretim tercihin kaydedildi.');
  });
  document.querySelectorAll('[data-copy]').forEach((button) => button.addEventListener('click', async () => {
    const source = document.getElementById(button.dataset.copy);
    try { await navigator.clipboard.writeText(source.value); toast('Kopyalandı.'); }
    catch { source.focus(); source.select(); toast('Metin seçildi; kopyalama kısayolunu kullan.'); }
  }));
  $('#owner-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const password = $('#owner-password').value;
    if (password !== $('#owner-confirm').value) { $('#owner-error').textContent = 'Şifreler eşleşmiyor.'; return; }
    const button = event.currentTarget.querySelector('button'); button.disabled = true;
    try {
      await api('/api/setup/owner', 'POST', { password }, { 'X-Setup-Token': setupToken });
      setupToken = '';
      $('#owner-form').reset();
      $('#owner-setup').classList.add('hidden');
      await refresh(false);
    } catch (error) { $('#owner-error').textContent = error.message; }
    finally { button.disabled = false; }
  });
  return { update, async start() {
    try {
      const result = await api('/api/setup/status');
      if (!result.needsOwner) return refresh(false);
      $('#owner-setup').classList.remove('hidden');
      if (!setupToken) {
        $('#owner-error').textContent = 'İlk kurulum için Mac uygulamasını yeniden aç veya terminalde gösterilen kurulum bağlantısını kullan.';
        $('#owner-form button').disabled = true;
      }
    } catch (error) { toast(error.message, true); }
  } };
}
