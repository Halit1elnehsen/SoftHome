# Arkadaşlarla aynı SoftHome'u kullanma

Herkesin hesabı ve şifresi kendisine aittir. Ortak olan sunucu ve katıldığınız evdir. Bir kişi harcama eklediğinde aynı evin diğer üyeleri de o harcamayı, fotoğrafını ve güncel bakiyelerini görür.

## Tek HTTPS sunucusu

Docker Compose bulunan, kalıcı diskli bir Linux sunucusu ve bu sunucunun IP adresine yönlendirilmiş bir alan adı gerekir. Sunucunun 80 ve 443 portları erişilebilir olmalıdır. E-posta doğrulaması için gerçek bir SMTP hizmeti gerekir.

Proje kökünden:

```bash
cp deploy/settings.example deploy/.env
# deploy/.env dosyasındaki alan adını ve SMTP değerlerini kendi değerlerinle doldur.
docker compose --env-file deploy/.env -f deploy/compose.yaml up -d --build
```

Caddy HTTPS sertifikasını otomatik alır. Uygulama yalnızca özel Docker ağında dinler. SQLite veritabanı, faturalar ve oturum anahtarları `app-data` adlı kalıcı Docker birimindedir. Konteyner güncellemelerinde bu birimi koru; `down -v` verileri siler. Veritabanını tutarlı biçimde yedeklemek için SQLite backup API kullan veya uygulama kapalıyken veri birimini yedekle.

Bu kurulum tek API örneği içindir. Mevcut sunucudaki bir veritabanını taşımak gerekiyorsa, sunucu kapalıyken `data/` dizinini anahtarlarıyla birlikte bu birime taşı; dosyalar konteynerdeki uygulama kullanıcısına (UID 1654) yazılabilir olmalı. Boş bir birimle başlamak eski sunucudaki hesapları taşımaz.

Başka bir ters proxy kullanıyorsan uygulamanın `ReverseProxy__KnownProxy` değerini o proxy'nin gerçek özel IP adresine ayarla. Proxy, gelen isteğin HTTPS bilgisini `X-Forwarded-Proto` ile iletmelidir.

## Aynı eve katılın

1. Herkes aynı `https://SIZIN-ALAN-ADINIZ` adresini açıp kendi hesabını oluşturur ve e-postasını doğrular.
2. Ev sahibi giriş yapıp **Ev arkadaşları** ekranında katılım kodu oluşturur.
3. Diğerleri kendi hesaplarıyla giriş yapıp bu kodla aynı eve katılır.
4. Harcama ekleyerek ikinci cihazda görünmesini ve bildirim zilini kontrol edin.

Herkes kendi evini oluşturup orada kalırsa veriler paylaşılmaz. Katılım kodu yalnızca davet ettiğiniz kişilere verilmelidir. Önceden harcamaları veya başka üyeleri olan bir evden doğrudan geçiş mevcut verileri korumak için engellenir.

## Güncellemeler ve bildirimler

- Uygulama, giriş yapılmış hesap için sunucuyu **3 saniyede bir** kontrol eder. Yeni değişiklikler sayfayı elle yenilemeden yüklenir.
- Bir ev arkadaşı harcama eklediğinde, fatura değiştirdiğinde, ödeme kaydettiğinde, bütçeyi/ev adını değiştirdiğinde veya eve katıldığında bir etkinlik kaydı oluşur. Kayıt ilgili değişiklikle aynı veritabanı işleminde saklanır.
- Kendi yaptığın işlemler zilinde okunmamış bildirim oluşturmaz. Diğer üyelerin işlemleri mesaj ve okunmamış işareti olarak görünür.
- Zil son 50 bildirimi gösterir. Zili açınca o ana kadarki bildirimler yalnızca o hesap için okundu sayılır; aynı hesabın başka cihazında da bu durum korunur.
- Uygulama kapalıyken oluşan bildirimler veritabanında kalır ve tekrar girişte görünür. **Uygulama tamamen kapalıyken telefonun bildirim çubuğuna push gönderimi bu sürümde yoktur.** Bunun için ayrıca Android FCM veya Web Push kurulumu gerekir.
- Bağlantı kesilirse ekranda durum görünür ve uygulama otomatik yeniden dener. Açık form ve onay pencereleri korunur; pencereyi kapattıktan veya alanı düzenlemeyi bitirdikten sonra güncel veriler yüklenir.
- Başka evlerin verileri ve bildirimleri paylaşılmaz.

## Mevcut veritabanını güncelleme

Önce yedek al. SQLite için bildirim ve şifre kurtarma tabloları uygulamanın ilk açılışında eski kayıtlar korunarak eklenir. PostgreSQL için `RealAccountsAndReceipts`, `HouseholdNotifications`, `AccountRecovery` ve `SupabaseServerOnlyTables` geçişlerini uygula:

```bash
# Sunucudaki gerçek PostgreSQL bağlantısını ortam değişkeniyle ayarla.
export Database__Provider=Postgres
export SUPABASE_CONNECTION='YOUR_POSTGRES_CONNECTION_STRING'
dotnet tool restore --tool-manifest dotnet-tools.json
dotnet ef database update --project backend/SoftHome.Api/SoftHome.Api.csproj
```

Önceki harcamalara geriye dönük bildirim oluşturulmaz; yeni işlemler bildirim üretir.

Supabase'te yalnızca `InitialCreate` geçişi uygulanmış bir veritabanını yükseltmek için [hazır SQL betiği](../deploy/sql/upgrade-existing-supabase.sql) de kullanılabilir. Betik yeni alanları, evleri, ödemeleri, bildirimleri ve şifre kurtarmayı ekler; EF geçiş geçmişini günceller. Tek bir işlem içinde çalışır, mevcut kullanıcı/harcama/paylaşım kayıtlarının sayıları değişirse geri alınır. Aynı betik tekrar çalıştırılabilir. Eski kullanıcılar otomatik olarak doğrulanmış hesap veya ev üyesi sayılmaz; kayıtların gerçek hesaplara bağlanması ayrıca yönetilmelidir.

`SupabaseServerOnlyTables`, uygulamanın kullandığı ve eski sürümden kalan tabloların tamamında RLS'yi etkinleştirir. Kısıtlayıcı `softhome_server_only` politikası, Supabase `anon`/`authenticated` istemcilerinin bu tablolara doğrudan erişimini kapatır. Bu sürüm hesap ve ev yetkilendirmesini ASP.NET API'de yapar; Supabase Auth JWT'si veya publishable key tek başına bu tablolara erişim vermez. Sunucudaki Postgres bağlantısı tablo sahibi ya da `BYPASSRLS` yetkili güvenilir sunucu rolünü kullanmalıdır. Bu bağlantı bilgileri frontend'e veya APK'ya eklenmez. Geçiş geri alınsa bile RLS koruması otomatik kaldırılmaz.

Geçişin örnek eski kayıtları koruması, tekrar uygulanabilirliği ve istemci erişim kısıtları yerel Postgres motoruyla test edilir:

```bash
npm ci --prefix tests/postgres
npm test --prefix tests/postgres
```

## Android

Bütün telefonlara aynı sunucu adresiyle derlenmiş paketi yükle:

```bash
cd android
bash ./gradlew :app:assembleDebug -PsoftHomeUrl=https://SIZIN-ALAN-ADINIZ
```

Android kabuğu sunucudaki güncel arayüzü açar. Yerel `assets` kopyası da kaynakla aynı tutulur. Bu değişiklikler tek başına GitHub Pages gibi yalnızca statik dosya sunan hizmetlerde çalışmaz; .NET API'nin de çalışması gerekir.
