const escape = value => String(value ?? '').replace(/[&<>"']/g, ch => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[ch]));
const names = { x: 'Twitter / X', youtube: 'YouTube', tiktok: 'TikTok' };
const marks = { x: '𝕏', youtube: '▶', tiktok: '♪' };
const labels = { draft:'Taslak', scheduled:'Planlandı', publishing:'Yayınlanıyor', published:'Yayınlandı', failed:'Başarısız', uncertain:'Kontrol gerekli' };
const date = value => value ? new Intl.DateTimeFormat('tr-TR', { dateStyle:'medium', timeStyle:'short', timeZone:'Europe/Istanbul' }).format(new Date(value)) : '';
const icon = name => {
  const paths = { compose:'M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L9 17l-4 1 1-4Z', queue:'M8 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2h-3M9 2h6v4H9zM7 11h10M7 16h7', media:'M3 7h6l2-3h10v15H3zM10 10l5 3-5 3z', accounts:'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M16 3a4 4 0 0 1 0 8M22 21v-2a4 4 0 0 0-3-3.9M13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0', automation:'m13 2-9 12h7l-1 8 10-12h-7z', settings:'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M5 19l2-2M17 7l2-2', arrow:'M5 12h14M13 6l6 6-6 6', plus:'M12 5v14M5 12h14', spark:'m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5z' };
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${paths[name] || paths.spark}"/></svg>`;
};
export function createStudio({ api, toast, openProject, openSetup }) {
  const root = document.querySelector('#social-studio');
  let state, catalog = [], view = 'compose', selected = null, pending = false, dirty = false, workingContext = null;
  let creators = new Map();
  const $ = selector => root.querySelector(selector);
  const modelOptions = (models, value) => [...models, ...(!models.some(model => model.id === value) ? [{ id:value, name:value, tier:'Özel' }] : [])].map(model => `<option value="${escape(model.id)}" ${model.id === value ? 'selected' : ''}>${escape(model.name)} · ${escape(model.tier)}</option>`).join('');
  const platformBadge = platform => `<span class="platform-mark ${platform}" aria-hidden="true">${marks[platform]}</span>`;
  const input = (id, label, type = 'text', value = '', placeholder = '') => `<label class="s-field" for="${id}"><span>${label}</span><input id="${id}" type="${type}" value="${escape(value)}" placeholder="${escape(placeholder)}" autocomplete="${type === 'password' ? 'new-password' : 'off'}"></label>`;
  async function load(render = true) {
    state = await api('/api/social/state');
    if (!state.posts.some(post => post.id === selected)) selected = state.posts.find(post => post.status === 'draft')?.id || state.posts[0]?.id;
    document.querySelector('#social-nav-count').textContent = state.posts.filter(post => post.status === 'draft').length;
    if (render) draw();
  }
  function navigation() {
    document.querySelectorAll('[data-studio-view]').forEach(button => button.classList.toggle('active', button.dataset.studioView === view));
    document.querySelector('#legacy-workspace').classList.toggle('hidden', view !== 'legacy');
    root.classList.toggle('hidden', view === 'legacy');
    document.querySelector('.breadcrumb strong').textContent = { compose:'İçerik stüdyosu', queue:'Paylaşım kuyruğu', media:'Medya kütüphanesi', accounts:'Sosyal hesaplar', automation:'Otomatik akış', settings:'API ve modeller', legacy:'Önceki X taslakları' }[view];
  }
  function pageHeader(kicker, title, description, action = '') {
    return `<header class="s-page-head"><div><span class="s-kicker">${kicker}</span><h1>${title}</h1><p>${description}</p></div>${action}</header>`;
  }
  function stats() {
    return `<div class="s-stats"><div><span class="s-stat-icon violet">${icon('compose')}</span><div><strong>${state.posts.filter(p=>p.status==='draft').length}</strong><span>Hazırlandığın içerik</span></div></div><div><span class="s-stat-icon blue">${icon('accounts')}</span><div><strong>${state.accounts.length}</strong><span>Bağlı sosyal hesap</span></div></div><div><span class="s-stat-icon coral">${icon('media')}</span><div><strong>${state.media.filter(m=>m.kind==='video'&&m.status==='available').length}</strong><span>Kütüphanedeki video</span></div></div><div><span class="s-stat-icon green">${icon('queue')}</span><div><strong>${state.posts.filter(p=>p.status==='published').length}</strong><span>Tamamlanan paylaşım</span></div></div></div>`;
  }
  function targets(prefix, platforms = ['x','youtube','tiktok'], selectedIds) {
    return platforms.map(platform => {
      const accounts = state.accounts.filter(account => account.platform === platform);
      return `<div class="s-target ${platform}"><div class="s-target-head">${platformBadge(platform)}<strong>${names[platform]}</strong><span>${accounts.length} hesap</span></div>${accounts.length ? accounts.map(account => `<label class="s-check"><input type="checkbox" name="${prefix}-target" value="${account.id}" data-platform="${platform}" ${!selectedIds || selectedIds.includes(account.id) ? 'checked' : ''}><span>${escape(account.name)}<small>${escape(account.username)}</small></span></label>`).join('') : prefix === 'campaign' ? `<label class="s-check"><input type="checkbox" name="${prefix}-target" value="" data-platform="${platform}" checked><span>Taslak hazırla<small>Hesabı daha sonra bağla</small></span></label>` : '<p class="s-muted">Henüz hesap bağlı değil.</p>'}</div>`;
    }).join('');
  }
  function composer() {
    const posts = state.posts.filter(post => post.batch_id === (state.posts.find(post=>post.id===selected)?.batch_id));
    const current = state.posts.find(post => post.id === selected);
    const context = workingContext ?? current?.context ?? state.context;
    return pageHeader('FİKRİNDEN PAYLAŞIMINA', 'Bir fikir. <span>Üç farklı sahne.</span>', 'Bağlamı sen ver. İçeriğini hazırla, medyanı seç, kendi hesaplarından paylaş.', `<span class="s-local"><i></i> Yerel çalışma alanı</span>`) + stats() + `
    <div class="s-compose-grid"><section class="s-panel s-brief"><div class="s-section-title"><span class="s-step">01</span><div><h2>İçeriğin başlangıç noktası</h2><p>Ne anlatmak istiyorsun?</p></div></div>
      <form id="s-campaign"><label class="s-field" for="s-context"><span>Bağlam ve paylaşım notların</span><textarea id="s-context" rows="7" maxlength="20000" placeholder="Örneğin: Yeni uygulamamı tanıtıyorum. Videoda sesli notların metne dönüştürülmesi var. Hedef kitlem içerik üreticileri. İngilizce, samimi bir paylaşım hazırla; abartılı vaatlerden kaçın." required>${escape(context)}</textarea></label>
      <div class="s-context-foot"><span>Notlarını Türkçe yazabilirsin; AI paylaşımı İngilizce hazırlar.</span><span id="s-context-count">${context.length.toLocaleString('tr-TR')} / 20.000</span></div>
      ${catalog.length ? `<label class="s-field" for="s-project"><span>Proje bağlamı ekle <small>İsteğe bağlı</small></span><select id="s-project"><option value="">Sadece yazdığım bağlam</option>${catalog.map(project=>`<option value="${project.id}">${escape(project.name)}</option>`).join('')}</select></label>` : '<button type="button" class="s-link" data-action="project">+ Tanıtacağın projeyi ekle</button>'}
      <div class="s-ai-choice"><span class="s-ai-icon">${icon('spark')}</span><label class="s-field" for="s-model"><span>Metin ve video seçimi modeli</span><select id="s-model">${modelOptions(state.textModels,current?.model||state.textModel)}</select></label><span class="s-cost-tag">Senin API anahtarın</span></div>
      <div class="s-field"><span>Paylaşım hedeflerin <small>Birden fazla hesap seçebilirsin</small></span></div><div class="s-targets">${targets('campaign')}</div>
      <div class="s-create-footer"><label class="s-check"><input id="s-ai-create" type="checkbox" ${state.openaiConfigured ? 'checked' : 'disabled'}><span>Metinleri AI ile hazırla<small>${state.openaiConfigured ? 'Seçtiğin model kullanılır; API kullanımı ücretlidir.' : 'AI üretimi için ayarlardan OpenAI anahtarını ekle.'}</small></span></label><button class="s-btn primary" type="submit">${icon('plus')} Taslakları oluştur</button></div></form>
    </section><section class="s-panel s-editor-panel"><div class="s-section-title"><span class="s-step">02</span><div><h2>Platforma göre son dokunuş</h2><p>Her hesap için ayrı metin ve medya.</p></div></div>
      ${posts.length ? `<div class="s-tabs" role="tablist" aria-label="Paylaşım platformu">${posts.map(post=>`<button role="tab" aria-selected="${post.id===selected}" data-select="${post.id}" class="s-tab ${post.platform} ${post.id===selected?'selected':''}">${platformBadge(post.platform)}<span>${names[post.platform]}${post.account_name ? `<small>${escape(post.account_name)}</small>`:''}</span></button>`).join('')}</div><div id="s-editor">${editor(state.posts.find(post=>post.id===selected))}</div>` : `<div class="s-empty-editor"><div class="s-empty-platforms">${['x','youtube','tiktok'].map(platformBadge).join('')}</div><h3>İlk paylaşımın burada şekillenecek.</h3><p>Bağlamını yaz, hedeflerini seç ve taslaklarını oluştur. Her platform için ayrı bir düzenleme alanın olacak.</p><div class="s-flow"><span>Bağlam</span><b>→</b><span>AI + medya</span><b>→</b><span>Paylaşım</span></div></div>`}
    </section></div><div class="s-bottom-note">${icon('media')} Video klasörünü bağlayarak AI ile seçim yapabilirsin. Tamamlanan videolar <code>paylasildi/</code> klasörüne taşınır.<button class="s-link" data-view="media">Kütüphaneyi aç ↗</button></div>`;
  }
  function editor(post) {
    if (!post) return '';
    const readOnly = post.status !== 'draft';
    const options = JSON.parse(post.options);
    const creator = creators.get(post.account_id);
    const assets = state.media.filter(media => media.status !== 'published' || media.id === post.media_id);
    return `<form id="s-post-form" data-id="${post.id}"><div class="s-editor-top"><span class="s-status ${post.status}"><i></i>${labels[post.status]}</span><span class="s-muted">${escape(post.account_name || 'Hesap henüz seçilmedi')}</span></div>
      ${post.error ? `<p class="s-error" role="alert">${escape(post.error)}</p>` : ''}
      <fieldset ${readOnly?'disabled':''}><label class="s-field" for="s-account"><span>Yayınlanacak hesap</span><select id="s-account"><option value="">Hesap seç</option>${state.accounts.filter(account=>account.platform===post.platform).map(account=>`<option value="${account.id}" ${account.id===post.account_id?'selected':''}>${escape(account.name)} · ${escape(account.username)}</option>`).join('')}</select></label>
      ${post.platform==='youtube'?`<label class="s-field" for="s-title"><span>Video başlığı</span><input id="s-title" value="${escape(post.title)}" maxlength="100" placeholder="Videonun başlığı"></label>`:''}
      <label class="s-field" for="s-post-text"><span>${post.platform==='youtube'?'Video açıklaması':'Paylaşım metni'}<small id="s-text-count">${post.text.length} / ${{x:280,youtube:5000,tiktok:2200}[post.platform]}</small></span><textarea id="s-post-text" rows="${post.platform==='tiktok'?12:5}" maxlength="${post.platform==='x'?560:post.platform==='youtube'?5000:2200}" placeholder="Metnini yaz veya AI ile üret…">${escape(post.text)}</textarea></label>
      <p class="s-help s-caption-hint">${post.platform==='tiktok'?'AI metni İngilizce hazırlar; emojili özellik satırlarını, çağrıyı, bağlantıyı ve hashtag’leri boş satırlarla ayırır.':post.platform==='x'?'AI, X paylaşımını İngilizce, kısa ve hashtagsiz hazırlar.':'AI video başlığını ve açıklamasını İngilizce hazırlar.'}</p>
      <div class="s-inline-actions"><button type="button" class="s-btn ai" data-post-action="generate" ${!state.openaiConfigured?'disabled':''}>${icon('spark')} Metni yeniden üret</button><span class="s-muted">${escape(post.model)}</span></div>
      <div class="s-media-box"><div class="s-field"><span>${icon('media')} Video ve görsel</span><select id="s-media" aria-label="Paylaşım medyası"><option value="">Medya seçilmedi</option>${assets.filter(asset=>post.platform==='x'||asset.kind==='video').map(asset=>`<option value="${asset.id}" ${post.media_id===asset.id?'selected':''}>${asset.kind==='video'?'Video':'Görsel'} · ${escape(asset.name)}</option>`).join('')}</select></div>
      <div id="s-media-preview">${preview(post.media_id)}</div><div class="s-media-actions"><button type="button" class="s-btn secondary" data-action="upload">${icon('plus')} Video yükle</button><button type="button" class="s-btn ai" data-post-action="select-video" ${!state.openaiConfigured?'disabled':''}>${icon('spark')} AI video seçsin</button><button type="button" class="s-btn secondary" data-post-action="image" ${!state.openaiConfigured?'disabled':''}>Görsel üret</button></div><p class="s-help">AI, dosya adı ve bağlamla seçim yapar. ${post.platform==='x'?'Tek paylaşımda bir video veya görsel kullanılır.':'Görseller kütüphaneye kaydedilir; bu platformda yayın için video gerekir.'}</p></div>
      ${post.platform==='youtube'?`<div class="s-options"><label class="s-field" for="s-privacy"><span>Görünürlük</span><select id="s-privacy">${[['private','Gizli'],['unlisted','Liste dışı'],['public','Herkese açık']].map(([value,label])=>`<option value="${value}" ${options.privacy===value?'selected':''}>${label}</option>`).join('')}</select></label><label class="s-check"><input id="s-kids" type="checkbox" ${options.madeForKids?'checked':''}><span>Çocuklara özel içerik</span></label><label class="s-check"><input id="s-aigc" type="checkbox" ${options.aiGenerated?'checked':''}><span>Gerçekçi, AI ile değiştirilmiş içerik</span></label></div>`:''}
      ${post.platform==='tiktok'?`<div class="s-options"><div class="s-field"><span>TikTok hesap seçenekleri</span><button type="button" class="s-btn secondary" data-action="creator">Hesap bilgilerini yenile</button></div>${creator?`<p class="s-help">${escape(creator.creator_nickname)} · En fazla ${creator.max_video_post_duration_sec} saniye</p>`:'<p class="s-help">Görünürlük için güncel hesap bilgilerini yükle.</p>'}<label class="s-field" for="s-privacy"><span>Görünürlük</span><select id="s-privacy"><option value="">Görünürlük seç</option>${(creator?.privacy_level_options || (options.privacy?[options.privacy]:[])).map(value=>`<option value="${value}" ${options.privacy===value?'selected':''}>${({SELF_ONLY:'Yalnızca ben',PUBLIC_TO_EVERYONE:'Herkese açık',MUTUAL_FOLLOW_FRIENDS:'Arkadaşlar',FOLLOWER_OF_CREATOR:'Takipçiler'})[value]||value}</option>`).join('')}</select></label>${[['comment','Yorumlara izin ver'],['duet','Düete izin ver'],['stitch','Birleştirmeye izin ver']].map(([key,label])=>`<label class="s-check"><input id="s-${key}" type="checkbox" ${creator?.[key+'_disabled']?'disabled':options['allow'+key[0].toUpperCase()+key.slice(1)]?'checked':''}><span>${label}</span></label>`).join('')}<label class="s-check"><input id="s-own-brand" type="checkbox" ${options.ownBrand?'checked':''}><span>Kendi markamı tanıtıyorum<small>Tanıtım içeriği olarak etiketlenir.</small></span></label><label class="s-check"><input id="s-branded" type="checkbox" ${options.branded?'checked':''}><span>Ücretli iş birliği<small>Ücretli ortaklık etiketi eklenir. Gizli paylaşılamaz.</small></span></label><label class="s-check"><input id="s-aigc" type="checkbox" ${options.aiGenerated?'checked':''}><span>AI ile üretilen içerik</span></label><label class="s-check"><input id="s-consent" type="checkbox" ${options.consent?'checked':''}><span>Paylaşarak TikTok <a href="https://www.tiktok.com/legal/page/global/music-usage-confirmation/en" target="_blank" rel="noopener noreferrer">Müzik Kullanım Koşulları</a>'nı kabul ediyorum.</span></label></div>`:''}
      <div class="s-publish-actions"><button class="s-btn secondary" type="submit">Taslağı kaydet</button><button class="s-btn primary" type="button" data-post-action="publish">${icon('arrow')} Şimdi paylaş</button></div><details class="s-schedule"><summary>İleri bir zamana planla</summary><label class="s-field" for="s-schedule-at"><span>İstanbul saati</span><input id="s-schedule-at" type="datetime-local"></label><button class="s-btn secondary" type="button" data-post-action="schedule">Onayla ve planla</button><p class="s-help">Yayın saatinde bu bilgisayar ve uygulama açık olmalı.</p></details></fieldset>
      ${post.status==='scheduled'?`<p class="s-notice">Yayın zamanı: ${date(post.scheduled_at)}</p>`:''}${['scheduled','failed'].includes(post.status)?'<button type="button" class="s-btn secondary" data-post-action="cancel">Taslağa geri al</button>':''}${post.status==='uncertain'?'<p class="s-help">Otomatik tekrar denenmez. Hesabında yayını doğruladıktan sonra tamamlandı olarak işaretleyebilirsin.</p><button type="button" class="s-btn secondary" data-post-action="resolve">Hesabı kontrol ettim: yayınlandı</button>':''}
      ${post.remote_url?`<a class="s-btn secondary" href="${escape(post.remote_url)}" target="_blank" rel="noopener noreferrer">Paylaşımı görüntüle ↗</a>`:''}</form>`;
  }
  function preview(id) {
    const asset = state.media.find(item=>item.id===id);
    if (!asset) return '';
    return asset.kind==='video' ? `<video id="s-video-preview" controls playsinline preload="metadata" src="/api/videos/${asset.stored_name}" aria-label="Seçilen video önizlemesi"></video>` : `<img src="/api/images/${asset.stored_name}" alt="Üretilen paylaşım görseli">`;
  }
  function queue() {
    const filtered = state.posts.filter(post => !$('#s-queue-filter')?.value || post.status === $('#s-queue-filter').value);
    return pageHeader('PAYLAŞIM KUYRUĞU','Her içeriğin <span>durumu belli.</span>','Hazırladığın, planladığın ve yayınladığın içeriklerin tek yerde.') + `<section class="s-panel"><div class="s-section-title"><h2>Paylaşımlar</h2><span class="s-counter">${state.posts.length} içerik</span><button class="s-btn secondary" data-action="refresh">Yenile</button></div>${filtered.length?`<div class="s-table-wrap"><table class="s-table"><thead><tr><th>Platform / hesap</th><th>İçerik</th><th>Durum</th><th>Zaman</th><th></th></tr></thead><tbody>${filtered.map(post=>`<tr><td><div class="s-table-account">${platformBadge(post.platform)}<div><strong>${names[post.platform]}</strong><small>${escape(post.account_name||'Hesap seçilmedi')}</small></div></div></td><td><strong>${escape(post.title||post.text.slice(0,65)||'Boş taslak')}</strong><small>${escape(post.media_name||'Medya seçilmedi')}</small>${post.error?`<span class="s-row-error">${escape(post.error)}</span>`:''}</td><td><span class="s-status ${post.status}"><i></i>${labels[post.status]}</span></td><td>${date(post.scheduled_at||post.updated_at)}</td><td><button class="s-btn secondary" data-select="${post.id}">Aç ↗</button></td></tr>`).join('')}</tbody></table></div>`:empty('Henüz paylaşım yok.','İçerik stüdyosunda ilk taslağını hazırla.','compose')}</section>`;
  }
  function empty(title, description, target) { return `<div class="s-empty"><span>${icon('spark')}</span><h3>${title}</h3><p>${description}</p>${target?`<button class="s-btn secondary" data-view="${target}">İçerik stüdyosunu aç ↗</button>`:''}</div>`; }
  function library() {
    return pageHeader('MEDYA KÜTÜPHANESİ','Videoların hazır. <span>Sıra seçimde.</span>','Videolarını bir kez ekle; her platform için uygun olanı seç.',`<button class="s-btn primary" data-action="upload">${icon('plus')} Video yükle</button>`) + `
      <section class="s-panel s-folder-panel"><div class="s-section-title"><span class="s-stat-icon coral">${icon('media')}</span><div><h2>Video klasörünü bağla</h2><p>Bu uygulamanın çalıştığı bilgisayardaki klasör.</p></div></div><form id="s-folder-form"><label class="s-field" for="s-folder"><span>Klasörün tam yolu</span><input id="s-folder" value="${escape(state.folder)}" placeholder="/Users/adın/Movies/SosyalMedya" required></label><button id="s-folder-choose" class="s-btn secondary" type="button" data-action="choose-folder">${icon('media')} Klasör seç</button><button class="s-btn primary" type="submit">Klasörü tara</button></form><div class="s-folder-flow"><span><i class="s-dot blue"></i> Klasördeki MP4'ler</span><b>→</b><span><i class="s-dot violet"></i> AI veya manuel seçim</span><b>→</b><span><i class="s-dot green"></i> paylasildi/</span></div><p class="s-help">En fazla 100 MB / video. Alt klasörler taranmaz. Kaynak dosya, bağlı bütün paylaşımlar başarıyla tamamlandığında taşınır. Önizleme için yerel bir kopya korunur.</p></section>
      <div class="s-section-title"><h2>Tüm medya</h2><span class="s-counter">${state.media.length} dosya</span></div>${state.media.length?`<div class="s-library-grid">${state.media.map(asset=>`<article class="s-media-card"><div class="s-asset-preview">${asset.kind==='video'?`<video controls preload="metadata" playsinline src="/api/videos/${asset.stored_name}" aria-label="${escape(asset.name)}"></video>`:`<img src="/api/images/${asset.stored_name}" alt="${escape(asset.name)}">`}<span class="s-asset-kind">${asset.kind==='video'?'MP4':'AI GÖRSEL'}</span></div><div class="s-asset-info"><h3>${escape(asset.name)}</h3><div><span>${(asset.size/1_000_000).toFixed(1)} MB</span><span class="s-status ${asset.status==='published'?'published':'draft'}">${asset.status==='published'?'Paylaşıldı':'Kullanılabilir'}</span></div>${asset.error?`<p class="s-error">${escape(asset.error)}</p><button class="s-btn secondary" data-archive="${asset.id}">Arşivlemeyi tekrar dene</button>`:''}</div></article>`).join('')}</div>`:empty('Kütüphanen yeni içeriklerini bekliyor.','Bir video yükle veya video klasörünü seç.')}`;
  }
  function accounts() {
    return pageHeader('SOSYAL HESAPLAR','Birden fazla hesap. <span>Tek çalışma alanı.</span>','Her platforma istediğin hesabı bağla. Paylaşımın hangi hesaba gideceğini sen seç.') + `<div class="s-account-platforms">${['x','youtube','tiktok'].map(platform=>`<section class="s-panel s-account-panel ${platform}"><div class="s-platform-heading">${platformBadge(platform)}<div><h2>${names[platform]}</h2><p>${state.accounts.filter(account=>account.platform===platform).length} bağlı hesap</p></div></div><div class="s-account-list">${state.accounts.filter(account=>account.platform===platform).map(account=>`<div class="s-account-row"><span class="s-avatar ${platform}">${escape(account.name.slice(0,2).toUpperCase())}</span><div><strong>${escape(account.name)}</strong><small>${escape(account.username)}</small></div><button class="s-icon-btn" data-disconnect="${account.id}" aria-label="${escape(account.name)} bağlantısını kes">×</button></div>`).join('')||'<p class="s-muted">İlk hesabını bağlayarak başla.</p>'}</div>${state.connections[platform].configured?`<a class="s-btn secondary full" href="${platform==='x'?'/api/x/connect':`/api/social/oauth/${platform}/connect`}">${icon('plus')} ${names[platform]} hesabı bağla</a>`:'<button class="s-btn secondary full" data-view="settings">Developer API bilgilerini ekle ↗</button>'}<p class="s-help">${platform==='x'?'İkinci hesap için X izin ekranında o hesaba giriş yap. Her hesabın tokenı ayrı saklanır.':platform==='youtube'?'YouTube Data API v3 ve OAuth istemcisi gerekli. Denetlenmemiş API projelerinde yüklemeler gizli kalabilir.':'Content Posting API ve video.publish izni gerekli. TikTok özel kullanım araçlarını onaylamayabilir; onaysız istemcilerde yayın gizlidir.'}</p></section>`).join('')}</div><div class="s-bottom-note">${icon('accounts')} Aynı hesabı tekrar bağlamak izinlerini yeniler. Diğer hesaplarının bağlantısı korunur.</div>`;
  }
  function settings() {
    return pageHeader('BAĞLANTILAR VE MODELLER','Üretimin kontrolü <span>sende.</span>','Kendi API anahtarlarını kullan. Metin ve görsel modellerini ayrı seç.') + `<form id="s-settings-form"><section class="s-panel"><div class="s-section-title"><span class="s-stat-icon violet">${icon('spark')}</span><div><h2>OpenAI</h2><p>${state.openaiConfigured?'Anahtar kayıtlı. Boş bırakırsan korunur.':'Metin, görsel ve video seçimi için API anahtarını ekle.'}</p></div><a class="s-link" href="https://platform.openai.com/api-keys" target="_blank" rel="noopener noreferrer">API anahtarı al ↗</a></div>${input('s-api-key','OpenAI API anahtarı','password','','sk-…')}<div class="s-two-col"><label class="s-field" for="s-text-model"><span>Varsayılan metin modeli</span><input id="s-text-model" value="${escape(state.textModel)}" list="s-text-models" required><datalist id="s-text-models">${modelOptions(state.textModels,state.textModel)}</datalist></label><label class="s-field" for="s-image-model"><span>Görsel modeli</span><select id="s-image-model">${modelOptions(state.imageModels,state.imageModel)}</select></label></div><p class="s-help">Luna ekonomik metin ve seçim işleri için uygundur. Hesabında erişimin olan farklı bir model kimliğini de yazabilirsin. API ücretleri OpenAI hesabına yansır.</p></section><div class="s-account-platforms">${['x','youtube','tiktok'].map(platform=>`<section class="s-panel"><div class="s-platform-heading">${platformBadge(platform)}<div><h2>${names[platform]}</h2><p>${state.connections[platform].configured?'Bilgiler kayıtlı':'Developer bağlantısı'}</p></div></div>${input(`s-${platform}-id`,platform==='tiktok'?'Client key':'OAuth Client ID','text','','Boş bırakırsan kayıtlı değer korunur')}${input(`s-${platform}-secret`,'Client secret','password','','Kayıtlı değer tarayıcıya gönderilmez')}<label class="s-field"><span>Callback / yönlendirme adresi</span><input readonly value="${escape(state.connections[platform].callback)}" aria-label="${names[platform]} yönlendirme adresi"></label><p class="s-help">${platform==='x'?'X Developer Console’da OAuth 2.0 etkinleştir. Read / Write ve media.write yetkileri gerekli.':platform==='youtube'?'Google Cloud’da YouTube Data API v3 etkinleştir. Web OAuth istemcisinin izin verilen yönlendirme adresine bu URL’yi ekle.':'TikTok Developer portalında Login Kit ve Content Posting API etkinleştir. TikTok için kayıtlı HTTPS yönlendirme adresi gerekir.'}</p></section>`).join('')}</div><div class="s-settings-footer"><p>Bilgiler bu bilgisayarda saklanır. Uygulama bilgilerini değiştirirsen ilgili hesapları yeniden bağla.</p><button class="s-btn primary" type="submit">Ayarları kaydet</button></div></form>`;
  }
  function automation() {
    const rule = state.automation;
    return pageHeader('OTOMATİK AKIŞ','Klasörden seçsin. <span>Zamanında paylaşsın.</span>','AI videoyu seçer, bağlamına göre metni üretir ve seçtiğin hesaplarda yayınlar.') + `<div class="s-automation-layout"><section class="s-panel"><div class="s-section-title"><span class="s-stat-icon green">${icon('automation')}</span><div><h2>Tekrarlayan paylaşım</h2><p>X ve YouTube hesapların için.</p></div><span class="s-status ${rule.enabled?'published':'draft'}">${rule.enabled?'Aktif':'Kapalı'}</span></div>${rule.lastError?`<p class="s-error">Son çalıştırma: ${escape(rule.lastError)}</p>`:''}${rule.enabled?`<p class="s-notice">Sıradaki çalışma: ${date(rule.nextAt)}${rule.lastRun?` · Son çalışma: ${date(rule.lastRun)}`:''}</p><button class="s-btn secondary" data-action="stop-automation">Otomatik akışı durdur</button>`:''}<form id="s-automation-form"><label class="s-field" for="s-auto-context"><span>Her paylaşım için kullanılacak bağlam</span><textarea id="s-auto-context" rows="5" maxlength="20000" required>${escape(rule.context||state.context)}</textarea></label><div class="s-two-col"><label class="s-field" for="s-auto-model"><span>AI modeli</span><select id="s-auto-model">${modelOptions(state.textModels,rule.model||state.textModel)}</select></label>${input('s-auto-interval','Kaç saatte bir?','number',rule.intervalHours||24)}</div><div class="s-targets">${targets('auto',['x','youtube'],rule.targets?.map(target=>target.accountId))}</div><label class="s-field" for="s-auto-privacy"><span>YouTube görünürlüğü</span><select id="s-auto-privacy">${[['private','Gizli'],['unlisted','Liste dışı'],['public','Herkese açık']].map(([value,label])=>`<option value="${value}" ${rule.privacy===value?'selected':''}>${label}</option>`).join('')}</select></label><label class="s-check"><input id="s-auto-kids" type="checkbox" ${rule.madeForKids?'checked':''}><span>Çocuklara özel içerik</span></label><label class="s-check"><input id="s-auto-aigc" type="checkbox" ${rule.aiGenerated?'checked':''}><span>Gerçekçi, AI ile değiştirilmiş içerik</span></label><label class="s-check s-auto-consent"><input id="s-auto-consent" type="checkbox" required><span>Bu hesaplara otomatik yayın yapılmasına izin veriyorum.<small>Her çalışmada AI kullanımı ve platform API ücretleri oluşabilir.</small></span></label><button class="s-btn primary" type="submit" ${!state.openaiConfigured?'disabled':''}>${icon('automation')} Onayla ve akışı başlat</button></form></section><aside class="s-panel s-automation-aside"><span class="s-kicker">AKIŞ NASIL ÇALIŞIR?</span><ol><li><strong>Videolarını ekle</strong><p>${state.folder?escape(state.folder):'Medya kütüphanesinden video klasörünü bağla veya dosya yükle.'}</p></li><li><strong>AI uygun videoyu seçer</strong><p>Dosya adını ve verdiğin bağlamı kullanır. Daha önce planlanmış veya paylaşılmış videolar seçilmez.</p></li><li><strong>Metni hazırlar ve paylaşır</strong><p>Her hesap için ayrı metin üretilir. İlk yayın, seçtiğin aralık dolduğunda yapılır.</p></li><li><strong>Dosyayı arşivler</strong><p>İlgili bütün yayınlar tamamlanınca kaynak video paylasildi/ klasörüne taşınır.</p></li></ol><p class="s-notice">Bilgisayar ve uygulama açık olmalı. Başarısız veya belirsiz yayınlar otomatik tekrarlanmaz.</p><p class="s-help">TikTok her içerik için görünürlük ve kullanım onayı ister. TikTok paylaşımlarını içerik stüdyosundan tek tek yayınlayabilir veya onaylayıp planlayabilirsin.</p></aside></div>`;
  }
  function draw() {
    if (!state) return;
    root.innerHTML = ({compose:composer,queue,media:library,accounts,settings,automation}[view]||composer)();
    navigation(); bind();
  }
  function go(next) { view=next; dirty=false; if(next!=='legacy')draw();else navigation(); window.scrollTo({top:0,behavior:'instant'}); }
  function getTargets(prefix) { return [...root.querySelectorAll(`input[name="${prefix}-target"]:checked`)].map(node=>({ platform:node.dataset.platform, accountId:node.value||null })); }
  async function run(button, operation) {
    if (pending) return;
    const original = button?.innerHTML;
    pending=true; button?.setAttribute('aria-busy','true'); if(button){button.disabled=true;if(button.matches('.s-btn'))button.textContent='İşleniyor…';}
    try { await operation(); } catch(error) { toast(error.message,true); } finally { pending=false; if(button?.isConnected){button.disabled=false;button.removeAttribute('aria-busy');if(button.matches('.s-btn'))button.innerHTML=original;} }
  }
  function mediaDuration() {
    const duration = $('#s-video-preview')?.duration;
    return Number.isFinite(duration) ? duration : undefined;
  }
  async function savePost() {
    const post = state.posts.find(item=>item.id===selected);
    if (!post || post.status!=='draft') return;
    const options = JSON.parse(post.options);
    if($('#s-privacy'))options.privacy=$('#s-privacy').value;
    if(post.platform==='youtube')options.madeForKids=$('#s-kids').checked;
    if($('#s-aigc'))options.aiGenerated=$('#s-aigc').checked;
    if(post.platform==='tiktok')Object.assign(options,{consent:$('#s-consent').checked, duration:mediaDuration() || ($('#s-media').value===post.media_id?options.duration:undefined), ownBrand:$('#s-own-brand').checked, branded:$('#s-branded').checked, allowComment:$('#s-comment').checked, allowDuet:$('#s-duet').checked, allowStitch:$('#s-stitch').checked});
    const result=await api(`/api/social/posts/${selected}`,'POST',{revision:post.revision,text:$('#s-post-text').value,title:$('#s-title')?.value||post.title,accountId:$('#s-account').value||null,mediaId:$('#s-media').value||null,context:$('#s-context').value,model:$('#s-model').value,options});
    Object.assign(post,result.post); dirty=false;
  }
  async function upload(file) {
    if(!file)return;
    const result = await api('/api/social/library/upload','POST',file,{'Content-Type':'video/mp4','X-File-Name':encodeURIComponent(file.name)});
    const post = state.posts.find(item => item.id === selected);
    if (view === 'compose' && post?.status === 'draft') {
      await api(`/api/social/posts/${selected}`,'POST',{revision:post.revision,text:post.text,title:post.title,accountId:post.account_id,mediaId:result.media.id,options:{...JSON.parse(post.options),duration:undefined}});
    }
    toast('Video kütüphaneye eklendi.'); await load();
  }
  async function openFolderPicker() {
    const dialog = document.createElement('dialog');
    dialog.className = 'modal s-folder-picker';
    dialog.setAttribute('aria-labelledby', 's-folder-picker-title');
    dialog.innerHTML = `<div class="s-section-title"><div><h2 id="s-folder-picker-title">Video klasörü seç</h2><p>Uygulamanın çalıştığı bilgisayardaki klasörler.</p></div><button type="button" class="s-icon-btn" data-folder-close aria-label="Klasör seçimini kapat">×</button></div>
      <div class="s-folder-navigation"><button type="button" class="s-btn secondary" data-folder-home>Ana klasör</button><button type="button" class="s-btn secondary" data-folder-parent>↑ Üst klasör</button></div>
      <p class="s-folder-path" aria-label="Açık klasör"></p><div class="s-folder-list" aria-busy="true"></div><p class="s-folder-feedback" role="status" aria-live="polite"></p>
      <div class="s-folder-picker-actions"><button type="button" class="s-btn secondary" data-folder-close>Vazgeç</button><button type="button" class="s-btn primary" data-folder-confirm disabled>Bu klasörü seç</button></div>`;
    const list = dialog.querySelector('.s-folder-list');
    const feedback = dialog.querySelector('.s-folder-feedback');
    const confirm = dialog.querySelector('[data-folder-confirm]');
    const home = dialog.querySelector('[data-folder-home]');
    const up = dialog.querySelector('[data-folder-parent]');
    let current = '', parent = null, loading = false;
    async function browse(folder = '') {
      if (loading) return;
      loading = true; confirm.disabled = true; home.disabled = true; up.disabled = true;
      list.setAttribute('aria-busy', 'true'); feedback.textContent = 'Klasörler yükleniyor…';
      feedback.classList.remove('s-error');
      try {
        const result = await api('/api/social/library/folders', 'POST', { folder });
        if (!dialog.isConnected) return;
        current = result.folder; parent = result.parent;
        dialog.querySelector('.s-folder-path').textContent = current;
        list.innerHTML = result.folders.length ? result.folders.map(entry => `<button type="button" class="s-btn secondary" data-folder-path="${escape(entry.path)}">${icon('media')}<span>${escape(entry.name)}</span><span aria-hidden="true">›</span></button>`).join('') : '<p class="s-help">Bu klasörde alt klasör yok. Bu klasörü seçebilirsin.</p>';
        list.querySelectorAll('[data-folder-path]').forEach(button => button.addEventListener('click', () => browse(button.dataset.folderPath)));
        feedback.textContent = `${result.folders.length} alt klasör. Videoların bulunduğu klasörü açıp seç.`;
        confirm.disabled = false;
        list.scrollTop = 0;
      } catch (error) {
        feedback.textContent = error.message; feedback.classList.add('s-error');
      } finally {
        loading = false; home.disabled = false; up.disabled = !parent;
        list.setAttribute('aria-busy', 'false');
      }
    }
    dialog.querySelectorAll('[data-folder-close]').forEach(button => button.addEventListener('click', () => dialog.close()));
    dialog.addEventListener('close', () => dialog.remove(), { once: true });
    home.addEventListener('click', () => browse());
    up.addEventListener('click', () => { if (parent) browse(parent); });
    confirm.addEventListener('click', () => {
      if (loading || !current) return;
      $('#s-folder').value = current; dirty = true;
      dialog.close(); $('#s-folder').focus();
    });
    document.body.append(dialog); dialog.showModal();
    await browse($('#s-folder').value || state.folder || '');
  }
  function bind() {
    root.querySelectorAll('[data-view]').forEach(button=>button.addEventListener('click',()=>run(button,async()=>{if(view==='compose')await savePost();go(button.dataset.view);})));
    root.querySelectorAll('[data-select]').forEach(button=>button.addEventListener('click',()=>run(button,async()=>{ if(view==='compose')await savePost();else workingContext=null;selected=button.dataset.select;go('compose');})));
    root.querySelectorAll('[data-action]').forEach(button=>button.addEventListener('click',()=>run(button,async()=>{
      const action=button.dataset.action;
      if(action==='project')return openProject();
      if(action==='refresh')return load();
      if(action==='choose-folder')return openFolderPicker();
      if(action==='upload') {
        if(view==='compose')await savePost();
        const file=document.createElement('input');file.type='file';file.accept='video/mp4,.mp4';
        file.addEventListener('change',()=>run(null,()=>upload(file.files[0])));file.click();return;
      }
      if(action==='creator') {
        await savePost();const post=state.posts.find(item=>item.id===selected);
        if(!post.account_id)throw new Error('Önce TikTok hesabını seç.');
        const {creator}=await api(`/api/social/accounts/${post.account_id}/creator`);creators.set(post.account_id,creator);draw();return;
      }
      if(action==='stop-automation'){await api('/api/social/automation','POST',{enabled:false});toast('Otomatik akış durduruldu.');await load();}
    })));
    root.querySelectorAll('[data-disconnect]').forEach(button=>button.addEventListener('click',()=>run(button,async()=>{await api(`/api/social/accounts/${button.dataset.disconnect}`,'DELETE');creators.clear();await load();toast('Hesap bağlantısı kaldırıldı.');})));
    root.querySelectorAll('[data-archive]').forEach(button=>button.addEventListener('click',()=>run(button,async()=>{await api(`/api/social/library/${button.dataset.archive}/archive`,'POST');await load();toast('Arşiv durumu güncellendi.');})));
    $('#s-context')?.addEventListener('input',()=>{workingContext=$('#s-context').value;$('#s-context-count').textContent=`${workingContext.length.toLocaleString('tr-TR')} / 20.000`;dirty=true;});
    $('#s-campaign')?.addEventListener('submit',event=>{event.preventDefault();run(event.submitter,async()=>{
      await savePost();
      let context=$('#s-context').value; const project=catalog.find(item=>item.id===$('#s-project')?.value);
      if(project)context+=`\n\nProje: ${project.name}\nURL: ${project.url}\nDoğrulanmış özellikler: ${project.features.join('; ')}\nSınırlar: ${project.guardrail||''}`;
      const useAI=$('#s-ai-create').checked;
      const result=await api('/api/social/posts','POST',{context,model:$('#s-model').value,targets:getTargets('campaign')});
      workingContext = null;
      selected=result.posts[0].id;
      if(useAI)for(const post of result.posts){try{await api(`/api/social/posts/${post.id}/generate`,'POST');}catch(error){toast(`${names[post.platform]}: ${error.message}`,true);}}
      await load();toast(useAI?'Taslaklar hazır. Metni, medyayı ve hesabı kontrol et.':'Taslakların oluşturuldu. Metnini yazabilirsin.');
    });});
    $('#s-post-form')?.addEventListener('input',()=>{dirty=true;});
    $('#s-post-form')?.addEventListener('submit',event=>{event.preventDefault();run(event.submitter,async()=>{await savePost();toast('Taslak kaydedildi.');});});
    $('#s-post-text')?.addEventListener('input',()=>{
      const platform=state.posts.find(item=>item.id===selected).platform;
      const text=$('#s-post-text').value;
      const count=platform==='x'?[...text.replace(/https?:\/\/[^\s]+/g,'x'.repeat(23))].reduce((sum,ch)=>sum+(ch.codePointAt(0)>0x10ff?2:1),0):text.length;
      $('#s-text-count').textContent=`${count} / ${{x:280,youtube:5000,tiktok:2200}[platform]}`;
      $('#s-text-count').classList.toggle('s-over-limit',count>({x:280,youtube:5000,tiktok:2200}[platform]));
    });
    $('#s-media')?.addEventListener('change',()=>{ $('#s-media-preview').innerHTML=preview($('#s-media').value); });
    root.querySelectorAll('[data-post-action]').forEach(button=>button.addEventListener('click',()=>run(button,async()=>{
      const action=button.dataset.postAction;
      const scheduledAt=$('#s-schedule-at')?.value;
      if(!['cancel','resolve'].includes(action))await savePost();
      let body={};
      if(action==='schedule') { if(!scheduledAt)throw new Error('Bir yayın zamanı seç.');body.at=new Date(`${scheduledAt}:00+03:00`).toISOString(); }
      if(action==='image')body.model=state.imageModel;
      if(action==='resolve')body.published=true;
      let result;
      try { result=await api(`/api/social/posts/${selected}/${action}`,'POST',body); }
      catch (error) { await load(); throw error; }
      await load();
      toast(result.reason || ({publish:'Paylaşım tamamlandı.',schedule:'Paylaşım planlandı.',image:result.attached?'Görsel eklendi.':'Görsel kütüphaneye eklendi. Video seçimin korundu.',generate:'Paylaşım metni hazır.',cancel:'Gönderi yeniden taslakta.',resolve:'Yayın durumu güncellendi.'}[action]||'Güncellendi.'));
    })));
    $('#s-folder')?.addEventListener('input',()=>{dirty=true;});
    $('#s-folder-form')?.addEventListener('submit',event=>{event.preventDefault();run(event.submitter,async()=>{const result=await api('/api/social/library/scan','POST',{folder:$('#s-folder').value});dirty=false;await load();toast(`${result.imported} video eklendi.${result.skipped.length?` ${result.skipped.length} dosya atlandı: ${result.skipped[0].error}`:''}`,Boolean(result.skipped.length));});});
    $('#s-settings-form')?.addEventListener('submit',event=>{event.preventDefault();run(event.submitter,async()=>{
      const body={OPENAI_API_KEY:$('#s-api-key').value.trim(),OPENAI_TEXT_MODEL:$('#s-text-model').value.trim(),OPENAI_IMAGE_MODEL:$('#s-image-model').value};
      for(const platform of ['x','youtube','tiktok']){const prefix=platform.toUpperCase();body[`${prefix}_CLIENT_ID`]=$(`#s-${platform}-id`).value.trim();body[`${prefix}_CLIENT_SECRET`]=$(`#s-${platform}-secret`).value.trim();}
      await api('/api/social/settings','POST',body);await load();toast('API ve model ayarları kaydedildi.');
    });});
    $('#s-automation-form')?.addEventListener('submit',event=>{event.preventDefault();run(event.submitter,async()=>{
      await api('/api/social/automation','POST',{enabled:true,context:$('#s-auto-context').value,model:$('#s-auto-model').value,targets:getTargets('auto'),intervalHours:Number($('#s-auto-interval').value),privacy:$('#s-auto-privacy').value,madeForKids:$('#s-auto-kids').checked,aiGenerated:$('#s-auto-aigc').checked});
      await load();toast('Otomatik akış etkin. İlk yayın seçtiğin aralık sonunda yapılacak.');
    });});
  }
  document.querySelectorAll('[data-studio-view]').forEach(button=>button.addEventListener('click',()=>run(button,async()=>{if(view==='compose')await savePost();await load(false);go(button.dataset.studioView);})));
  setInterval(() => {
    if (state && !pending && !dirty && !document.hidden && !document.querySelector('#workspace').classList.contains('hidden') && ['queue','accounts','media'].includes(view)) load().catch(() => {});
  }, 30000);
  return { async update(next) { catalog=next.catalog;try{await load(!dirty);}catch(error){toast(error.message,true);} }, icon };
}
