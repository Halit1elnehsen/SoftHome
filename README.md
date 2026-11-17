# SoftHome

**Ortak evin giderleri, herkes için anlaşılır.**

Ev arkadaşları için özel Android uygulaması. Herkes kendi e-posta hesabıyla giriş yapar; aynı ev koduyla katılan kişiler ortak harcamaları, fatura fotoğraflarını ve bakiyeleri görür.

[![SoftHome giriş ekranı](docs/images/login-hd.jpg)](docs/images/login-hd.jpg)

## Android sürümü

- E-postaya gelen **6 haneli kodla** kayıt doğrulaması; şifreyle giriş ve kodla şifre kurtarma.
- **Ev katılım koduyla** ayrı hesapları aynı eve bağlama.
- Harcama, kategori, bütçe ve fatura fotoğrafı; kuruş kaybetmeden eşit paylaşım.
- İstek kimliğiyle tekrarlı kaydı önleyen ödeme takibi. Gerçek para transferi yapmaz.
- Uygulama açıkken **anlık ortak güncelleme**, kalıcı bildirim geçmişi ve kişiye özel okunma durumu.
- Telefona uygun adaçayı/yeşil arayüz, açık/koyu tema ve arama.

Arayüz APK'nın içindedir. Ortak hizmet Supabase'dir; ayrı ücretli sunucu veya web sitesi yayını gerekmez. Free plan ve Gmail kullanım sınırları geçerlidir. Uygulama kapalıyken sistem push bildirimi bu sürümde yoktur; açıldığında okunmamış haberler yüklenir.

**Kurulum, e-posta şablonları, güvenlik ve APK derlemesi:** [Özel Android kılavuzu](docs/private-android.md).

```bash
npm ci --prefix frontend
npm run build --prefix frontend
cd android
./gradlew :app:assembleDebug
```

Java 17 ve Android SDK 34 gerekir. Paket `android/app/build/outputs/apk/debug/app-debug.apk` konumunda oluşur. `softHomeUrl` verilmezse paketli Supabase sürümü açılır. SMTP parolası ve Supabase sunucu anahtarı APK'ya konmaz.

## Testler

```bash
npm ci --prefix tests/frontend
npm test --prefix tests/frontend
npm ci --prefix tests/postgres
npm test --prefix tests/postgres
dotnet test backend/SoftHome.Api.Tests/SoftHome.Api.Tests.csproj
```

Sentetik verilerle hesap akışları, ortak ev güncellemesi, evler arası izolasyon, ödeme tekrarı ve mevcut kayıtları koruyan geçişler doğrulanır. Gerçek Gmail kod teslimatı ilk cihaz kaydında ayrıca denenmelidir.

## Alternatif .NET sunucusu

Depodaki .NET 10 API önceki sunucu sürümünü desteklemeye devam eder. Bu yolu kullanmak istersen `frontend/js/backend-config.js` içindeki modu `server` yapıp arayüz paketini yeniden oluştur. API ve arayüz aynı HTTPS sunucusunda sunulur; Android derlemesine `-PsoftHomeUrl=https://sunucu-adresin` verilir. Bu sürümün çerez/CSRF, bağlantıyla doğrulama ve SMTP ayarları için [sunucu kılavuzunu](docs/shared-server.md) kullan. Supabase Auth hesapları ile eski .NET hesap oturumları ayrı sistemlerdir.
