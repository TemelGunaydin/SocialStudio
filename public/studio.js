const escape = value => String(value ?? '').replace(/[&<>"']/g, ch => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[ch]));
const names = { x: 'Twitter / X', youtube: 'YouTube', tiktok: 'TikTok', instagram: 'Instagram' };
const networks = Object.keys(names);
const limits = { x:280, youtube:5000, tiktok:2200, instagram:2200 };
const marks = { x: '𝕏', youtube: '▶', tiktok: '♪', instagram: '◎' };
const mediaFits = (platform, media, kind = 'post') => platform === 'youtube' ? media.kind === 'video'
  : platform === 'instagram' ? kind === 'reel' ? media.kind === 'video' : media.kind === 'image' && /\.jpg$/.test(media.stored_name)
  : platform === 'tiktok' ? media.kind === 'video' || /\.(jpg|webp)$/.test(media.stored_name) : true;
const guides = {
  x: { url:'https://developer.x.com/en/portal/dashboard', label:'X Developer Console', scope:'tweet.read, tweet.write, users.read, media.write, offline.access',
    steps:['Projenin User authentication settings bölümünde OAuth 2.0 ve Read / Write erişimini aç. Uygulama türünü Web App olarak seç.', 'Aşağıdaki yönlendirme adresini Callback URI alanına ekle. OAuth 2.0 Client ID ve Client Secret değerlerini al.', 'Bilgileri kaydet, hesabına giriş yap ve paylaşım izinlerini onayla. Başka bir hesap için bağlantıyı yeniden başlat.'],
    note:'API planında medya yükleme ve gönderi yazma erişimi bulunmalı.' },
  youtube: { url:'https://console.cloud.google.com/apis/library/youtube.googleapis.com', label:'Google Cloud kurulumu', scope:'youtube.upload, youtube.readonly',
    steps:['Google Cloud projesinde YouTube Data API v3 hizmetini etkinleştir. Google Auth Platform bölümünde uygulama adını ve OAuth izin ekranını hazırla. Test modunda kullanacağın Google hesaplarını Test users listesine ekle.', 'OAuth istemcisini Web application olarak oluştur. Aşağıdaki adresi Authorized redirect URIs listesine ekle ve Client ID / Client Secret değerlerini kopyala.', 'Kaydet ve Google hesabını seç. Paylaşım yapacağın YouTube kanalına izin ver. İkinci hesap veya kanal için Hesap ekle adımını tekrar et.'],
    note:'Google test modundaki izinler süreli olabilir. Denetlenmemiş YouTube API projelerinde yüklemeler gizliyle sınırlanabilir. Her kanalın izni ayrı saklanır.' },
  tiktok: { url:'https://developers.tiktok.com/apps/', label:'TikTok Developer Portal', scope:'user.info.basic, video.publish',
    steps:['Uygulamana Login Kit ve Content Posting API / Direct Post ürünlerini ekle.', 'Aşağıdaki HTTPS yönlendirme adresini kaydet. Fotoğraf paylaşımı için aynı alan adını veya /api/social/delivery/ URL önekini URL properties bölümünde doğrula.', 'Client key ve Client secret değerlerini kaydet. TikTok hesabına giriş yap, izin ver ve her paylaşımın görünürlüğünü panelden seç.'],
    note:'Public yayın için TikTok incelemesi gerekir. Özel kullanım araçları onaylanmayabilir; onaysız istemciler gizli yayınla sınırlıdır. Her içerik için kullanım onayı gerekir.' },
  instagram: { url:'https://developers.facebook.com/apps/', label:'Meta uygulama kurulumu', scope:'instagram_business_basic, instagram_business_content_publish',
    steps:['Meta Developer uygulamana Instagram API with Instagram Login ürününü ekle. Instagram hesabını Business veya Creator profesyonel hesaba geçir. Testte hesabına uygulama rolü / Instagram tester erişimi ver.', 'Instagram API setup bölümünde Business login ayarlarına aşağıdaki HTTPS yönlendirme adresini ekle. Instagram App ID ve Instagram App Secret değerlerini kopyala.', 'Bilgileri kaydet, Instagram hesabına giriş yap ve içerik paylaşma iznini onayla. Başka hesap eklemek için aynı işlemi tekrarla.'],
    note:'JPEG gönderileri ve MP4 Reels desteklenir. Medyayı Meta okuyacağı için panelin herkese açık HTTPS adresinden erişilebilir olmalı. Uygulama rolü dışındaki hesaplar için Meta App Review / Advanced Access gerekebilir.' }
};
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
    return `<div class="s-stats"><div><span class="s-stat-icon violet">${icon('compose')}</span><div><strong>${state.posts.filter(p=>p.status==='draft').length}</strong><span>Hazırlandığın içerik</span></div></div><div><span class="s-stat-icon blue">${icon('accounts')}</span><div><strong>${state.accounts.length}</strong><span>Bağlı sosyal hesap</span></div></div><div><span class="s-stat-icon coral">${icon('media')}</span><div><strong>${state.media.filter(m=>m.status==='available').length}</strong><span>Kütüphanedeki medya</span></div></div><div><span class="s-stat-icon green">${icon('queue')}</span><div><strong>${state.posts.filter(p=>p.status==='published').length}</strong><span>Tamamlanan paylaşım</span></div></div></div>`;
  }
  function targets(prefix, platforms = networks, selectedIds) {
    return platforms.map(platform => {
      const accounts = state.accounts.filter(account => account.platform === platform);
      return `<div class="s-target ${platform}"><div class="s-target-head">${platformBadge(platform)}<strong>${names[platform]}</strong><span>${accounts.length} hesap</span></div>${accounts.length ? accounts.map(account => `<label class="s-check"><input type="checkbox" name="${prefix}-target" value="${account.id}" data-platform="${platform}" ${!selectedIds || selectedIds.includes(account.id) ? 'checked' : ''}><span>${escape(account.name)}<small>${escape(account.username)}</small></span></label>`).join('') : prefix === 'campaign' ? `<label class="s-check"><input type="checkbox" name="${prefix}-target" value="" data-platform="${platform}" checked><span>Taslak hazırla<small>Hesabı daha sonra bağla</small></span></label>` : '<p class="s-muted">Henüz hesap bağlı değil.</p>'}</div>`;
    }).join('');
  }
  function composer() {
    const posts = state.posts.filter(post => post.batch_id === (state.posts.find(post=>post.id===selected)?.batch_id));
    const current = state.posts.find(post => post.id === selected);
    const context = workingContext ?? current?.context ?? state.context;
    return pageHeader('FİKRİNDEN PAYLAŞIMINA', 'Bir fikir. <span>Tüm hesapların.</span>', 'Bağlamı sen ver. İçeriğini hazırla, medyanı seç, API üzerinden paylaş.', `<span class="s-local"><i></i> Kendi çalışma alanın</span>`) + stats() + `
    <div class="s-compose-grid"><section class="s-panel s-brief"><div class="s-section-title"><span class="s-step">01</span><div><h2>İçeriğin başlangıç noktası</h2><p>Ne anlatmak istiyorsun?</p></div></div>
      <form id="s-campaign"><label class="s-field" for="s-context"><span>Bağlam ve paylaşım notların</span><textarea id="s-context" rows="7" maxlength="20000" placeholder="Örneğin: Yeni uygulamamı tanıtıyorum. Videoda sesli notların metne dönüştürülmesi var. Hedef kitlem içerik üreticileri. İngilizce, samimi bir paylaşım hazırla; abartılı vaatlerden kaçın." required>${escape(context)}</textarea></label>
      <div class="s-context-foot"><span>Notlarını Türkçe yazabilirsin; AI paylaşımı İngilizce hazırlar.</span><span id="s-context-count">${context.length.toLocaleString('tr-TR')} / 20.000</span></div>
      ${catalog.length ? `<label class="s-field" for="s-project"><span>Proje bağlamı ekle <small>İsteğe bağlı</small></span><select id="s-project"><option value="">Sadece yazdığım bağlam</option>${catalog.map(project=>`<option value="${project.id}">${escape(project.name)}</option>`).join('')}</select></label>` : '<button type="button" class="s-link" data-action="project">+ Tanıtacağın projeyi ekle</button>'}
      <div class="s-ai-choice"><span class="s-ai-icon">${icon('spark')}</span><label class="s-field" for="s-model"><span>Metin ve medya seçimi modeli</span><select id="s-model">${modelOptions(state.textModels,current?.model||state.textModel)}</select></label><span class="s-cost-tag">Senin API anahtarın</span></div>
      <div class="s-field"><span>Paylaşım hedeflerin <small>Birden fazla hesap seçebilirsin</small></span></div><div class="s-targets">${targets('campaign')}</div>
      <div class="s-create-footer"><label class="s-check"><input id="s-ai-create" type="checkbox" ${state.openaiConfigured ? 'checked' : 'disabled'}><span>Metinleri AI ile hazırla<small>${state.openaiConfigured ? 'Seçtiğin model kullanılır; API kullanımı ücretlidir.' : 'AI üretimi için ayarlardan OpenAI anahtarını ekle.'}</small></span></label><button class="s-btn primary" type="submit">${icon('plus')} Taslakları oluştur</button></div></form>
    </section><section class="s-panel s-editor-panel"><div class="s-section-title"><span class="s-step">02</span><div><h2>Platforma göre son dokunuş</h2><p>Her hesap için ayrı metin ve medya.</p></div></div>
      ${posts.length ? `<div class="s-tabs" role="tablist" aria-label="Paylaşım platformu">${posts.map(post=>`<button role="tab" aria-selected="${post.id===selected}" data-select="${post.id}" class="s-tab ${post.platform} ${post.id===selected?'selected':''}">${platformBadge(post.platform)}<span>${names[post.platform]}${post.account_name ? `<small>${escape(post.account_name)}</small>`:''}</span></button>`).join('')}</div><div id="s-editor">${editor(state.posts.find(post=>post.id===selected))}</div>` : `<div class="s-empty-editor"><div class="s-empty-platforms">${networks.map(platformBadge).join('')}</div><h3>İlk paylaşımın burada şekillenecek.</h3><p>Bağlamını yaz, hedeflerini seç ve taslaklarını oluştur. Her platform için ayrı bir düzenleme alanın olacak.</p><div class="s-flow"><span>Bağlam</span><b>→</b><span>AI + medya</span><b>→</b><span>Paylaşım</span></div></div>`}
    </section></div><div class="s-bottom-note">${icon('media')} Medya klasörünü bağlayarak AI ile seçim yapabilirsin. Tamamlanan dosyalar <code>paylasildi/</code> klasörüne taşınır.<button class="s-link" data-view="media">Kütüphaneyi aç ↗</button></div>`;
  }
  function editor(post) {
    if (!post) return '';
    const readOnly = post.status !== 'draft';
    const options = JSON.parse(post.options);
    const creator = creators.get(post.account_id);
    const assets = state.media.filter(media => media.status !== 'published' || media.id === post.media_id);
    const photo = post.platform==='tiktok'&&state.media.find(media=>media.id===post.media_id)?.kind==='image';
    return `<form id="s-post-form" data-id="${post.id}"><div class="s-editor-top"><span class="s-status ${post.status}"><i></i>${labels[post.status]}</span><span class="s-muted">${escape(post.account_name || 'Hesap henüz seçilmedi')}</span></div>
      ${post.error ? `<p class="s-error" role="alert">${escape(post.error)}</p>` : ''}
      <fieldset ${readOnly?'disabled':''}><label class="s-field" for="s-account"><span>Yayınlanacak hesap</span><select id="s-account"><option value="">Hesap seç</option>${state.accounts.filter(account=>account.platform===post.platform).map(account=>`<option value="${account.id}" ${account.id===post.account_id?'selected':''}>${escape(account.name)} · ${escape(account.username)}</option>`).join('')}</select></label>
      ${post.platform==='youtube'||post.platform==='tiktok'&&state.media.find(asset=>asset.id===post.media_id)?.kind==='image'?`<label class="s-field" for="s-title"><span>İçerik başlığı</span><input id="s-title" value="${escape(post.title)}" maxlength="${photo?90:100}" placeholder="${photo?'Fotoğraf başlığı':'Videonun başlığı'}"></label>`:''}
      <label class="s-field" for="s-post-text"><span>${post.platform==='youtube'?'Video açıklaması':'Paylaşım metni'}<small id="s-text-count">${post.text.length} / ${limits[post.platform]}</small></span><textarea id="s-post-text" rows="${post.platform==='tiktok'?12:5}" maxlength="${post.platform==='x'?560:post.platform==='youtube'?5000:2200}" placeholder="Metnini yaz veya AI ile üret…">${escape(post.text)}</textarea></label>
      <p class="s-help s-caption-hint">${post.platform==='tiktok'?'AI metni İngilizce hazırlar; emojili özellik satırlarını, çağrıyı, bağlantıyı ve hashtag’leri boş satırlarla ayırır.':post.platform==='x'?'AI, X paylaşımını İngilizce, kısa ve hashtagsiz hazırlar.':post.platform==='instagram'?'AI, Instagram metnini İngilizce ve kısa paragraflarla hazırlar.':'AI video başlığını ve açıklamasını İngilizce hazırlar.'}</p>
      <div class="s-inline-actions"><button type="button" class="s-btn ai" data-post-action="generate" ${!state.openaiConfigured?'disabled':''}>${icon('spark')} Metni yeniden üret</button><span class="s-muted">${escape(post.model)}</span></div>
      ${post.platform==='instagram'?`<div class="s-options"><label class="s-field" for="s-ig-kind"><span>Instagram paylaşım türü</span><select id="s-ig-kind"><option value="post" ${options.kind!=='reel'?'selected':''}>Gönderi · JPEG görsel</option><option value="reel" ${options.kind==='reel'?'selected':''}>Reels · MP4 video</option></select></label><label class="s-check"><input id="s-share-feed" type="checkbox" ${options.shareToFeed!==false?'checked':''}><span>Reels profil akışında da görünsün</span></label></div>`:''}
      <div class="s-media-box"><div class="s-field"><span>${icon('media')} Video ve görsel</span><select id="s-media" aria-label="Paylaşım medyası"><option value="">Medya seçilmedi</option>${assets.filter(asset=>mediaFits(post.platform,asset,options.kind)).map(asset=>`<option value="${asset.id}" ${post.media_id===asset.id?'selected':''}>${asset.kind==='video'?'Video':'Görsel'} · ${escape(asset.name)}</option>`).join('')}</select></div>
      <div id="s-media-preview">${preview(post.media_id)}</div><div class="s-media-actions"><button type="button" class="s-btn secondary" data-action="upload">${icon('plus')} Dosya yükle</button><button type="button" class="s-btn secondary" data-action="pick-media">Klasörden / kütüphaneden seç</button><button type="button" class="s-btn ai" data-post-action="select-media" ${!state.openaiConfigured?'disabled':''}>${icon('spark')} AI medya seçsin</button><button type="button" class="s-btn secondary" data-post-action="image" ${!state.openaiConfigured?'disabled':''}>Görsel üret</button></div><p class="s-help">AI, dosya adı ve bağlamla seçim yapar. ${post.platform==='youtube'?'Yayın için MP4 seç. Görselleri video kapağı olarak kullanabilirsin.':post.platform==='instagram'?'Gönderi için JPEG, Reels için MP4 kullan.':'Tek paylaşımda bir video veya uyumlu görsel kullanılır.'}</p></div>
      ${post.platform==='youtube'?`<div class="s-options"><label class="s-field" for="s-thumbnail"><span>Video kapağı <small>İsteğe bağlı · JPEG / PNG</small></span><select id="s-thumbnail"><option value="">YouTube otomatik seçsin</option>${assets.filter(asset=>asset.kind==='image'&&/\.(jpg|png)$/.test(asset.stored_name)).map(asset=>`<option value="${asset.id}" ${options.thumbnailId===asset.id?'selected':''}>${escape(asset.name)}</option>`).join('')}</select></label><button type="button" class="s-btn secondary" data-action="pick-thumbnail">Klasörden kapak seç</button><p class="s-help">YouTube API, görselleri video kapağı olarak destekler. Kanalın özel kapak yükleme izni olmalı.</p><label class="s-field" for="s-privacy"><span>Görünürlük</span><select id="s-privacy">${[['private','Gizli'],['unlisted','Liste dışı'],['public','Herkese açık']].map(([value,label])=>`<option value="${value}" ${options.privacy===value?'selected':''}>${label}</option>`).join('')}</select></label><label class="s-check"><input id="s-kids" type="checkbox" ${options.madeForKids?'checked':''}><span>Çocuklara özel içerik</span></label><label class="s-check"><input id="s-aigc" type="checkbox" ${options.aiGenerated?'checked':''}><span>Gerçekçi, AI ile değiştirilmiş içerik</span></label></div>`:''}
      ${post.platform==='tiktok'?`<div class="s-options">${state.media.find(asset=>asset.id===post.media_id)?.kind==='image'?`<label class="s-check"><input id="s-auto-music" type="checkbox" ${options.autoMusic?'checked':''}><span>TikTok önerilen müziği eklesin</span></label>`:''}<div class="s-field"><span>TikTok hesap seçenekleri</span><button type="button" class="s-btn secondary" data-action="creator">Hesap bilgilerini yenile</button></div>${creator?`<p class="s-help">${escape(creator.creator_nickname)}${photo?' · Fotoğraf paylaşımı':` · En fazla ${creator.max_video_post_duration_sec} saniye`}</p>`:'<p class="s-help">Görünürlük için güncel hesap bilgilerini yükle.</p>'}<label class="s-field" for="s-privacy"><span>Görünürlük</span><select id="s-privacy"><option value="">Görünürlük seç</option>${(creator?.privacy_level_options || (options.privacy?[options.privacy]:[])).map(value=>`<option value="${value}" ${options.privacy===value?'selected':''}>${({SELF_ONLY:'Yalnızca ben',PUBLIC_TO_EVERYONE:'Herkese açık',MUTUAL_FOLLOW_FRIENDS:'Arkadaşlar',FOLLOWER_OF_CREATOR:'Takipçiler'})[value]||value}</option>`).join('')}</select></label>${[['comment','Yorumlara izin ver'],['duet','Düete izin ver'],['stitch','Birleştirmeye izin ver']].filter(([key])=>!photo||key==='comment').map(([key,label])=>`<label class="s-check"><input id="s-${key}" type="checkbox" ${creator?.[key+'_disabled']?'disabled':options['allow'+key[0].toUpperCase()+key.slice(1)]?'checked':''}><span>${label}</span></label>`).join('')}<label class="s-check"><input id="s-own-brand" type="checkbox" ${options.ownBrand?'checked':''}><span>Kendi markamı tanıtıyorum<small>Tanıtım içeriği olarak etiketlenir.</small></span></label><label class="s-check"><input id="s-branded" type="checkbox" ${options.branded?'checked':''}><span>Ücretli iş birliği<small>Ücretli ortaklık etiketi eklenir. Gizli paylaşılamaz.</small></span></label><label class="s-check"><input id="s-aigc" type="checkbox" ${options.aiGenerated?'checked':''}><span>AI ile üretilen içerik</span></label><label class="s-check"><input id="s-consent" type="checkbox" ${options.consent?'checked':''}><span>Paylaşarak TikTok <a href="https://www.tiktok.com/legal/page/global/music-usage-confirmation/en" target="_blank" rel="noopener noreferrer">Müzik Kullanım Koşulları</a>'nı kabul ediyorum.</span></label></div>`:''}
      <div class="s-publish-actions"><button class="s-btn secondary" type="submit">Taslağı kaydet</button><button class="s-btn primary" type="button" data-post-action="publish">${icon('arrow')} Şimdi paylaş</button></div><details class="s-schedule"><summary>İleri bir zamana planla</summary><label class="s-field" for="s-schedule-at"><span>İstanbul saati</span><input id="s-schedule-at" type="datetime-local"></label><button class="s-btn secondary" type="button" data-post-action="schedule">Onayla ve planla</button><p class="s-help">Yayın saatinde bu bilgisayar ve uygulama açık olmalı.</p></details></fieldset>
      ${post.status==='scheduled'?`<p class="s-notice">Yayın zamanı: ${date(post.scheduled_at)}</p>`:''}${['scheduled','failed'].includes(post.status)?'<button type="button" class="s-btn secondary" data-post-action="cancel">Taslağa geri al</button>':''}${post.status==='uncertain'?'<p class="s-help">Otomatik tekrar denenmez. Hesabında yayını doğruladıktan sonra tamamlandı olarak işaretleyebilirsin.</p><button type="button" class="s-btn secondary" data-post-action="resolve">Hesabı kontrol ettim: yayınlandı</button>':''}
      ${post.remote_url?`<a class="s-btn secondary" href="${escape(post.remote_url)}" target="_blank" rel="noopener noreferrer">Paylaşımı görüntüle ↗</a>`:''}</form>`;
  }
  function preview(id) {
    const asset = state.media.find(item=>item.id===id);
    if (!asset) return '';
    return asset.kind==='video' ? `<video id="s-video-preview" controls playsinline preload="metadata" src="/api/videos/${asset.stored_name}" aria-label="Seçilen video önizlemesi"></video>` : `<img src="/api/images/${asset.stored_name}" alt="Seçilen paylaşım görseli">`;
  }
  function queue() {
    const filtered = state.posts.filter(post => !$('#s-queue-filter')?.value || post.status === $('#s-queue-filter').value);
    return pageHeader('PAYLAŞIM KUYRUĞU','Her içeriğin <span>durumu belli.</span>','Hazırladığın, planladığın ve yayınladığın içeriklerin tek yerde.') + `<section class="s-panel"><div class="s-section-title"><h2>Paylaşımlar</h2><span class="s-counter">${state.posts.length} içerik</span><button class="s-btn secondary" data-action="refresh">Yenile</button></div>${filtered.length?`<div class="s-table-wrap"><table class="s-table"><thead><tr><th>Platform / hesap</th><th>İçerik</th><th>Durum</th><th>Zaman</th><th></th></tr></thead><tbody>${filtered.map(post=>`<tr><td><div class="s-table-account">${platformBadge(post.platform)}<div><strong>${names[post.platform]}</strong><small>${escape(post.account_name||'Hesap seçilmedi')}</small></div></div></td><td><strong>${escape(post.title||post.text.slice(0,65)||'Boş taslak')}</strong><small>${escape(post.media_name||'Medya seçilmedi')}</small>${post.error?`<span class="s-row-error">${escape(post.error)}</span>`:''}</td><td><span class="s-status ${post.status}"><i></i>${labels[post.status]}</span></td><td>${date(post.scheduled_at||post.updated_at)}</td><td><button class="s-btn secondary" data-select="${post.id}">Aç ↗</button></td></tr>`).join('')}</tbody></table></div>`:empty('Henüz paylaşım yok.','İçerik stüdyosunda ilk taslağını hazırla.','compose')}</section>`;
  }
  function empty(title, description, target) { return `<div class="s-empty"><span>${icon('spark')}</span><h3>${title}</h3><p>${description}</p>${target?`<button class="s-btn secondary" data-view="${target}">İçerik stüdyosunu aç ↗</button>`:''}</div>`; }
  function library() {
    return pageHeader('MEDYA KÜTÜPHANESİ','Medyan hazır. <span>Sıra seçimde.</span>','Görsellerini ve videolarını bir kez ekle; her hesap için uygun olanı seç.',`<button class="s-btn primary" data-action="upload">${icon('plus')} Dosya yükle</button>`) + `
      <section class="s-panel s-folder-panel"><div class="s-section-title"><span class="s-stat-icon coral">${icon('media')}</span><div><h2>Medya klasörünü bağla</h2><p>Bu uygulamanın çalıştığı bilgisayardaki klasör.</p></div></div><form id="s-folder-form"><label class="s-field" for="s-folder"><span>Klasörün tam yolu</span><input id="s-folder" value="${escape(state.folder)}" placeholder="/Users/adın/Movies/SosyalMedya" required></label><button id="s-folder-choose" class="s-btn secondary" type="button" data-action="choose-folder">${icon('media')} Klasör seç</button><button class="s-btn primary" type="submit">Klasörü tara</button></form><div class="s-folder-flow"><span><i class="s-dot blue"></i> JPEG · PNG · WebP · MP4</span><b>→</b><span><i class="s-dot violet"></i> AI veya manuel seçim</span><b>→</b><span><i class="s-dot green"></i> paylasildi/</span></div><p class="s-help">Video en fazla 100 MB, görsel 5 MB. Alt klasörler taranmaz. Kaynak dosya, bağlı bütün paylaşımlar başarıyla tamamlandığında taşınır. Önizleme için yerel bir kopya korunur.</p></section>
      <div class="s-section-title"><h2>Tüm medya</h2><span class="s-counter">${state.media.length} dosya</span></div>${state.media.length?`<div class="s-library-grid">${state.media.map(asset=>`<article class="s-media-card"><div class="s-asset-preview">${asset.kind==='video'?`<video controls preload="metadata" playsinline src="/api/videos/${asset.stored_name}" aria-label="${escape(asset.name)}"></video>`:`<img src="/api/images/${asset.stored_name}" alt="${escape(asset.name)}">`}<span class="s-asset-kind">${asset.kind==='video'?'MP4':asset.ai_generated?'AI GÖRSEL':'GÖRSEL'}</span></div><div class="s-asset-info"><h3>${escape(asset.name)}</h3><div><span>${(asset.size/1_000_000).toFixed(1)} MB</span><span class="s-status ${asset.status==='published'?'published':'draft'}">${asset.status==='published'?'Paylaşıldı':'Kullanılabilir'}</span></div>${asset.error?`<p class="s-error">${escape(asset.error)}</p><button class="s-btn secondary" data-archive="${asset.id}">Arşivlemeyi tekrar dene</button>`:''}</div></article>`).join('')}</div>`:empty('Kütüphanen yeni içeriklerini bekliyor.','Görsel / video yükle veya medya klasörünü seç.')}`;
  }
  const connectPath = platform => platform==='x'?'/api/x/connect':`/api/social/oauth/${platform}/connect`;
  function callbackField(platform) {
    return `<label class="s-field"><span>Yönlendirme adresi</span><input readonly value="${escape(state.connections[platform].callback)}" aria-label="${names[platform]} yönlendirme adresi"></label><button type="button" class="s-link" data-copy-callback="${platform}">Adresi kopyala</button>`;
  }
  function accounts() {
    return pageHeader('SOSYAL HESAPLAR','Birden fazla hesap. <span>Tek çalışma alanı.</span>','Hesabını seç, platformun izin ekranında onayla ve panelden paylaş.') + `<div class="s-account-platforms">${networks.map(platform=>{
      const accounts=state.accounts.filter(account=>account.platform===platform);
      return `<section class="s-panel s-account-panel ${platform}"><div class="s-platform-heading">${platformBadge(platform)}<div><h2>${names[platform]}</h2><p>${accounts.length} bağlı hesap · API ile paylaşım</p></div></div><div class="s-account-list">${accounts.map(account=>`<div class="s-account-row"><span class="s-avatar ${platform}">${escape(account.name.slice(0,2).toUpperCase())}</span><div><strong>${escape(account.name)}</strong><small>${escape(account.username)}</small></div><button class="s-icon-btn" data-disconnect="${account.id}" aria-label="${escape(account.name)} bağlantısını kes">×</button></div>`).join('')||'<p class="s-muted">İlk hesabını bağlayarak başla.</p>'}</div>${state.connections[platform].configured?`<a class="s-btn primary full" href="${connectPath(platform)}">${icon('plus')} ${accounts.length?'Başka hesap ekle':'Hesap bağla'}</a>`:`<button class="s-btn primary full" data-guide="${platform}">Bağlantıyı hazırla</button>`}<button class="s-link s-guide-link" data-guide="${platform}">3 adımda kurulum rehberi ↗</button><p class="s-help">${platform==='youtube'?'Her kanal için Google hesabını seçip izin ver. İkinci kanalın ilk hesabın yerine geçmez.':platform==='instagram'?'Profesyonel hesabınla görsel gönderileri ve Reels paylaş.':platform==='tiktok'?'Video ve fotoğraf paylaş. Her içerikte görünürlük ve kullanım onayı gerekir.':'Görsel, video veya metin paylaş. Her hesabın erişim izni ayrı saklanır.'}</p></section>`;
    }).join('')}</div><div class="s-bottom-note">${icon('accounts')} Aynı hesabı tekrar bağlamak izinlerini yeniler. Diğer hesaplarının bağlantısı korunur.</div>`;
  }
  function settings() {
    return pageHeader('BAĞLANTILAR VE MODELLER','Üretimin kontrolü <span>sende.</span>','Kendi API anahtarlarını kullan. Metin ve görsel modellerini ayrı seç.') + `<form id="s-settings-form"><section class="s-panel"><div class="s-section-title"><span class="s-stat-icon violet">${icon('spark')}</span><div><h2>OpenAI</h2><p>${state.openaiConfigured?'Anahtar kayıtlı. Boş bırakırsan korunur.':'Metin, görsel ve video seçimi için API anahtarını ekle.'}</p></div><a class="s-link" href="https://platform.openai.com/api-keys" target="_blank" rel="noopener noreferrer">API anahtarı al ↗</a></div>${input('s-api-key','OpenAI API anahtarı','password','','sk-…')}<div class="s-two-col"><label class="s-field" for="s-text-model"><span>Varsayılan metin modeli</span><input id="s-text-model" value="${escape(state.textModel)}" list="s-text-models" required><datalist id="s-text-models">${modelOptions(state.textModels,state.textModel)}</datalist></label><label class="s-field" for="s-image-model"><span>Görsel modeli</span><select id="s-image-model">${modelOptions(state.imageModels,state.imageModel)}</select></label></div><p class="s-help">Luna ekonomik metin ve seçim işleri için uygundur. Hesabında erişimin olan farklı bir model kimliğini de yazabilirsin. API ücretleri OpenAI hesabına yansır.</p></section><div class="s-account-platforms">${networks.map(platform=>`<section class="s-panel"><div class="s-platform-heading">${platformBadge(platform)}<div><h2>${names[platform]}</h2><p>${state.connections[platform].configured?'Bilgiler kayıtlı':'Developer bağlantısı'}</p></div></div>${input(`s-${platform}-id`,platform==='tiktok'?'Client key':platform==='instagram'?'Instagram App ID':'OAuth Client ID','text','','Boş bırakırsan kayıtlı değer korunur')}${input(`s-${platform}-secret`,'Client secret','password','','Kayıtlı değer tarayıcıya gönderilmez')}${callbackField(platform)}<button type="button" class="s-link s-guide-link" data-guide="${platform}">3 adımda kurulum rehberi ↗</button><p class="s-help">${platform==='youtube'?'Google Cloud web OAuth istemcisi. Her kanal ayrı bağlanır.':platform==='instagram'?'Instagram Login için App ID / App Secret. Business veya Creator hesabı gerekli.':platform==='tiktok'?'Login Kit ve Content Posting API. HTTPS yönlendirme adresi gerekli.':'OAuth 2.0 istemcisi. Read / Write ve medya yetkileri gerekli.'}</p></section>`).join('')}</div><div class="s-settings-footer"><p>Bilgiler bu bilgisayarda saklanır. Uygulama bilgilerini değiştirirsen ilgili hesapları yeniden bağla.</p><button class="s-btn primary" type="submit">Ayarları kaydet</button></div></form>`;
  }
  function automation() {
    const rule = state.automation;
    return pageHeader('OTOMATİK AKIŞ','Klasörden seçsin. <span>Zamanında paylaşsın.</span>','AI videoyu seçer, bağlamına göre metni üretir ve seçtiğin hesaplarda yayınlar.') + `<div class="s-automation-layout"><section class="s-panel"><div class="s-section-title"><span class="s-stat-icon green">${icon('automation')}</span><div><h2>Tekrarlayan paylaşım</h2><p>X, YouTube ve Instagram Reels için.</p></div><span class="s-status ${rule.enabled?'published':'draft'}">${rule.enabled?'Aktif':'Kapalı'}</span></div>${rule.lastError?`<p class="s-error">Son çalıştırma: ${escape(rule.lastError)}</p>`:''}${rule.enabled?`<p class="s-notice">Sıradaki çalışma: ${date(rule.nextAt)}${rule.lastRun?` · Son çalışma: ${date(rule.lastRun)}`:''}</p><button class="s-btn secondary" data-action="stop-automation">Otomatik akışı durdur</button>`:''}<form id="s-automation-form"><label class="s-field" for="s-auto-context"><span>Her paylaşım için kullanılacak bağlam</span><textarea id="s-auto-context" rows="5" maxlength="20000" required>${escape(rule.context||state.context)}</textarea></label><div class="s-two-col"><label class="s-field" for="s-auto-model"><span>AI modeli</span><select id="s-auto-model">${modelOptions(state.textModels,rule.model||state.textModel)}</select></label>${input('s-auto-interval','Kaç saatte bir?','number',rule.intervalHours||24)}</div><div class="s-targets">${targets('auto',['x','youtube','instagram'],rule.targets?.map(target=>target.accountId))}</div><label class="s-field" for="s-auto-privacy"><span>YouTube görünürlüğü</span><select id="s-auto-privacy">${[['private','Gizli'],['unlisted','Liste dışı'],['public','Herkese açık']].map(([value,label])=>`<option value="${value}" ${rule.privacy===value?'selected':''}>${label}</option>`).join('')}</select></label><label class="s-check"><input id="s-auto-kids" type="checkbox" ${rule.madeForKids?'checked':''}><span>Çocuklara özel içerik</span></label><label class="s-check"><input id="s-auto-aigc" type="checkbox" ${rule.aiGenerated?'checked':''}><span>Gerçekçi, AI ile değiştirilmiş içerik</span></label><label class="s-check s-auto-consent"><input id="s-auto-consent" type="checkbox" required><span>Bu hesaplara otomatik yayın yapılmasına izin veriyorum.<small>Her çalışmada AI kullanımı ve platform API ücretleri oluşabilir.</small></span></label><button class="s-btn primary" type="submit" ${!state.openaiConfigured?'disabled':''}>${icon('automation')} Onayla ve akışı başlat</button></form></section><aside class="s-panel s-automation-aside"><span class="s-kicker">AKIŞ NASIL ÇALIŞIR?</span><ol><li><strong>Videolarını ekle</strong><p>${state.folder?escape(state.folder):'Medya kütüphanesinden video klasörünü bağla veya dosya yükle.'}</p></li><li><strong>AI uygun videoyu seçer</strong><p>Dosya adını ve verdiğin bağlamı kullanır. Daha önce planlanmış veya paylaşılmış videolar seçilmez.</p></li><li><strong>Metni hazırlar ve paylaşır</strong><p>Her hesap için ayrı metin üretilir. İlk yayın, seçtiğin aralık dolduğunda yapılır.</p></li><li><strong>Dosyayı arşivler</strong><p>İlgili bütün yayınlar tamamlanınca kaynak video paylasildi/ klasörüne taşınır.</p></li></ol><p class="s-notice">Bilgisayar ve uygulama açık olmalı. Başarısız veya belirsiz yayınlar otomatik tekrarlanmaz.</p><p class="s-help">Instagram otomatik akışta Reels paylaşır ve profil akışında da gösterir. TikTok her içerik için görünürlük ve kullanım onayı ister. TikTok paylaşımlarını içerik stüdyosundan tek tek yayınlayabilir veya onaylayıp planlayabilirsin.</p></aside></div>`;
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
    if(post.platform==='youtube')Object.assign(options,{madeForKids:$('#s-kids').checked,thumbnailId:$('#s-thumbnail').value||null});
    if(post.platform==='instagram')Object.assign(options,{kind:$('#s-ig-kind').value,shareToFeed:$('#s-share-feed').checked});
    if($('#s-aigc'))options.aiGenerated=$('#s-aigc').checked;
    if(post.platform==='tiktok')Object.assign(options,{consent:$('#s-consent').checked, duration:mediaDuration() || ($('#s-media').value===post.media_id?options.duration:undefined), autoMusic:$('#s-auto-music')?.checked||false,ownBrand:$('#s-own-brand').checked, branded:$('#s-branded').checked, allowComment:$('#s-comment').checked, allowDuet:$('#s-duet')?.checked||false, allowStitch:$('#s-stitch')?.checked||false});
    const result=await api(`/api/social/posts/${selected}`,'POST',{revision:post.revision,text:$('#s-post-text').value,title:$('#s-title')?.value||post.title,accountId:$('#s-account').value||null,mediaId:$('#s-media').value||null,context:$('#s-context').value,model:$('#s-model').value,options});
    Object.assign(post,result.post); dirty=false;
  }
  async function upload(file) {
    if(!file)return;
    const type = file.type || (/\.mp4$/i.test(file.name)?'video/mp4':/\.png$/i.test(file.name)?'image/png':/\.webp$/i.test(file.name)?'image/webp':'image/jpeg');
    const result = await api('/api/social/library/upload','POST',file,{'Content-Type':type,'X-File-Name':encodeURIComponent(file.name)});
    const post = state.posts.find(item => item.id === selected);
    if (view === 'compose' && post?.status === 'draft') {
      const options = { ...JSON.parse(post.options), duration:undefined };
      const thumbnail = post.platform==='youtube' && result.media.kind==='image' && /\.(jpg|png)$/.test(result.media.stored_name);
      if(thumbnail)options.thumbnailId=result.media.id;
      await api(`/api/social/posts/${selected}`,'POST',{revision:post.revision,text:post.text,title:post.title,accountId:post.account_id,
        mediaId:mediaFits(post.platform,result.media,options.kind)?result.media.id:post.media_id,options});
    }
    toast('Medya kütüphaneye eklendi.'); await load();
  }
  function wireCallbacks(container) {
    container.querySelectorAll('[data-copy-callback]').forEach(button=>button.addEventListener('click',async()=>{
      try { await navigator.clipboard.writeText(state.connections[button.dataset.copyCallback].callback); toast('Yönlendirme adresi kopyalandı.'); }
      catch { toast('Adresi seçip kopyalayabilirsin.',true); }
    }));
  }
  function openConnectionGuide(platform) {
    const guide=guides[platform];
    const dialog=document.createElement('dialog');
    dialog.className='modal s-connection-guide';dialog.setAttribute('aria-labelledby','s-guide-title');
    dialog.innerHTML=`<div class="s-section-title">${platformBadge(platform)}<div><h2 id="s-guide-title">${names[platform]} bağlantısı</h2><p>Bir kez hazırla, istediğin kadar hesap bağla.</p></div><button class="s-icon-btn" type="button" data-close aria-label="Kurulum rehberini kapat">×</button></div><ol class="s-setup-steps">${guide.steps.map((step,index)=>`<li><span>${index+1}</span><p>${step}</p></li>`).join('')}</ol><a class="s-btn secondary full" href="${guide.url}" target="_blank" rel="noopener noreferrer">${guide.label} ↗</a><form id="s-guide-form">${callbackField(platform)}<p class="s-help">İstenen izinler: <code>${guide.scope}</code></p>${input('s-guide-id',platform==='instagram'?'Instagram App ID':platform==='tiktok'?'Client key':'OAuth Client ID','text','','Kayıtlıysa boş bırak')}${input('s-guide-secret',platform==='instagram'?'Instagram App Secret':'Client secret','password','','Kayıtlıysa boş bırak')}<p class="s-notice">${guide.note}</p>${['instagram','tiktok'].includes(platform)&&!state.mediaDeliveryReady?'<p class="s-help">Şu an yerel adrestesin. Instagram ve TikTok fotoğrafları için herkese açık HTTPS adresi ayarla. Ayrıntılar: docs/platform-setup-tr.md.</p>':''}<div class="s-dialog-actions"><button type="button" class="s-btn secondary" data-close>Kapat</button><button class="s-btn primary" type="submit">Kaydet ve hesabı bağla</button></div></form>`;
    dialog.querySelectorAll('[data-close]').forEach(button=>button.addEventListener('click',()=>dialog.close()));
    dialog.addEventListener('close',()=>dialog.remove(),{once:true});wireCallbacks(dialog);
    dialog.querySelector('form').addEventListener('submit',async event=>{
      event.preventDefault();const button=event.submitter;button.disabled=true;
      try {
        const prefix=platform.toUpperCase();
        await api('/api/social/settings','POST',{[`${prefix}_CLIENT_ID`]:dialog.querySelector('#s-guide-id').value.trim(),[`${prefix}_CLIENT_SECRET`]:dialog.querySelector('#s-guide-secret').value.trim()});
        await load(false);
        if(!state.connections[platform].configured)throw new Error('İlk bağlantı için uygulama kimliğini ve secret değerini gir.');
        window.location.assign(connectPath(platform));
      } catch(error) { toast(error.message,true);button.disabled=false; }
    });
    document.body.append(dialog);dialog.showModal();
  }
  async function openMediaPicker(thumbnail=false) {
    const post=state.posts.find(item=>item.id===selected);
    if(!post)return;
    const dialog=document.createElement('dialog');dialog.className='modal s-media-picker';dialog.setAttribute('aria-labelledby','s-picker-title');
    dialog.innerHTML=`<div class="s-section-title"><div><h2 id="s-picker-title">${thumbnail?'Video kapağı seç':'Görsel veya video seç'}</h2><p>${names[post.platform]} için uyumlu dosyalar.</p></div><button type="button" class="s-icon-btn" data-close aria-label="Medya seçimini kapat">×</button></div><div class="s-picker-toolbar"><button type="button" class="s-btn secondary" data-picker-folder>${icon('media')} Bilgisayardan klasör seç</button><input type="search" class="s-picker-search" placeholder="Dosya ara…" aria-label="Medyada ara"></div><p class="s-help s-picker-feedback" role="status"></p><div class="s-picker-assets"></div><div class="s-dialog-actions"><button type="button" class="s-btn secondary" data-close>Vazgeç</button></div>`;
    const list=dialog.querySelector('.s-picker-assets'),search=dialog.querySelector('input');
    const feedback=dialog.querySelector('.s-picker-feedback');
    function render() {
      const options=JSON.parse(post.options);
      const assets=state.media.filter(asset=>asset.status==='available'&&(thumbnail?asset.kind==='image'&&/\.(jpg|png)$/.test(asset.stored_name):mediaFits(post.platform,asset,options.kind))&&asset.name.toLocaleLowerCase('tr').includes(search.value.toLocaleLowerCase('tr')));
      list.innerHTML=assets.length?assets.map(asset=>`<button type="button" class="s-picker-asset" data-pick="${asset.id}">${asset.kind==='video'?`<video muted playsinline preload="metadata" src="/api/videos/${asset.stored_name}"></video>`:`<img src="/api/images/${asset.stored_name}" alt="" loading="lazy">`}<strong>${escape(asset.name)}</strong><span>${asset.kind==='video'?'MP4 video':'Görsel'} · ${(asset.size/1000000).toFixed(1)} MB</span></button>`).join(''):'<p class="s-notice">Uyumlu medya bulunamadı. Bir klasör seçerek dosyalarını kütüphaneye ekle.</p>';
      list.querySelectorAll('[data-pick]').forEach(button=>button.addEventListener('click',()=>run(button,async()=>{
        const select=$(thumbnail?'#s-thumbnail':'#s-media');
        const asset=state.media.find(item=>item.id===button.dataset.pick);
        if(![...select.options].some(option=>option.value===asset.id))select.add(new Option(asset.name,asset.id));
        select.value=asset.id;
        if(!thumbnail)$('#s-media-preview').innerHTML=preview(asset.id);
        dirty=true;await savePost();dialog.close();await load();
      })));
    }
    dialog.querySelector('[data-picker-folder]').addEventListener('click',()=>openFolderPicker({onSelect:async folder=>{
      feedback.textContent='Klasör taranıyor…';
      try { const result=await api('/api/social/library/scan','POST',{folder});await load(false);render();feedback.textContent=`${result.imported} dosya eklendi.${result.skipped.length?` ${result.skipped.length} dosya atlandı: ${result.skipped[0].error}`:''}`; }
      catch(error){feedback.textContent=error.message;}
    }}));
    search.addEventListener('input',render);dialog.querySelectorAll('[data-close]').forEach(button=>button.addEventListener('click',()=>dialog.close()));
    dialog.addEventListener('close',()=>dialog.remove(),{once:true});document.body.append(dialog);dialog.showModal();render();
  }
  async function openFolderPicker({onSelect} = {}) {
    const dialog = document.createElement('dialog');
    dialog.className = 'modal s-folder-picker';
    dialog.setAttribute('aria-labelledby', 's-folder-picker-title');
    dialog.innerHTML = `<div class="s-section-title"><div><h2 id="s-folder-picker-title">Medya klasörü seç</h2><p>Uygulamanın çalıştığı bilgisayardaki klasörler.</p></div><button type="button" class="s-icon-btn" data-folder-close aria-label="Klasör seçimini kapat">×</button></div>
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
        feedback.textContent = `${result.folders.length} alt klasör. Medyanın bulunduğu klasörü açıp seç.`;
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
      dialog.close();
      if(onSelect)onSelect(current);
      else { $('#s-folder').value = current; dirty = true; $('#s-folder').focus(); }
    });
    document.body.append(dialog); dialog.showModal();
    await browse($('#s-folder')?.value || state.folder || '');
  }
  function bind() {
    wireCallbacks(root);
    root.querySelectorAll('[data-guide]').forEach(button=>button.addEventListener('click',()=>openConnectionGuide(button.dataset.guide)));
    root.querySelectorAll('[data-view]').forEach(button=>button.addEventListener('click',()=>run(button,async()=>{if(view==='compose')await savePost();go(button.dataset.view);})));
    root.querySelectorAll('[data-select]').forEach(button=>button.addEventListener('click',()=>run(button,async()=>{ if(view==='compose')await savePost();else workingContext=null;selected=button.dataset.select;go('compose');})));
    root.querySelectorAll('[data-action]').forEach(button=>button.addEventListener('click',()=>run(button,async()=>{
      const action=button.dataset.action;
      if(action==='project')return openProject();
      if(action==='refresh')return load();
      if(action==='choose-folder')return openFolderPicker();
      if(action==='pick-media'||action==='pick-thumbnail'){await savePost();return openMediaPicker(action==='pick-thumbnail');}
      if(action==='upload') {
        if(view==='compose')await savePost();
        const file=document.createElement('input');file.type='file';file.accept='video/mp4,image/jpeg,image/png,image/webp,.mp4,.jpg,.jpeg,.png,.webp';
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
      $('#s-text-count').textContent=`${count} / ${limits[platform]}`;
      $('#s-text-count').classList.toggle('s-over-limit',count>limits[platform]);
    });
    $('#s-media')?.addEventListener('change',()=>{ $('#s-media-preview').innerHTML=preview($('#s-media').value); });
    $('#s-ig-kind')?.addEventListener('change',()=>{
      const selectedMedia=$('#s-media').value;
      const assets=state.media.filter(asset=>asset.status==='available'&&mediaFits('instagram',asset,$('#s-ig-kind').value));
      $('#s-media').innerHTML='<option value="">Medya seçilmedi</option>'+assets.map(asset=>`<option value="${asset.id}" ${asset.id===selectedMedia?'selected':''}>${escape(asset.name)}</option>`).join('');
      $('#s-media-preview').innerHTML=preview($('#s-media').value);
    });
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
      toast(result.reason || ({publish:'Paylaşım tamamlandı.',schedule:'Paylaşım planlandı.',image:result.thumbnail?'Görsel video kapağı olarak eklendi.':result.attached?'Görsel eklendi.':'Görsel kütüphaneye eklendi.',generate:'Paylaşım metni hazır.',cancel:'Gönderi yeniden taslakta.',resolve:'Yayın durumu güncellendi.'}[action]||'Güncellendi.'));
    })));
    $('#s-folder')?.addEventListener('input',()=>{dirty=true;});
    $('#s-folder-form')?.addEventListener('submit',event=>{event.preventDefault();run(event.submitter,async()=>{const result=await api('/api/social/library/scan','POST',{folder:$('#s-folder').value});dirty=false;await load();toast(`${result.imported} medya eklendi.${result.skipped.length?` ${result.skipped.length} dosya atlandı: ${result.skipped[0].error}`:''}`,Boolean(result.skipped.length));});});
    $('#s-settings-form')?.addEventListener('submit',event=>{event.preventDefault();run(event.submitter,async()=>{
      const body={OPENAI_API_KEY:$('#s-api-key').value.trim(),OPENAI_TEXT_MODEL:$('#s-text-model').value.trim(),OPENAI_IMAGE_MODEL:$('#s-image-model').value};
      for(const platform of networks){const prefix=platform.toUpperCase();body[`${prefix}_CLIENT_ID`]=$(`#s-${platform}-id`).value.trim();body[`${prefix}_CLIENT_SECRET`]=$(`#s-${platform}-secret`).value.trim();}
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
