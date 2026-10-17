# 🗄️ SoftHome - Veritabanı Mimarisi & Şema Dokümantasyonu

Veritabanı Motoru: **PostgreSQL** (ACID uyumlu, hassas finansal veri ve ilişkisel modelleme).

---

## 📌 Varlık-İlişki Modeli (Entity Overview)

```
[users] 1 ──── N [house_members] N ──── 1 [houses]
  │                                           │
  │ (ödeyen)                                  │
  ▼                                           ▼
[expenses] 1 ──── N [expense_splits] N ──── 1 [users] (borçlanan)
  │
  ▼
[categories]

[settlements] (Kullanıcılar arası doğrudan borç kapatma transferleri)
```

---

## 📋 Tablo Tanımları

### 1. `users` (Kullanıcılar)
| Kolon | Veri Tipi | Kısıtlama | Açıklama |
|---|---|---|---|
| `id` | UUID | PRIMARY KEY | Benzersiz kullanıcı kimliği |
| `full_name` | VARCHAR(100) | NOT NULL | Ad Soyad |
| `email` | VARCHAR(255) | UNIQUE, NOT NULL | Giriş e-postası |
| `password_hash` | VARCHAR(255) | NOT NULL | Şifrelenmiş parola (bcrypt/argon2) |
| `phone` | VARCHAR(20) | NULL | Telefon numarası |
| `avatar_url` | TEXT | NULL | Profil görseli bağlantısı |
| `created_at` | TIMESTAMPTZ | DEFAULT NOW() | Kayıt tarihi |

---

### 2. `houses` (Evler / Haneler)
| Kolon | Veri Tipi | Kısıtlama | Açıklama |
|---|---|---|---|
| `id` | UUID | PRIMARY KEY | Ev kimliği |
| `name` | VARCHAR(100) | NOT NULL | Ev adı (Örn: Güneş Apt. No:4) |
| `invite_code` | VARCHAR(20) | UNIQUE, NOT NULL | Ev arkadaşı davet kodu |
| `currency` | VARCHAR(10) | DEFAULT 'TRY' | Para birimi (TRY, USD, EUR) |
| `created_by` | UUID | FK -> users(id) | Evi oluşturan kullanıcı |
| `created_at` | TIMESTAMPTZ | DEFAULT NOW() | Oluşturulma tarihi |

---

### 3. `house_members` (Ev Arkadaşları / Üyelikler)
| Kolon | Veri Tipi | Kısıtlama | Açıklama |
|---|---|---|---|
| `id` | UUID | PRIMARY KEY | Kayıt kimliği |
| `house_id` | UUID | FK -> houses(id) | İlgili ev |
| `user_id` | UUID | FK -> users(id) | İlgili üye |
| `role` | VARCHAR(20) | admin / member | Ev içi rol |
| `joined_at` | TIMESTAMPTZ | DEFAULT NOW() | Katılma tarihi |

---

### 4. `categories` (Harcama Kategorileri)
| Kolon | Veri Tipi | Kısıtlama | Açıklama |
|---|---|---|---|
| `id` | UUID | PRIMARY KEY | Kategori kimliği |
| `house_id` | UUID | FK -> houses(id), NULL | Eve özel veya sistem geneli kategori |
| `name` | VARCHAR(50) | NOT NULL | Kategori adı (Market, Fatura, Kira vb.) |
| `icon` | VARCHAR(50) | NULL | Kategori ikonu |

---

### 5. `expenses` (Harcamalar)
| Kolon | Veri Tipi | Kısıtlama | Açıklama |
|---|---|---|---|
| `id` | UUID | PRIMARY KEY | Harcama kimliği |
| `house_id` | UUID | FK -> houses(id) | Harcamanın yapıldığı ev |
| `payer_id` | UUID | FK -> users(id) | Ücreti peşin ödeyen kişi |
| `category_id` | UUID | FK -> categories(id) | Harcama kategorisi |
| `title` | VARCHAR(150) | NOT NULL | Harcama başlığı |
| `amount` | DECIMAL(12, 2) | > 0 | Toplam ödenen tutar |
| `receipt_url` | TEXT | NULL | Fiş / Fatura görsel bağlantısı |
| `note` | TEXT | NULL | Açıklama / Not |
| `expense_date` | DATE | DEFAULT CURRENT_DATE | Harcama tarihi |

---

### 6. `expense_splits` (Borç Paylaşımları)
| Kolon | Veri Tipi | Kısıtlama | Açıklama |
|---|---|---|---|
| `id` | UUID | PRIMARY KEY | Bölüşüm kimliği |
| `expense_id` | UUID | FK -> expenses(id) | İlgili harcama |
| `user_id` | UUID | FK -> users(id) | Borçlanan ev arkadaşı |
| `share_amount` | DECIMAL(12, 2) | >= 0 | Bu kişinin payına düşen borç tutarı |
| `is_settled` | BOOLEAN | DEFAULT FALSE | Bu pay ödendi mi? |
| `settled_at` | TIMESTAMPTZ | NULL | Ödenme tarihi |

---

### 7. `settlements` (Hesaplaşmalar / Borç Kapatma)
| Kolon | Veri Tipi | Kısıtlama | Açıklama |
|---|---|---|---|
| `id` | UUID | PRIMARY KEY | Transfer kimliği |
| `house_id` | UUID | FK -> houses(id) | İlgili ev |
| `payer_id` | UUID | FK -> users(id) | Parayı gönderen (borçlu) |
| `receiver_id` | UUID | FK -> users(id) | Parayı alan (alacaklı) |
| `amount` | DECIMAL(12, 2) | > 0 | Transfer edilen tutar |
| `proof_url` | TEXT | NULL | Dekont / transfer kanıtı |
| `settled_at` | TIMESTAMPTZ | DEFAULT NOW() | İşlem zamanı |
