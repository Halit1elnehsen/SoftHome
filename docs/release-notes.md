SoftHome 1.4.0

- Kayıtlı oturum açılırken giriş/kayıt ekranı görünmez; geçici ağ hatası için yeniden deneme görünümü.
- Ad, doğrulanmış e-posta, ev ve rol bilgilerini gösteren profil; çıkış profil ayarlarında.
- Ev kurma/katılma seçimi e-posta doğrulamasından sonra yapılır. Katılan kişiden ev adı istenmez.
- Ev adı ve bütçe yalnızca ev sahibinin profil ayarlarında düzenlenir.
- Paylaşım ekranında doğrudan kimin kime ödeyeceği ve kişi kişi harcama listeleri.
- Yatay üç nokta göstergeli aşağı çekerek yenileme ve taslak koruması.
- Mevcut renklerle basılma derinliği olan düğmeler; küçük ekranlarda da görünür profil simgesi.
- Android üst/alt sistem çubukları açık/koyu görünümle eşleşir.

Mevcut evler ve kayıtlar korunur. Supabase profile_house_onboarding geçişi uygulanmalıdır. Aynı özel release anahtarı kullanılır; eski debug APK'dan ilk geçişte yeniden kurulum gerekebilir. Supabase kayıtları silinmez.

Tarayıcı, otomatik test ve Android derleme kontrolleri yapılır. Gerçek telefonda kamera, sistem çubukları ve gerçek Gmail ile şifre kurtarma ayrıca kontrol edilmelidir. Bildirimler uygulama açıkken gelir; kapalıyken sistem push bildirimi yoktur.
