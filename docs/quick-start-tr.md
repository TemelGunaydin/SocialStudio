# Social Studio: başlangıç rehberi

[English README](../README.md) · [Teknik ayrıntılar](advanced-usage.md)

Social Studio, sosyal medya hesapların için içerik hazırlayıp paylaşabileceğin bir uygulamadır. Kendi bilgisayarında çalışır; tarayıcıdan kullanırsın. Aynı platforma birden fazla hesap bağlayabilirsin. Örneğin kişisel X hesabın ve şirketinin X hesabı aynı panelde bulunabilir.

## Neler yapabilirsin?

- X için metin, görsel veya video paylaşımı hazırlayabilirsin.
- YouTube için video başlığı ve açıklaması hazırlayıp video yükleyebilirsin.
- TikTok için video ve açıklama hazırlayabilir, her gönderinin ayarlarını onaylayarak yayınlayabilirsin.
- Yazdığın notlardan AI ile paylaşım metni ve görsel üretebilirsin.
- Luna dahil, hesabında erişimin olan modellerden seçim yapabilirsin.
- Video klasörünü tanıtıp AI'ın dosya adlarına ve notlarına göre seçim yapmasını sağlayabilirsin.
- X ve YouTube hesapların için düzenli otomatik paylaşım açabilirsin.

Taslak oluşturmak paylaşım yapmaz. Otomatik paylaşım, sen ayrıca izin verip etkinleştirene kadar kapalıdır.

## 1. Uygulamayı aç

Bilgisayarına [Node.js 22.13 veya üstünü](https://nodejs.org/) ve [Git](https://git-scm.com/downloads) yükle. Terminalde şu komutları çalıştır:

```sh
git clone https://github.com/TemelGunaydin/SocialStudio.git
cd SocialStudio
npm start
```

`npm install` çalıştırman gerekmez.

Terminalde gösterilen **bağlantının tamamını** tarayıcıda aç. İlk kurulumda bağlantının sonundaki `#setup=...` kısmı da bulunmalı. Panel için bir şifre belirle ve güvenli bir yere kaydet.

Uygulamayı kullanırken terminal açık kalsın. Kapatmak için terminalde **Ctrl+C**, yeniden açmak için `npm start` kullan.

Henüz herkese açık, imzalı bir Mac uygulaması indirmesi bulunmuyor. Geliştiriciler [Mac paketini kendileri oluşturabilir](advanced-usage.md#building-the-mac-package-developers).

## 2. AI ve sosyal hesaplarını bağla

**API**, uygulamanın başka bir hizmetle senin izninle iletişim kurmasını sağlayan bağlantıdır. API kullanımı, sağlayıcıya göre ücret, kredi veya onay gerektirebilir.

1. **API ve modeller** sayfasını aç. AI özelliklerini kullanacaksan OpenAI API anahtarını ekle. Metin ve görsel için ayrı model seçebilirsin.
2. Paylaşım yapacağın platformların geliştirici uygulaması bilgilerini aynı sayfaya gir. Gösterilen **Callback / yönlendirme adresi** değerini ilgili sağlayıcının uygulama ayarlarına aynen ekle. Bu adres, hesap izni verdikten sonra panele dönmeni sağlar.
3. **Sosyal hesaplar** sayfasından hesabını bağla. İkinci bir hesap eklemek için aynı işlemi o hesapla tekrarla.

Sosyal medya şifreni bu panele girmezsin; izni platformun kendi sayfasında verirsin. Kaydedilmiş bir anahtar alanını boş bırakırsan mevcut değeri korunur.

X için [adım adım kurulum rehberi](x-setup.md), diğer teknik bağlantılar için [ayrıntılı rehber](advanced-usage.md#developer-api-setup-and-provider-limits) var. Hesap bağlamadan ve API anahtarı eklemeden de elle taslak hazırlayabilirsin.

## 3. İlk paylaşımını hazırla

1. **İçerik stüdyosu** sayfasını aç.
2. **Bağlam ve paylaşım notların** alanına ne anlatmak istediğini yaz. Örneğin:

   > Uygulamam sesli notları metne dönüştürüyor. İçerik üreticilerine yönelik, kısa ve samimi bir Türkçe paylaşım yaz. Vermediğim özellikleri ekleme ve sonuç garantisi verme.

3. Modelini ve hedef hesaplarını seç. **Taslakları oluştur** düğmesine bas. Metni kendin yazacaksan **Metinleri AI ile hazırla** seçimini kaldır.
4. Her hesabın düzenleme alanında metni kontrol et. **Video yükle** ile dosya ekle, kütüphaneden seç veya **AI video seçsin** düğmesini kullan. **Görsel üret** ile resim oluşturabilirsin. YouTube ve TikTok'ta yayın için video gerekir; görsel üretmek videoya dönüştürme yapmaz.
5. Doğru hesabı seçtiğinden emin ol, medyayı önizle ve gerekiyorsa görünürlük ile içerik bildirimlerini düzenle.
6. **Taslağı kaydet** ile sakla, **Şimdi paylaş** ile yayınla veya **İleri bir zamana planla** bölümünden zamanı seçip onayla.

TikTok'ta hesap bilgilerini yenile, görünürlüğü seç ve müzik kullanım koşullarını onayla. İçerik reklam veya AI ile üretilmiş içerik kapsamındaysa ilgili seçenekleri de işaretle.

Bütün taslaklarını ve yayın durumlarını **Paylaşım kuyruğu** sayfasında görebilirsin.

Planlama İstanbul saatine göredir. Bilgisayar ve uygulama açık olmalı. Plan saatinde kapalıysa onaylanmış gönderi uygulamayı tekrar açtığında yayınlanabilir. **Kontrol gerekli** durumunda önce platform hesabını kontrol et; gönderi yayınlanmış olabilir.

## 4. Video klasörünü ekle

**Medya kütüphanesi** sayfasında **Klasör seç** düğmesine bas. Açılan pencerede video klasörünü bulup **Bu klasörü seç** düğmesine bas; klasör yolu otomatik doldurulur. Videoları içe almak için **Klasörü tara** düğmesini kullan. İstersen yolu elle de yazabilirsin. Mac için örnek:

```text
/Users/Adin/Movies/SosyalMedya
```

Windows'ta kendi Windows klasör yolunu kullan. Klasör, uygulamanın çalıştığı bilgisayarda olmalı. En fazla **100 MB** büyüklüğündeki MP4 dosyaları içe alınır. Alt klasörler taranmaz ve videolar başka bir biçime dönüştürülmez.

Dosyaları `sesli-notlar-demo.mp4` gibi açıklayıcı adlandır. **AI, dosya adını ve verdiğin notları kullanır; videoyu izlemez veya konuşmaları çözümlemez.**

Dosyaların nasıl düzenlenir?

1. Tarama sırasında önizleme ve yayın için özel bir kopya oluşturulur. Orijinal dosya yerinde kalır.
2. Aynı videoyu kullanan bütün gönderiler başarıyla yayınlandığında orijinal, kendi klasöründeki `paylasildi/` alt klasörüne taşınır.
3. Bir gönderi hâlâ taslaksa, başarısızsa veya sonucu belirsizse orijinal taşınmaz. Taşıma hatası varsa kütüphanedeki hata mesajından yeniden deneyebilirsin.

Tarayıcıdan tek dosya yüklediğinde kaynak klasör izni verilmez; bu nedenle bilgisayarındaki orijinal dosya taşınmaz.

## 5. Düzenli otomatik paylaşımı aç

Bu akış **X ve YouTube** içindir. TikTok'ta her gönderinin ayarlarını ayrıca onaylaman gerekir.

1. Videolarını kütüphaneye ekle veya bir video klasörü bağla.
2. **Otomatik akış** sayfasında bağlamı, modeli, hesapları ve paylaşım aralığını belirle. Aralık 1-168 saat olabilir.
3. YouTube görünürlüğünü ve içerik seçeneklerini kontrol et.
4. Otomatik yayın iznini işaretle ve **Onayla ve akışı başlat** düğmesine bas.

İlk paylaşım hemen yapılmaz; seçtiğin aralık dolduğunda yapılır. Her çalışmada video seçilir, hesap başına metin hazırlanır ve paylaşılır. Bağladığın klasör de yeniden taranır. Bilgisayar ve uygulama açık kalmalı. Gelecek çalışmaları durdurmak için **Otomatik akışı durdur** düğmesini kullan.

## Ücretler ve verilerin

- AI ile metin/görsel üretimi ve video seçimi, OpenAI hesabından ücretlendirilebilir. Platform API işlemleri de ücretli olabilir. Otomatik akış açıkken yeni ücretler oluşabilir; uygulama bir harcama sınırı uygulamaz.
- Hesap bağlamak yayın iznini garanti etmez. YouTube bazı geliştirici hesaplarının yüklemelerini gizli tutabilir. TikTok yayın onayı ister ve kişisel hesap yönetimi araçlarını onaylamayabilir. Ayrıntılar [bağlantı rehberinde](advanced-usage.md#developer-api-setup-and-provider-limits).
- Taslaklar ve ayarlar bilgisayarında saklanır. AI kullandığında ilgili notlar, proje bilgileri ve dosya adları OpenAI'a; yayın yaptığında seçtiğin metin ve medya ilgili platforma gönderilir.
- Yedek almak için uygulamayı durdurup proje klasöründeki `.env` dosyasını ve `data/` klasörünü birlikte kopyala. Mac paketi bunları ayrı bir yerde saklar: `~/Library/Application Support/Social Studio/`.

## Sorun yaşarsan

AI çalışmıyorsa anahtarı, sağlayıcı bakiyesini ve seçtiğin modele erişimi kontrol et. Hesap bağlanmıyorsa aynı geliştirici uygulamasına ait bilgileri kullandığından ve yönlendirme adresinin birebir eşleştiğinden emin ol. Video görünmüyorsa MP4 biçimini, 100 MB sınırını ve klasör yolunu kontrol edip yeniden tara.

Önceki X taslakları, elle LinkedIn/TikTok paylaşımı, Mac paketi ve telefondan erişim için [teknik rehbere](advanced-usage.md) bakabilirsin. Güvenlik sorunları için [özel bildirim yolu](../SECURITY.md) bulunuyor.
