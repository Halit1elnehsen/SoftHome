-- ========================================================
-- SoftHome - Ortak Ev Gideri ve Bütçe Takip Veritabanı Şeması
-- Veritabanı Motoru: PostgreSQL (14+)
-- ========================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. KULLANICILAR TABLOSU (users)
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    full_name VARCHAR(100) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    phone VARCHAR(20),
    avatar_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 2. EVLER / HANELER TABLOSU (houses)
CREATE TABLE houses (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) NOT NULL,
    invite_code VARCHAR(20) UNIQUE NOT NULL,
    currency VARCHAR(10) DEFAULT 'TRY',
    created_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 3. EV ÜYELİKLERİ TABLOSU (house_members)
CREATE TABLE house_members (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    house_id UUID NOT NULL REFERENCES houses(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role VARCHAR(20) DEFAULT 'member' CHECK (role IN ('admin', 'member')),
    joined_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (house_id, user_id)
);

-- 4. KATEGORİLER TABLOSU (categories)
CREATE TABLE categories (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    house_id UUID REFERENCES houses(id) ON DELETE CASCADE, -- NULL ise sistem geneli varsayılan
    name VARCHAR(50) NOT NULL,
    icon VARCHAR(50),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 5. HARCAMALAR TABLOSU (expenses)
CREATE TABLE expenses (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    house_id UUID NOT NULL REFERENCES houses(id) ON DELETE CASCADE,
    payer_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    category_id UUID REFERENCES categories(id) ON DELETE SET NULL,
    title VARCHAR(150) NOT NULL,
    amount DECIMAL(12, 2) NOT NULL CHECK (amount > 0),
    receipt_url TEXT,
    note TEXT,
    expense_date DATE NOT NULL DEFAULT CURRENT_DATE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 6. BORÇ PAYLAŞIMLARI TABLOSU (expense_splits)
CREATE TABLE expense_splits (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    expense_id UUID NOT NULL REFERENCES expenses(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    share_amount DECIMAL(12, 2) NOT NULL CHECK (share_amount >= 0),
    is_settled BOOLEAN DEFAULT FALSE,
    settled_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (expense_id, user_id)
);

-- 7. BORÇ KAPATMA / HESAPLAŞMA TABLOSU (settlements)
CREATE TABLE settlements (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    house_id UUID NOT NULL REFERENCES houses(id) ON DELETE CASCADE,
    payer_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    receiver_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    amount DECIMAL(12, 2) NOT NULL CHECK (amount > 0),
    proof_url TEXT,
    settled_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    note VARCHAR(255)
);

-- İNDEKSLEME PERFORMANSI
CREATE INDEX idx_house_members_user ON house_members(user_id);
CREATE INDEX idx_expenses_house ON expenses(house_id);
CREATE INDEX idx_expenses_payer ON expenses(payer_id);
CREATE INDEX idx_expense_splits_user ON expense_splits(user_id);
CREATE INDEX idx_expense_splits_settled ON expense_splits(is_settled);
CREATE INDEX idx_settlements_house ON settlements(house_id);
