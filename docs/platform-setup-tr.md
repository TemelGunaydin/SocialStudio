# Sosyal hesapları API ile bağlama

[Başlangıç rehberi](quick-start-tr.md) · [English README](../README.md)

Bu panel kendi geliştirici uygulamaların üzerinden paylaşım yapar. Sosyal medya şifren panele kaydedilmez. OAuth, platformun kendi ekranında hesabını seçip uygulamaya izin vermendir.

Önce panelin yerel ilk kurulumunu tamamla. Sonra **Sosyal hesaplar > Bağlantıyı hazırla** düğmesini aç. Her platformun üç adımlı rehberi, kopyalanabilir yönlendirme adresi ve **Kaydet ve hesabı bağla** düğmesi var. API bilgilerini daha sonra **API ve modeller** sayfasından değiştirebilirsin. Boş alan mevcut değeri korur; geliştirici uygulamasını değiştirirsen o platformun hesaplarını yeniden bağlaman gerekir.

| Platform | Panelden paylaşım | Gereken hesap / erişim |
| --- | --- | --- |
| X | Metin, tek görsel veya MP4 video | Yazma ve medya yüklemeye izin veren API erişimi |
| YouTube | MP4 video, başlık, açıklama, isteğe bağlı JPEG/PNG kapak | YouTube kanalı ve Google OAuth izni |
| Instagram | Tek JPEG gönderisi veya MP4 Reels | Business / Creator hesabı, Instagram Login ve paylaşım izni |
| TikTok | MP4 video veya tek JPEG/WebP fotoğraf | Login Kit, Content Posting API ve hesap başına izin |

## YouTube: birden fazla hesap veya kanal

1. [Google Cloud](https://console.cloud.google.com/apis/library/youtube.googleapis.com) üzerinde proje oluştur veya mevcut projeni seç. **YouTube Data API v3** hizmetini etkinleştir.
2. **Google Auth Platform** bölümünde uygulama adını, destek adresini ve OAuth izin ekranını hazırla. Uygulama test modundaysa kullanacağın Google hesaplarını **Test users** listesine ekle.
3. **Clients > Create client > Web application** ile OAuth istemcisi oluştur.
4. Panelin verdiği adresi **Authorized redirect URIs** listesine aynen ekle. Yerel örnek: `http://localhost:3000/api/social/oauth/youtube/callback`. HTTPS kullanıyorsan panelin gösterdiği HTTPS adresini kullan.
5. **Client ID** ve **Client secret** değerlerini paneldeki rehbere gir. **Kaydet ve hesabı bağla** düğmesine bas.
6. Google ekranında yayın yapacağın hesabı ve varsa ilgili YouTube / marka kanalını seç. Kanalı okuma ve video yükleme izinlerini onayla.
7. **Sosyal hesaplar > YouTube > Başka hesap ekle** ile ikinci hesap veya kanalı bağla. İlk kanalın izni korunur. Aynı kanalı tekrar bağlarsan sadece o kanalın izni yenilenir.

Taslak oluştururken iki kanalı da işaretleyebilirsin. Her kanalın metni, videosu, kapağı ve görünürlüğü ayrı düzenlenir. **Şimdi paylaş** ilgili taslağın seçili kanalına yükler.

İstenen izinler: `youtube.upload` ve `youtube.readonly`. Özel kapak yükleyebilmek için kanalın bu özelliğe erişimi de olmalı. Video başarıyla yüklenir ama kapak reddedilirse panel videoyu yayınlandı olarak tutar ve kapak hatasını gösterir; ikinci bir video yüklemez.

Google'ın test modundaki izinleri süreli olabilir. Denetlenmemiş YouTube API projelerinin yüklemeleri gizliyle sınırlanabilir. Uygulama kodu bu sağlayıcı sınırlarını kaldıramaz. [Google OAuth](https://developers.google.com/identity/protocols/oauth2/web-server), [video yükleme](https://developers.google.com/youtube/data/reference/rest/v3/videos/insert), [özel kapak](https://developers.google.com/youtube/data/reference/rest/v3/thumbnails/set).

## Instagram: gönderi ve Reels

1. Instagram hesabını **Business** veya **Creator** profesyonel hesaba geçir.
2. [Meta Developers](https://developers.facebook.com/apps/) üzerinde bir uygulama oluştur. **Instagram API with Instagram Login** ürününü ekle. Bu bağlantı yöntemi Facebook Sayfası bağlamanı gerektirmez.
3. Geliştirme modunda kullanacağın Instagram hesabını uygulama rolüne / Instagram tester listesine ekle ve gerekiyorsa daveti hesap tarafından kabul et.
4. **Instagram API setup > Business login** ayarlarında panelin gösterdiği HTTPS yönlendirme adresini kaydet. Örnek: `https://studio.example.com/api/social/oauth/instagram/callback`.
5. Instagram ürününe ait **Instagram App ID** ve **Instagram App Secret** değerlerini panele gir. Facebook Login için farklı bir istemcinin bilgilerini kullanma.
6. **Kaydet ve hesabı bağla** düğmesine bas. Instagram ekranında hesabını seç ve içerik paylaşma iznini onayla. İkinci hesabı **Başka hesap ekle** ile ekle.

İstenen izinler: `instagram_business_basic`, `instagram_business_content_publish`. Uygulama rolü dışındaki hesapları bağlamak için Meta incelemesi ve Advanced Access gerekebilir.

İçerik stüdyosunda Instagram taslağını aç:

- **Gönderi** için JPEG görsel seç.
- **Reels** için MP4 video seç. **Reels profil akışında da görünsün** seçeneğini düzenle.
- İngilizce metni kontrol edip **Şimdi paylaş** veya **İleri bir zamana planla** kullan.

Panel medyayı hazırlar, Meta'nın işleme sonucunu bekler ve sonra yayınlar. Uzun süreli izinler kullanılır ve süresi dolmadan son yedi gün içinde kullanım sırasında yenilenir. Süresi tamamen dolmuş izinde hesabı tekrar bağlaman gerekir. [Instagram Login](https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/), [Meta'nın resmi API örnekleri](https://www.postman.com/meta/instagram/documentation/6yqw8pt/instagram-api?entity=request-23987686-3fe78620-2258-44b6-893f-42d76c7200d7).

## TikTok: video ve fotoğraf

1. [TikTok Developers](https://developers.tiktok.com/apps/) üzerinde uygulamanı aç. **Login Kit** ve **Content Posting API / Direct Post** ürünlerini ekle.
2. Panelin HTTPS yönlendirme adresini kaydet. Örnek: `https://studio.example.com/api/social/oauth/tiktok/callback`.
3. **Client key** ve **Client secret** değerlerini panele gir. Hesabınla giriş yapıp `user.info.basic` ve `video.publish` izinlerini ver.
4. Fotoğraf paylaşacaksan, uygulama ayarlarındaki **URL properties** bölümünde medya alan adını veya `https://studio.example.com/api/social/delivery/` önekini doğrula. DNS ile alan adı doğrulaması, sunucudan doğrulama dosyası sunmayı gerektirmez.
5. Taslakta video veya JPEG/WebP fotoğraf seç. **Hesap bilgilerini yenile** düğmesine bas, görünürlüğü seç ve müzik koşullarını onayla. Video için önizleme süresinin yüklenmesini bekle. Ticari içerik / AI bildirimlerini gerektiği gibi seç.

Fotoğrafta isteğe bağlı **TikTok önerilen müziği eklesin** seçeneği bulunur. Tek fotoğraf desteklenir. Her gönderi ayrı onaylanır; TikTok tekrarlayan otomatik akışa dahil değildir.

TikTok, incelenmemiş istemcilerde yayını gizliyle sınırlar. Kendi veya ekibinin hesaplarını yöneten özel kullanım araçları genel kullanıma yönelik API incelemesinde kabul edilmeyebilir. Bu nedenle herkese açık paylaşım izni garanti edilemez. [Direct Post](https://developers.tiktok.com/docs/en/content-posting-api-get-started), [fotoğraf API'si](https://developers.tiktok.com/docs/en/content-posting-api-reference-photo-post), [alan adı ve medya kuralları](https://developers.tiktok.com/docs/en/content-posting-api-media-transfer-guide), [inceleme kuralları](https://developers.tiktok.com/docs/en/content-sharing-guidelines).

## X

[X kurulum rehberini](x-setup.md) kullan. OAuth 2.0 istemcisine okuma, yazma, medya ve çevrimdışı erişim izni ver. Aynı geliştirici uygulamasına birden fazla X hesabı bağlayabilirsin. Metin, görsel ve video yayınları X API üzerinden gider; AI metni İngilizce ve hashtagsiz hazırlar.

## Instagram ve TikTok fotoğrafları için herkese açık HTTPS

Instagram ve TikTok fotoğraf API'si dosyayı uygulamadan indirir. `localhost`, yerel ağ IP'si veya özel Tailscale Serve adresi bu sunucular tarafından erişilemez. X, YouTube ve TikTok video yüklemeleri dosyayı doğrudan API'ye gönderir; ortak kitaplık yine aynı şekilde kullanılır.

1. İlk sahip kurulumunu yerel adreste tamamla ve güçlü bir panel şifresi kullan.
2. Kendi alan adını ve HTTPS reverse proxy / tünel hizmetini Node sunucuna bağla. Node dinleyicisini `127.0.0.1` üzerinde tut. Sertifikanın geçerli ve genel olarak güvenilir olması gerekir.
3. Uygulamayı durdur. Aktif profilin `.env` dosyasında `PUBLIC_BASE_URL=https://studio.example.com` olarak kendi gerçek HTTPS adresini yaz. `HOST=127.0.0.1` ve mevcut `PORT` değeri korunur. Kaynaktan çalıştırırken profil proje klasörüdür; Mac paketinde `~/Library/Application Support/Social Studio/` kullanılır.
4. Proxy, aynı alan adını `Host` başlığında korumalı. API POST isteklerini, videoların Range isteklerini ve büyük yüklemeleri geçirmeli. Video işleme sırasında isteğin açık kalabilmesi için proxy yanıt zaman aşımını en az 10 dakika ayarla. Uygulamayı açıp aynı HTTPS adresinden yeniden giriş yap.
5. Sağlayıcıların izin verilen yönlendirme adreslerini panelde yeni gösterilen adreslerle güncelle. Eski OAuth bağlantısını yenilemen gerekebilir.
6. `/api/social/delivery/` yolu ek bir proxy giriş ekranına yönlenmemeli. Sağlayıcıların imzalı dosyayı çerez olmadan okuyabilmesi gerekir. Bu yolun sorgu parametrelerini proxy erişim günlüklerinden çıkar.

Panel yalnızca yayın için seçilen dosyanın bir saat geçerli imzalı bağlantısını üretir. İmza başka dosyada kullanılamaz; süre değiştirildiğinde geçersiz olur. Normal medya önizlemeleri, hesap bilgileri, klasör taraması ve yayın işlemleri sahip oturumu ister. Bu uygulama tek sahip içindir; çok kullanıcılı bir hizmet sunmaz.

## Ortak medya ve düzenli paylaşım

**Klasörden / kütüphaneden seç** bütün platformların taslaklarında bulunur. JPEG/PNG/WebP ve MP4 tek kitaplıkta tutulur, seçici platforma uygun dosyaları gösterir. AI dosya adı ve bağlamla seçim yapar; dosyanın içeriğini analiz etmez. Görseller 5 MB, videolar 100 MB altında olmalı. Dosyalar otomatik dönüştürülmez. Sağlayıcıların ek çözünürlük, oran, süre ve kodek kuralları geçerlidir.

Kaynak dosya, ona bağlı bütün gönderiler ve YouTube kapak kullanımları başarıyla tamamlandığında `paylasildi/` klasörüne taşınır. Ortak dosya henüz başka bir taslakta kullanılıyorsa bekletilir.

**Otomatik akış** X, YouTube ve Instagram Reels için kullanılabilir. Instagram'da seçilen video Reels olarak yayınlanır ve profil akışında gösterilir. Bilgisayar ve uygulama açık kalmalıdır. Başarısız veya sonucu belirsiz yayın otomatik tekrarlanmaz; önce platform hesabını kontrol et.
