SoftHome 1.3.0

- Fatura eklerken kamerayla çekme veya galeriden seçme seçenekleri.
- Kamera için çalışma zamanı izni, reddetme/iptal akışı ve özel FileProvider fotoğraf alanı.
- Modern Android geri hareketi desteği.
- Özel release imzası; eksik anahtarda debug imzasına düşmeden derleme hatası.
- Supabase etkin sistem olarak korunur; eski .NET sunucusu legacy/ altında arşivlenir.
- Kaynak deposundan APK ve .NET obj çıktıları kaldırıldı; test yolları düzeltildi.

İlk özel imzaya geçişte eski debug APK'sını kaldırmak gerekebilir. Supabase'deki kayıtlar korunur; tekrar giriş gerekir. Sonraki güncellemeler aynı özel anahtarla hazırlanmalıdır.

Fiziksel telefonda kamera ve gerçek Gmail ile şifre kurtarma kabul testi henüz tamamlanmış değildir. Adımlar: docs/android-release.md. Bildirimler uygulama açıkken gelir; uygulama kapalıyken sistem push bildirimi yoktur.
