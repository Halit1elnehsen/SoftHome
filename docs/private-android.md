# Özel Android sürümü: Supabase

Bu sürüm yalnızca ev arkadaşlarının kullanması için hazırlanmıştır. APK, arayüzü kendi içinde taşır; aynı Supabase projesinin Auth, Database, Realtime, Storage ve Edge Functions hizmetlerini kullanır. Ayrı .NET sunucusu, web sitesi yayını veya mağaza hesabı gerekmez. Supabase Free ve Gmail'in kullanım sınırları geçerlidir; bu değişiklik ücretli plan açmaz.

## İlk kurulum

1. Supabase → Authentication → Email içinde **Confirm email** açık kalmalıdır. Otomatik doğrulamayı açmayın.
2. Authentication → Email / SMTP: Gmail SMTP sunucusu `smtp.gmail.com`, port `587`, kullanıcı ve gönderen Gmail adresiniz, parola **Google uygulama şifresi**. Normal Gmail şifrenizi kullanmayın. Uygulama şifresi yalnızca Supabase ayarlarına girilir.
3. Authentication → Email Templates → **Confirm signup** konusu `SoftHome doğrulama kodun`; HTML gövdesi:

```html
<h2>SoftHome e-posta doğrulaması</h2>
<p>Uygulamaya dönüp aşağıdaki 6 haneli kodu gir:</p>
<p style="font-size:32px;font-weight:bold;letter-spacing:6px">{{ .Token }}</p>
<p>Bu işlemi sen başlatmadıysan bu e-postayı yok sayabilirsin.</p>
```

4. Aynı yerde **Reset password** şablonunu da kod gösterecek şekilde kaydedin. Konu `SoftHome şifre yenileme kodun`:

```html
<h2>SoftHome şifre yenileme</h2>
<p>Uygulamadaki şifre yenileme ekranına aşağıdaki kodu yaz:</p>
<p style="font-size:32px;font-weight:bold;letter-spacing:6px">{{ .Token }}</p>
<p>Şifreni yenilemek istemediysen bu e-postayı yok say.</p>
```

Supabase kod uzunluğu 6 olmalıdır. Kodun geçerlilik süresi Supabase Auth ayarlarından yönetilir. E-posta şablonları Dashboard ayarlarıdır; Git'e kod göndermek bu ayarları değiştirmez.

## Aynı eve katılma

Herkes kendi e-postası ve şifresiyle kayıt olur. E-posta kodu doğrulanmadan ortak verilere erişilemez. İlk kullanıcı **Ayarlar → Katılım kodu oluştur** ile ev kodu oluşturur. Arkadaşları kendi hesaplarında **Ayarlar → Eve katıl** alanına bu kodu yazar. Kod 7 gün geçerlidir; yeni kod eskisini geçersiz kılar. E-posta doğrulama kodu ve ev katılım kodu farklıdır.

Kendi evinde kayıt veya başka üye bulunan kişi doğrudan başka eve taşınamaz; kayıtlar yanlışlıkla başka eve taşınmaz. Eski sahipsiz harcamalar yalnızca ödeyen ve bütün katılımcılar doğrulanmış olarak aynı eve katılınca o eve bağlanır.

## Veritabanı ve erişim

Bu depodaki `supabase/migrations/20261117173936_free_private_household.sql`, **mevcut SoftHome EF şemasına uygulanan ek geçiştir**. Boş projede tek başına kurulmaz. Önce `supabase/bootstrap/upgrade-existing-supabase.sql` ile mevcut uygulama şeması güncellenmelidir. Mevcut projedeki Supabase geçmişi:

- `20261117112947_upgrade_softhome_shared_accounts`: EF şeması ve tablo RLS koruması.
- `20261117173936_free_private_household`: doğrulanmış Auth hesapları, özel RPC işlemleri, özel fatura deposu ve eve göre Realtime yetkisi.

İlk geçişin kaynağı `supabase/bootstrap/upgrade-existing-supabase.sql` dosyasıdır. Bu depo tam bir `supabase db reset` başlangıç zinciri içermez; CLI ile yeni projeye toplu `db push` yapmadan mevcut geçiş geçmişini eşleyin. Canlı projenin geçmişini elle silmeyin.

`Users.AuthUserId`, Supabase Auth UUID'sini mevcut sayısal profil kimliğine eşler. Doğrulanmış e-posta sahibi, varsa eski profilini kullanır; başka bir kişinin e-postası kullanıcı bilgileriyle taklit edilemez. Eski .NET şifresi Auth'a aktarılmaz; ilk kullanımda aynı adresle kayıt ve e-posta doğrulaması gerekir.

Tablolara doğrudan istemci erişimi RLS ile kapalıdır. `public.softhome_*` RPC sarmalayıcıları SECURITY INVOKER kullanır. Özel şemadaki giriş noktaları doğrulanmış Auth kullanıcısını ve `auth.sessions` içindeki canlı oturumu kontrol eder, sonra kullanıcının evine sınırlar. Kullanıcının düzenleyebildiği metadata yetki kaynağı değildir. Ödeme kayıtları ev kilidi altında bakiye ve istek kimliğiyle doğrulanır.

Faturalar herkese açık değildir. `softhome-receipts` özel deposuna sadece Edge Function yazabilir. Function, Bearer token'ı `auth.getUser` ve canlı oturum kontrolü yapan RPC ile doğruladığından gateway `verify_jwt=false` kullanır; bu anonim erişim izni değildir. MIME imzası, 1 MB sınırı, ev üyeliği ve değiştirme yetkisi sunucuda denetlenir. Büyük fotoğraflar istemcide küçültülür. Okuma bağlantıları 5 dakika geçerlidir. Ağ hatasında kayıt sonucunun belirsiz olduğu durumlarda, kayıt tarafından kullanılabilecek fotoğraf silinmez.

Function kaynağı `supabase/functions/softhome-receipts/index.ts` dosyasındadır. Sunucu anahtarı otomatik Supabase ortam değişkenlerinden okunur. SMTP, service-role veya secret anahtarlar APK'ya ya da Git'e konmaz. `frontend/js/backend-config.js` yalnızca istemciler için tasarlanmış **publishable** anahtarı içerir.

## Bildirim kapsamı

Aynı evin özel Realtime kanalından değişiklik haberi alınır; veri yetkili RPC'den tekrar yüklenir. Bağlantı kaybı için 60 saniyelik yedek kontrol vardır. Açık formdaki taslaklar korunur. Bildirim geçmişi ve okunma durumu veritabanındadır.

Bu sürümde **uygulama kapalıyken Android bildirim çubuğuna push bildirimi gelmez**. Uygulama tekrar açıldığında değişiklikler ve okunmamış haberler yüklenir. Uygulama açıkken otomatik güncelleme ve uygulama içi bildirim çalışır.

## Derleme ve doğrulama

```bash
npm ci --prefix frontend
npm run build --prefix frontend
npm ci --prefix tests/frontend
npm test --prefix tests/frontend
npm ci --prefix tests/postgres
npm test --prefix tests/postgres
cd android
./gradlew :app:assembleDebug
```

Java 17 ve Android SDK 34 gerekir. Varsayılan APK, HTTPS WebViewAssetLoader adresinden paketli arayüzü açar. Açık HTTP ve dosya erişimi kapalıdır. Oturumun başka bir telefona yedekle taşınmaması için Android backup kapalıdır. Geliştirme APK'sı debug imzalıdır; dağıtım Release'i özel keystore gerektirir. [İmza ve yedek kılavuzuna](android-release.md) bak. Mağazaya yayın yapılmaz.

Otomatik testler sentetik hesaplarla yanlış kodu, kayıt/şifre kurtarma ekranlarını, ev izolasyonunu, kuruş paylaşımını, tekrar ödeme kaydını, bildirim okunma durumunu ve iptal edilmiş oturumu kapsar. Gerçek Gmail teslimatı ve gerçek telefonda ilk kayıt, kurulmuş APK ile ayrıca denenmelidir; testler bu teslimatın yapıldığını iddia etmez.
