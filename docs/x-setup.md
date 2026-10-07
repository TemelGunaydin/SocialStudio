# X bağlantısını kurma

Social Studio kendi bilgisayarında çalışır. Her kullanıcı kendi X Developer hesabını, uygulamasını ve kredisini kullanır. Bu kurulum X şifreni Social Studio'ya vermez; son yetkiyi X'in kendi ekranında verirsin.

## Hazırlık

- Paylaşım yapacağın X hesabına giriş yap.
- [X Developer Console](https://console.x.com/) hesabını aç. X'in talep ettiği plan/kredi ve geliştirici şartlarını kontrol et. X Premium veya ChatGPT aboneliğinin API kredisi sağladığını varsayma.
- API fiyatları için [X'in güncel listesini](https://docs.x.com/x-api/getting-started/pricing) kontrol et; hesapta mevcutsa harcama limiti ayarla. Uygulamanın maliyet kartı tahmindir, bir harcama sınırı değildir.

## 1. Uygulamanı oluştur

Console'da uygulamanı oluştur veya mevcut olanı seç. İsim sana ait olabilir, örneğin “My Social Studio”. Kullanım açıklaması istenirse aşağıdaki metni **gerçek kullanımına göre** düzenle; şartları kendin inceleyip kabul et:

> I use this local app to manage my own X account and promote my products or services. It uses OAuth to read my basic account profile, upload optional images and publish posts only after I review and approve them. Drafts may be generated with AI from product information I provide. OAuth tokens are stored on my computer. I do not collect other users' data or use X data to train AI models.

## 2. Kullanıcı yetkilendirmesini aç

Uygulama ayarlarında **User authentication settings** / **Set up** veya **Edit** bölümünü bul. Ekran isimleri X arayüzüne göre değişebilir; API anahtarları ekranı ile kullanıcı yetkilendirme ekranı aynı değildir.

- OAuth 2.0'ı etkinleştir.
- Uygulama tipi: **Web App** (confidential client). Uygulama bilgisayarında çalışsa da Client Secret'ı tarayıcıda değil yerel sunucuda tutar.
- Callback / Redirect URI: Social Studio → **Kurulum ve bağlantılar → X hesabı** bölümündeki adresi kopyala. Varsayılan: `http://localhost:3000/api/x/callback`.
- Website URL: kendi herkese açık HTTPS ürün siteni gir. Bu alan callback değildir.
- Kaydet; sonra **Keys and tokens** bölümüne geri dön.

Callback eşleşmesi **birebir** olmalı. `localhost` ile `127.0.0.1`, `http` ile `https`, farklı portlar ve sondaki `/` birbirinden farklıdır. Tailscale adresini değiştirirsen Console'daki callback'i de güncelle.

**İzin ayrımı:** OAuth 1.0a için görünen “Read and write” ayarı tek başına OAuth 2.0 kurulumu değildir. OAuth 2.0 yetkileri izin ekranındaki kapsamlarla belirlenir: `tweet.read`, `tweet.write`, `users.read`, `media.write`, `offline.access`. Yenileme kapsamı yeniden giriş yapmadan bağlı kalmayı, medya kapsamı isteğe bağlı görsel yüklemeyi sağlar. DM erişimi istenmez. [Resmi X uygulama rehberi](https://docs.x.com/fundamentals/developer-apps).

## 3. Doğru iki değeri kaydet

| X'teki değer | Social Studio alanı |
| --- | --- |
| OAuth 2.0 Client ID | OAuth 2.0 Client ID |
| OAuth 2.0 Client Secret | OAuth 2.0 Client Secret |
| API Key / API Secret / Bearer Token | Kullanılmaz; yukarıdaki değerlerin yerine geçmez |

Client Secret yalnızca ilk oluşturulduğunda gösterilebilir. Kaybettiysen Console'dan yenile; yeni değeri panelde kaydet ve hesabı tekrar bağla. Anahtarları sohbete, GitHub issue'suna veya ekran görüntüsüne koyma.

Kaydetme API çağrısı yapmaz ve değerlerin çalıştığını doğrulamaz. Boş alanlar eski değeri korur. Kimlik bilgileri değişirse önceki X bağlantısı kesilir.

## 4. X izin ekranını aç

Panelde **X izin ekranını aç** düğmesine bas. X'in gösterdiği hesabı ve izinleri kontrol et; doğruysa yetkilendir. Panelde `@kullanıcıadın` bağlı görünmeli. Bu sırada temel hesap okuma isteği yapılır; X'in fiyatlandırmasına tabi olabilir. Hiçbir tweet yayınlanmaz. İlk gönderi ancak taslağı inceleyip **Onayla ve yayınla** dediğinde yayınlanır.

## Sorun giderme

- **Client ID görünmüyor:** Kullanıcı yetkilendirmesini OAuth 2.0 / Web App olarak kaydet; doğru uygulamanın Keys and tokens ekranını aç. API Key ekranıyla karıştırma.
- **redirect_uri / callback hatası:** Panelde kopyalanan tam adresi Console'daki kayıtla karşılaştır. Sunucunun çalıştığından ve tarayıcının aynı adreste olduğundan emin ol.
- **invalid_client / 401:** Aynı uygulamaya ait OAuth 2.0 Client ID ve Client Secret kullan; API Key değil. Başta/sonda boşluk bırakma.
- **403 / kredi / plan hatası:** Developer hesabında gereken endpoint erişimini, krediyi ve izinleri kontrol et. Panel bu kısıtlamaları kaldıramaz.
- **state süresi doldu:** Panelden yeni bağlantı başlat; eski sekmeyi veya geri düğmesini kullanma. Kimlik bilgilerini değiştirdiysen eski izin bağlantısı iptal edilir.
- **Yanlış hesap:** Yetkilendirmeyi iptal et. Panelde bağlantıyı kes; X'te doğru hesaba giriş yapıp yeniden bağlan.
- **İzinleri değiştirdim:** Mevcut bağlantıyı kesip yeniden yetkilendir. Eski token yeni izni otomatik kazanmaz.

Resmi teknik kaynak: [OAuth 2.0 Authorization Code + PKCE](https://docs.x.com/resources/fundamentals/authentication/oauth-2-0/authorization-code). Menü adları ve fiyatlar değişebileceği için takıldığında güncel Console ve resmi belgeleri esas al.
