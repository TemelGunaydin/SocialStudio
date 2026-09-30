# Build & Runs Social Studio

Altı Build & Runs uygulaması için günlük İngilizce X taslağı üretir. Taslaklar özel web panelinde görünür. Metin ve görsel düzenlenebilir; **yalnızca “Onayla ve yayınla” düğmesi** X API'ye gönderi oluşturma isteği yollar.

## Çalıştırma

Node.js 22.13+ gerekir. Projede üçüncü taraf npm bağımlılığı yoktur.

1. Bu çalışma alanında `.env` hazırdır. Yeni bir kopyada `.env.example` dosyasını `.env` olarak kopyalayın ve güçlü bir `ADMIN_PASSWORD` ile en az 32 rastgele karakterden oluşan `SESSION_SECRET` girin. Hazır dosyadaki `ADMIN_PASSWORD`, panele giriş şifrenizdir.
2. `.env` dosyasına `OPENAI_API_KEY` ekleyin. Bu anahtar, günlük metin ve isteğe bağlı görsel üretimi içindir. ChatGPT aboneliği API kullanımını kapsamaz.
3. [X Developer Console](https://console.x.com/) içinde uygulamanın **User authentication settings** bölümünden OAuth 2.0'ı etkinleştirin ve **Web App** türünü seçin. Callback adresini `.env` içindeki `PUBLIC_BASE_URL` değerinin sonuna `/api/x/callback` ekleyerek ayarlayın; varsayılan adres `http://localhost:3000/api/x/callback` olur. Ardından **Keys and tokens** bölümünde görünen OAuth 2.0 **Client ID** ve **Client Secret** değerlerini `.env` içindeki `X_CLIENT_ID` ve `X_CLIENT_SECRET` alanlarına girin. Bunlar **API Key** ve **API Secret** değerlerinden farklıdır. Client ID görünmüyorsa OAuth 2.0 ayarını kaydedip Keys and tokens bölümünü tekrar açın. Uygulama `tweet.read`, `tweet.write`, `users.read`, `media.write` ve `offline.access` izinlerini ister.
4. `npm start` çalıştırın, `PUBLIC_BASE_URL` adresini açın, `.env` içindeki `ADMIN_PASSWORD` ile giriş yapın ve X hesabını bağlayın.

Yerelde `PUBLIC_BASE_URL=http://localhost:3000` kullanılabilir. İnternete açık kurulumda HTTPS ve kalıcı bir `DATA_DIR` gerekir. Sunucu sürekli çalışmalıdır: her gün `DRAFT_HOUR` saatinde (Europe/Istanbul), en son taslağın uygulamasından sonraki uygulama için bir taslak üretir. O saatte kapalıysa tekrar açıldığında o günün taslağını üretir. Hata alan günlük üretim panelde görünür ve aynı gün otomatik tekrar denenmez. Onaylanmayan taslaklar yayınlanmaz.

## Tailscale ile iPhone erişimi

Mac ve iPhone aynı Tailscale ağına bağlı olmalıdır. Mac'in güncel IPv4 adresini `tailscale ip -4` ile bulun. `.env` içinde `HOST` değerini bu IP, `PUBLIC_BASE_URL` değerini `http://MAC_TAILSCALE_IP:3000` yapın ve `npm start` ile sunucuyu yeniden başlatın. Her iki cihazda da paneli bu adres üzerinden açın. `HOST` yalnızca Tailscale arayüzünü dinler; Tailscale Mac'te sunucudan önce çalışmalıdır. Yerel kullanıma dönmek için `HOST=127.0.0.1` ve `PUBLIC_BASE_URL=http://localhost:3000` ayarlayın.

Mevcut X bağlantısı adres değişince korunur. X hesabını yeniden bağlamak için Developer Console'daki callback listesine yeni `PUBLIC_BASE_URL/api/x/callback` adresini ekleyin. Giriş ve yayın istekleri, `PUBLIC_BASE_URL` ile aynı adres üzerinden yapılmalıdır.

HTTPS adresi için [Tailscale Serve](https://tailscale.com/docs/features/tailscale-serve) de kullanılabilir: `tailscale serve --bg http://127.0.0.1:3000` çalıştırın, `HOST=127.0.0.1` bırakın ve `PUBLIC_BASE_URL` değerini komutun gösterdiği HTTPS adresiyle değiştirin. X callback adresini de buna göre güncelleyin.

## Görseller

Taslakta görselsiz yayın, uygulama ikonu, yerel PNG/JPEG/WebP dosyası veya OpenAI ile üretilen kare görsel seçilebilir. OpenAI görseli yalnızca panelde ilgili düğmeye basılınca üretilir ve onaydan önce önizlenir. Üretilen görseller X'e `made_with_ai` bilgisiyle gönderilir. Görsel boyutu 5 MB altında olmalıdır.

## Veri ve güvenlik

Taslaklar, X OAuth tokenları ve görseller `DATA_DIR` içindeki SQLite dosyası ile klasörde saklanır. Bu dizini kalıcı ve özel tutun; yedekleyin. Panel tek yöneticilidir ve şifreli oturum çerezi kullanır. Çoklu sunucu kopyası çalıştırmayın. Yayın isteği sırasında sunucu kapanırsa taslak `X üzerinde kontrol et` durumunda kalır; olası çift gönderimi önlemek için otomatik yeniden yayınlanmaz.

Ürün bilgileri [buildandruns.com](https://buildandruns.com/) sayfalarından `server/catalog.mjs` içine derlenmiştir. Ürün özellikleri değiştiğinde bu dosyayı güncelleyin; model yalnızca burada yer alan doğrulanmış özelliklerden yazması için yönlendirilir.

## Maliyet

X'in [güncel fiyat listesine](https://docs.x.com/x-api/getting-started/pricing) göre URL içeren gönderi oluşturma isteği $0,20'dır. Günde bir gönderi yaklaşık $6/30 gün eder. Görsel yükleme, OpenAI metin/görsel kullanımı, barındırma ve vergiler ayrıca değerlendirilmeli. X Developer Console içinde harcama limiti belirleyin.

Panelde **Bakiye ve harcama** bölümü bulunur. Gerçek USD bakiyesi mevcut X OAuth bağlantısıyla [`GET /2/usage/credits`](https://docs.x.com/x-api/usage/get-usage-credits) üzerinden alınır; ek anahtar gerekmez. Panel açıkken 5 dakikada bir kontrol edilir; “Yenile” elle kontrol eder (en fazla 30 saniyede bir). Son başarılı değer SQLite'ta saklanır. API erişilemezse eski bakiye tarih ve hata mesajıyla gösterilir. Bakiye geliştirici hesabı genelindedir, yalnızca bu projeye ayrılmış bir bütçe değildir.

X'in kamuya açık Usage API'si günlük USD harcama dökümü sağlamadığı için bugünkü ve aylık **yayın maliyeti tahminidir**. İstanbul saatine göre bu panelden başarıyla yayınlanan tüm bağlantılı gönderiler sayılır ve güncel $0,20 birim fiyatla çarpılır. Görsel yükleme, hesap okuma, başarısız/belirsiz istekler ve OpenAI giderleri dahil değildir. Kesin harcamayı X Developer Console'da kontrol edin. Birim fiyat 30.09.2026'da doğrulandı; fiyat değiştiğinde `server/usage.mjs` içindeki fiyat ve kontrol tarihini güncelleyin.
