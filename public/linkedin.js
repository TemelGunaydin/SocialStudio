// Shared manual handoff behavior; no social network SDK, upload, or publish API.
function manualEditor({ api, toast }, platform, label, limit) {
  const node = (name) => document.getElementById(`${platform}-${name}`);
  const dialog = node('dialog');
  const text = node('text');
  const video = node('video-preview');
  const fileInput = node('video-file');
  let record = null;
  let working = false;
  let canGenerate = false;
  let videoName = '';
  let videoUrl = null;

  const changed = () => record && (text.value.trim() !== record.text || videoName !== record.video_name);
  const feedback = (message) => { node('feedback').textContent = message; };
  function update() {
    const length = text.value.trim().length;
    const valid = Boolean(record) && length > 0 && length <= limit;
    node('count').textContent = `${length} / ${limit} · bağlantı dahil`;
    node('count').classList.toggle('over', length > limit);
    text.setAttribute('aria-invalid', String(length > limit));
    text.readOnly = working;
    node('generate').disabled = working || !record || !canGenerate;
    node('save').disabled = working || !valid;
    node('copy').disabled = working || !valid;
    node('video-choose').disabled = working || !record;
    node('video-remove').disabled = working;
    node('video-remove').hidden = !videoName;
    node('video-name').textContent = !videoName ? 'Henüz video seçilmedi.'
      : videoUrl ? videoName : `Kayıtlı dosya: ${videoName}. Önizlemek için bu dosyayı yeniden seç.`;
    node('save-state').textContent = !record ? '' : changed() || !record.revision
      ? 'Henüz kaydedilmedi. X taslağından ayrı saklanır.' : 'Kaydedildi · X taslağından ayrı saklanır.';
  }
  function clearVideo() {
    video.pause(); video.removeAttribute('src'); video.load(); video.hidden = true;
    if (videoUrl) URL.revokeObjectURL(videoUrl);
    videoUrl = null; fileInput.value = '';
  }
  function close() {
    if (working) return feedback('İşlemin bitmesini bekle; bu pencereyi sonra kapatabilirsin.');
    if (changed() && !confirm(`Kaydedilmemiş ${label} değişikliklerini bırakmak istiyor musun?`)) return;
    dialog.close();
  }
  node('close').addEventListener('click', close);
  dialog.addEventListener('cancel', (event) => { event.preventDefault(); close(); });
  dialog.addEventListener('close', () => { clearVideo(); record = null; });
  window.addEventListener('beforeunload', (event) => {
    if (dialog.open && (changed() || working)) { event.preventDefault(); event.returnValue = ''; }
  });
  text.addEventListener('input', () => { feedback(''); update(); });
  node('save').addEventListener('click', async () => {
    if (!record || working) return;
    working = true; update(); feedback('Kaydediliyor…');
    try {
      const result = await api(`/api/drafts/${record.draft_id}/${platform}`, 'POST', {
        text: text.value, videoName, revision: record.revision
      });
      record = result[platform]; text.value = record.text;
      feedback(`${label} taslağı bu bilgisayara kaydedildi. Hiçbir paylaşım yapılmadı.`);
    } catch (error) { feedback(error.message); }
    finally { working = false; update(); }
  });
  node('generate').addEventListener('click', async () => {
    if (!record || working || !canGenerate) return;
    if (!confirm('Kayıtlı X metni ve proje bilgileri OpenAI’ye gönderilecek; ücret oluşabilir. Buradaki metin yeniden yazılacak. Devam edilsin mi?')) return;
    working = true; update(); feedback(`${label} için hazırlanıyor…`);
    try {
      const result = await api(`/api/drafts/${record.draft_id}/${platform}/generate`, 'POST');
      text.value = result.text;
      feedback('Öneri hazır. İddiaları kontrol et, düzenle ve kaydet. Henüz kaydedilmedi veya paylaşılmadı.');
    } catch (error) { feedback(error.message); }
    finally { working = false; update(); }
  });
  node('copy').addEventListener('click', async () => {
    if (!record || working) return;
    const copy = text.value.trim();
    if (!copy || copy.length > limit) return;
    try {
      await navigator.clipboard.writeText(copy);
      feedback(`Metin kopyalandı. ${label} paylaşım ekranına yapıştır; videoyu ayrıca ekle.`);
    } catch {
      text.value = copy; text.focus(); text.select();
      feedback('Otomatik kopyalama kullanılamıyor. Metin seçildi; ⌘C / Ctrl+C veya cihazının Kopyala komutunu kullan.');
    }
  });
  node('video-choose').addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    if (!/\.mp4$/i.test(file.name) || !file.size || file.name.length > 255) {
      fileInput.value = ''; return feedback('Önizleme için geçerli bir MP4 dosyası seç.');
    }
    clearVideo(); videoName = file.name; videoUrl = URL.createObjectURL(file);
    video.src = videoUrl; video.hidden = false;
    feedback(`Video yalnızca bu tarayıcıda açıldı. ${label} paylaşım ekranında kendin yüklemelisin.`);
    update();
  });
  video.addEventListener('error', () => {
    if (videoUrl) feedback('Tarayıcı bu videoyu oynatamıyor. MP4/H.264 sürümünü seç veya dosyayı bilgisayarında kontrol et.');
  });
  node('video-remove').addEventListener('click', () => {
    clearVideo(); videoName = ''; feedback('Video seçimi kaldırıldı.'); update();
  });

  return { async open(draft, projectName, configured) {
    if (dialog.open) return;
    record = null; working = true; canGenerate = configured; videoName = '';
    clearVideo(); text.value = ''; dialog.scrollTop = 0;
    node('project').textContent = projectName;
    node('ai-note').textContent = configured
      ? 'AI yeniden yazımı İngilizcedir ve OpenAI ücreti oluşabilir. Açmak, elle düzenlemek ve kopyalamak API çağrısı yapmaz.'
      : 'Metni ücretsiz olarak elle düzenleyebilirsin. AI yeniden yazımı için kurulumdan OpenAI anahtarı ekle.';
    feedback('Taslak açılıyor…'); update(); dialog.showModal();
    try {
      const result = await api(`/api/drafts/${draft.id}/${platform}`);
      record = result[platform]; text.value = record.text; videoName = record.video_name;
      feedback(record.revision ? `Kayıtlı ${label} taslağın açıldı.` : `Başlangıç metni X taslağından alındı. ${label} için düzenle veya AI ile yeniden yaz.`);
    } catch (error) { dialog.close(); toast(error.message, true); }
    finally { working = false; update(); }
  } };
}

export const linkedInEditor = (options) => manualEditor(options, 'linkedin', 'LinkedIn', 3000);
export const tikTokEditor = (options) => manualEditor(options, 'tiktok', 'TikTok', 2200);
