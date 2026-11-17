# Android imzası, yedek ve Release

Sürüm `1.3.0` (`versionCode=4`) özel bir RSA 3072 / PKCS12 anahtarıyla imzalanır. Release derlemesi gerekli ayarlar olmadan hata verir; debug imzasına düşmez.

## İmza anahtarını koruma

Anahtar ve parolalar Git deposunda tutulmaz. Özel yedek paketi şu üç dosyayı birlikte içerir:

- `softhome-release.keystore`
- `signing.json` (parolalar ve alias; gizlidir)
- `RECOVERY.txt`

Yedek özel çalışma alanında ve bulut masaüstündeki `SoftHome-imza-yedegi-OZEL.zip` içinde oluşturuldu. **Bu iki konum aynı bulut bilgisayarındadır; bağımsız yedek yerine geçmez.** ZIP'i kendi bilgisayarına indirip ayrıca özel Drive klasörüne veya USB'ye kaydet. GitHub'a, Release'e, herkese açık bir klasöre veya sohbete yükleme. GitHub Actions Secrets yalnızca ek şifreli kopyadır; sonradan indirilemediği için çevrimdışı yedeğin yerini tutmaz.

Eski `1.2.0` test APK'sı debug imzalıdır. Android farklı imzalı uygulamayı normal güncelleme olarak kabul etmez. Yeni özel anahtara ilk geçişte eski test APK'sını kaldırıp tekrar kurmak gerekebilir. Bu işlem yerel oturumu siler; Supabase'deki ortak hesap/ev/harcama kayıtlarını silmez. E-posta ve şifrenle tekrar giriş yapabilmelisin. Sonraki sürümler **aynı özel anahtarla** imzalanmalıdır.

## Yerel Release derlemesi

Java 17 ve Android SDK 34 gerekir. Korumalı yerel ortamında aşağıdaki değişkenleri ayarla; gerçek değerleri Git'e veya terminal geçmişine yazma. `signing.json` dosyasından yalnızca derleme sürecinin ortamına aktar:

- `SOFTHOME_KEYSTORE_PATH`: özel keystore'un tam yolu
- `SOFTHOME_KEYSTORE_PASSWORD`: depo parolası
- `SOFTHOME_KEY_ALIAS`: `softhome`
- `SOFTHOME_KEY_PASSWORD`: özel anahtar parolası

```bash
npm ci --prefix frontend
npm run build --prefix frontend
cd android
bash ./gradlew :app:assembleRelease :app:lintRelease
```

Çıktı: `android/app/build/outputs/apk/release/app-release.apk`. `apksigner verify --verbose --print-certs` ile imzayı doğrula. `assembleDebug` yalnızca geliştirme içindir; dağıtım güncellemelerinde kullanılmaz.

## GitHub Releases

APK Git kaynak ağacında tutulmaz. [Releases](https://github.com/Halit1elnehsen/SoftHome/releases) içindeki sürümden **Assets → SoftHome.apk** indir.

`.github/workflows/android-release.yml` manuel yayın işidir. Önce GitHub → Settings → Secrets and variables → Actions içinde şu dört **Repository secret** oluştur:

- `SOFTHOME_KEYSTORE_BASE64`: keystore dosyasının base64 karşılığı
- `SOFTHOME_KEYSTORE_PASSWORD`
- `SOFTHOME_KEY_ALIAS`
- `SOFTHOME_KEY_PASSWORD`

Yetkili bir `gh` oturumunda, özel yedeği açtığın klasörden bu dört değeri ekrana yazmadan kaydetmek için:

```bash
python android/scripts/configure-signing.py /OZEL/YEDEK/KLASORU --repo Halit1elnehsen/SoftHome
```

Bu işlem için GitHub bağlantısının Repository Secrets yazma yetkisi gerekir. Ardından **Actions → Signed Android release → Run workflow** seç, sürüm etiketini Android `versionName` ile eşleştir (`v1.3.0`). İş; testleri, Android lint'i ve imza doğrulamasını çalıştırır, APK'yı ve SHA-256 dosyasını Release'e yükler. Anahtarı job bitince runner'dan siler.

Yerelde hazır ve doğrulanmış bir APK da `gh release create ... SoftHome.apk SHA256SUMS.txt` ile yüklenebilir. Kullanılan GitHub bağlantısı `uploads.github.com` adresine yetkili dosya yüklemeyi desteklemelidir. Başarısız yüklemeyi tamamlanmış dağıtım gibi değerlendirme.

## Gerçek telefon kabul testi

Bu kontroller bağlı fiziksel Android telefonda yapılmalıdır; derleme veya tarayıcı testi onların yerine geçmez:

1. Temiz kurulum → kayıt → gerçek Gmail kodunu doğrula → giriş.
2. Harcama ekle → fatura seç → **Kamerayla çek** → izni reddet. İptal temiz kapanmalı; tekrar deneyip galeriden seçilebilmeli.
3. Tekrar **Kamerayla çek** → izin ver → fotoğraf çek → onayla → önizleme → harcamayı kaydet. Aynı evdeki ikinci hesapta fotoğrafı aç.
4. Kamera ekranını iptal et; uygulamaya dönünce yarım veya boş fotoğraf eklenmemeli.
5. Geri tuşu/geri hareketiyle sayfalarda gezin; başlangıç ekranından uygulamadan çık.
6. Çıkış → Şifremi unuttum → gerçek kod iste → yanlış kod reddedilmeli → doğru kod ve yeni şifre → giriş. Eski şifre ve eski oturum artık kabul edilmemeli.

Supabase **Reset password** şablonu `{{ .Token }}` içermelidir. Gmail günlük gönderim sınırları geçerlidir. Ev kullanımında takip edilebilir; daha büyük kullanım için SMTP hizmeti yeniden değerlendirilmelidir. Bu sürüm için ücretli hizmet açılmaz.

Bu sürümün açık sertifika SHA-256 izi: `03277fd74ecb192fedea8d347a3a8bfa9db5af2d5d1640dd722851321dcb25b2`. Bu parmak izi gizli anahtar değildir; yeni APK imzasını karşılaştırmak için kullanılır.
