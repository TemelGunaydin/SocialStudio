# Social Studio

[![CI](https://github.com/TemelGunaydin/SocialStudio/actions/workflows/ci.yml/badge.svg)](https://github.com/TemelGunaydin/SocialStudio/actions/workflows/ci.yml) · [MIT](LICENSE) · [X kurulum rehberi](docs/x-setup.md) · [Güvenlik](SECURITY.md) · [Katkıda bulun](CONTRIBUTING.md)

Local-first X marketing studio with guided setup and human-approved publishing. The current UI and setup guide are in Turkish. Bring your own OpenAI and X API accounts; provider charges apply.

Yerel, tek yöneticili X paylaşım paneli. Kendi projelerini tanımlarsın; her gün İngilizce bir taslak hazırlanır. Metni ve görseli inceleyip **Onayla ve yayınla** demeden X'e gönderi gönderilmez. Ücretli API hesapları uygulamanın değil, kuran kişinin kendi hesaplarıdır.

## Hızlı başlangıç

[Node.js 22.13+](https://nodejs.org/) kurduktan sonra:

```sh
git clone https://github.com/TemelGunaydin/SocialStudio.git
cd SocialStudio
npm start
```

Terminalde gösterilen **tam kurulum bağlantısını** aç ve şifreni belirle. API anahtarlarını dosya düzenlemeden paneldeki **Kurulum ve bağlantılar** bölümünden ekleyebilirsin. Üçüncü taraf npm bağımlılığı yok; `npm install` gerekmez.

**Yayın durumu:** Kaynak kodu MIT lisanslıdır. Henüz imzalı/notarize edilmiş bir Mac indirmesi yok. `dist/` repoya dahil değildir; aşağıdaki Mac akışı [paketi yerelde ürettikten](#mac-paketini-üretme-geliştirici) sonra kullanılabilir.

## Mac: çift tıkla başla

`npm run package:mac` ile yerelde üretilen `dist/Social Studio.app` paketini aç. Node uygulamanın içindedir; terminal veya ayrı Node kurulumu gerekmez (macOS 13+, Apple Silicon paketi burada doğrulandı). Yerel panel varsayılan tarayıcında açılır:

1. **Panel şifreni belirle.** Şifreyi parola yöneticine kaydet; yeni şifre dosyaya düz metin değil tuzlanmış hash olarak yazılır.
2. **OpenAI anahtarını yapıştır.** Rehber doğrudan anahtar oluşturma sayfasına yönlendirir. Anahtarlar ekranda gizlidir ve sonraki açılışta geri döndürülmez. Kaydetmek yalnızca yerel dosyayı günceller; API çağrısı yapmaz ve doğrulama anlamına gelmez. OpenAI olmadan elle taslakla başlayabilirsin.
3. **Proje URL'sini ekle.** Önerileri kontrol et ve kaydet.
4. **Kendi X uygulamanı bağla.** Paneldeki adım adım Developer Console rehberini izle; callback adresini kopyala ve OAuth 2.0 Client ID / Client Secret bilgilerini kaydet. Ortak X uygulaması veya uzak sunucu kullanılmaz. [Ayrıntılı X rehberi](docs/x-setup.md).
5. **İlk taslağını oluştur.** Günlük ücretli üretim yeni kurulumlarda **kapalıdır**; son adımda istersen aç. Yayın her zaman ayrı onay ister.

Anahtarları sonradan **Kurulum ve bağlantılar** düğmesinden değiştirebilirsin; yeniden başlatmak gerekmez. Boş alan kayıtlı anahtarı korur. X bilgilerini değiştirmek mevcut bağlantıyı keser ve eski OAuth isteklerini geçersiz kılar. Anahtarlar Mac'te `~/Library/Application Support/Social Studio/.env`, veriler aynı dizindeki `data/` altında kalır. Bu klasörü yedekle. Uygulama paketini değiştirmen verilerini silmez. Pencereyi kapatmak sunucuyu durdurmaz; **⌘Q** onayından sonra sunucu kapanır. 3000 portu doluysa önce diğer yerel sunucuyu durdur.

**Dağıtım notu:** Mevcut paket yerel geliştirme için ad-hoc imzalıdır; Developer ID ile imzalanmış ve Apple tarafından notarize edilmiş bir genel sürüm değildir. İnternetten indirenlerde Gatekeeper uyarısı çıkabilir. Herkese açık, sorunsuz uygulama dağıtımından önce imzalama/notarization tamamlanmalı; Gatekeeper'ı kapatmayın.

## Kaynaktan çalıştırma (macOS / Linux / Windows)

[Node.js 22.13+](https://nodejs.org/) kur ve proje klasöründe `npm start` çalıştır. İlk açılışta terminaldeki **tam kurulum bağlantısını** aç (sonunda `#setup=…` bulunur). Bu tek kullanımlık yerel bağlantı başka birinin ilk yönetici olmasını engeller; paylaşma. Normal `http://localhost:3000` adresi tek başına ilk yönetici kaydı yapamaz. Ardından yukarıdaki sihirbazı izle. Eski CLI yolu `npm run setup` da korunur; mevcut `.env` üzerine yazmaz.

Mevcut `.env` kurulumları eski yönetici şifresi ve kayıtlı X hesabıyla çalışmaya devam eder. Mac paketinin profili kaynak klasöründeki `.env` ve `data/` dizininden **ayrıdır**; eski kurulumun yeni ve boş profile otomatik kopyalanmaz. Eski paneli kullanmak için proje klasöründe `npm start` yeterlidir.

## Proje ekleme

Giriş yaptıktan sonra **Proje ekle** düğmesinden ürününün HTTPS bağlantısını, adını, platformunu ve **kendin doğruladığın** özellikleri satır satır gir. **URL'den önerileri getir** düğmesine basarsan uygulama yalnızca verdiğin tek herkese açık HTTPS HTML sayfasını okur (tüm siteyi taramaz); metin ve son URL, özellik önerileri için kendi OpenAI API anahtarınla OpenAI'ye gönderilir (ücretli). Bu işlem URL yazınca kendiliğinden başlamaz. Kaynak alıntılarıyla birlikte önerilen alanları incele, yanlış iddiaları düzelt/sil ve doğrulama kutusunu işaretleyerek projeyi kaydet. JavaScript ile yüklenen veya erişim gerektiren sayfalar okunamayabilir; alanları elle doldurabilirsin. Ardından X hesabını bağla. Yeni kurulumlar boş başlar; sadece eski Build & Runs kurulumundaki altı proje eski verilerle beraber aktarılır. İstersen birden çok proje ekleyip taslakları bunlar arasında sırayla oluşturabilirsin.

`npm start` varsayılan olarak yalnızca `127.0.0.1:3000` üzerinde çalıştırır. Günlük üretim etkinse her gün İstanbul saatiyle `.env` içindeki `DRAFT_HOUR` saatinde taslak hazırlar. Yeni sihirbaz/CLI kurulumlarında `SCHEDULE_ENABLED=false` olur; eski kurulumda bu ayar yoksa mevcut otomatik üretim davranışı korunur. Bilgisayar kapalıysa ilk açılışta o günün taslağını hazırlar; üretim başarısız olursa otomatik tekrar denemez. Proje veya OpenAI anahtarı yokken günlük taslak üretilmez. Taslak üretmek, görsel üretmek, hesap bağlamak veya sayfayı yenilemek **yayın yapmaz**. Yayın için bağlı X hesabı ve panelde açık onay gerekir.

## Ücret ve gizlilik

- OpenAI ve X hesaplarını **her kullanıcı kendisi açar, kredi ve limitini kendisi yönetir**. X'e bağlantılı gönderi, medya yükleme, API okuma ve OpenAI çağrıları ücretli olabilir. [X güncel fiyatları](https://docs.x.com/x-api/getting-started/pricing) ve [OpenAI fiyatları](https://openai.com/api/pricing/) yayın öncesi kontrol edilmeli. X Console'da harcama limiti koy.
- Bakiye kartı X geliştirici hesabının gerçek kalan bakiyesini gösterir; günlük/aylık yayın maliyeti yalnızca bu panelden başarılı URL'li gönderiler için **tahmindir**. Görsel yükleme, OpenAI, başka X uygulamaları, başarısız istekler dahil değildir. Gerçek faturayı ilgili sağlayıcı panellerinde görürsün.
- `.env`, `data/` ve OAuth tokenları Git dışında kalır. Veri tabanı SQLite'tır; yerel dizini yedekle. Oturum çerezi imzalıdır; parola ve API anahtarlarını kimseyle paylaşma. Tek yönetici / tek süreç tasarlanmıştır; internete açık çok kullanıcılı SaaS olarak kurma.
- Yayın sırasında sunucu kesilirse olası çift gönderimi önlemek için taslak belirsiz durumda kalır; X hesabındaki gönderileri kontrol etmeden tekrar yayınlanmaz.

## iPhone / Tailscale (isteğe bağlı)

Mac ve iPhone aynı Tailscale ağında olmalı. `tailscale ip -4` ile Mac IP'sini öğren; `.env` içinde `HOST=MAC_TAILSCALE_IP` ve `PUBLIC_BASE_URL=http://MAC_TAILSCALE_IP:3000` yap. Sunucuyu yeniden başlat ve iki cihazda da aynı adresi aç. OAuth hesabını yeniden bağlayacaksan X Console'daki callback listesine `PUBLIC_BASE_URL/api/x/callback` ekle. Alternatif: [Tailscale Serve](https://tailscale.com/docs/features/tailscale-serve) ile localhost üzerinde HTTPS sun, `HOST=127.0.0.1` bırakıp `PUBLIC_BASE_URL` değerini Serve URL'si yap. Tailscale dışına herkese açık erişim verme; bu panel ayrı kullanıcı hesapları/tenant izolasyonu sağlamaz.

## Mac paketini üretme (geliştirici)

Mac'te Xcode Command Line Tools kurulu olmalı. `npm run package:mac`, resmi Node **v22.23.3** çalışma zamanını nodejs.org üzerinden indirip SHA-256 listesini kontrol eder, AppKit başlatıcısını derler ve `dist/Social Studio.app` ile `dist/Social-Studio-mac-arm64.zip` üretir. Homebrew kitaplıklarına bağlı Node kopyalanmaz. Intel hedefi için `ARCH=x86_64 npm run package:mac` kullanılabilir; Intel çalışma testi henüz yapılmadı. Paket yalnızca `server/`, `public/`, `package.json`, `LICENSE` ve Node runtime/lisansını içerir; `.env`, veritabanı ve tokenlar kopyalanmaz. `dist/` ve `.cache/` Git dışında tutulur. Resmi Node sürümünü güvenlik güncellemelerinde yenileyin.

## Geliştirme ve lisans

[MIT lisansı](LICENSE) ile kullanılabilir ve katkıya açıktır. Paketlenen Node çalışma zamanı kendi lisans ve üçüncü taraf bildirimleriyle gelir. Ürün isimleri/logoları ve X/OpenAI hizmetleri için ilgili haklar ve sağlayıcı şartları geçerlidir; MIT lisansı API erişimi veya kredi sağlamaz.

`npm test` yerel testleri çalıştırır; gerçek API çağrısı ve yayın yapmaz. CI, Linux/macOS üzerinde testleri ve Mac paketinin derlenmesini kontrol eder; otomatik release veya ücretli API kullanımı yoktur. [Katkı rehberi](CONTRIBUTING.md) ve [özel güvenlik bildirimi](SECURITY.md) için bu belgeleri kullanın. Var olan kurulumdan yükseltmede `data/studio.sqlite` yedeğini al: ilk açılış mevcut proje kimliklerini yeni `projects` tablosuna kopyalar, taslaklar ve X bağlantısı korunur. Eski sunucu koduna dönmek için önceki kod sürümüne geçebilirsin; eski kod yeni tabloyu görmez ama eski taslaklar ve tokenları okumaya devam eder. Yeni eklenen projeleri eski kodla kullanma.
