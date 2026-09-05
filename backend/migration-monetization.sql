-- =====================================================
-- MIGRATION: 4 Monetization Models
-- Chạy trên Supabase SQL Editor
-- =====================================================

-- =====================================================
-- MODEL 1: COMMISSION FEE (10%)
-- booking_fee column on bookings (already has platform_fee)
-- Add booking_fee (flat fee) separate from commission
-- =====================================================
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS booking_fee INTEGER DEFAULT 0;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS duration_hours INTEGER DEFAULT 1;

-- =====================================================
-- MODEL 2 & 3: SUBSCRIPTION + FREEMIUM
-- subscription_plan: 'free' | 'premium'
-- subscription_expires_at: NULL = never expires for free
-- monthly_student_count: đếm số học viên trong tháng (freemium limit)
-- =====================================================
ALTER TABLE users ADD COLUMN IF NOT EXISTS subscription_plan TEXT DEFAULT 'free'
  CHECK (subscription_plan IN ('free', 'premium'));
ALTER TABLE users ADD COLUMN IF NOT EXISTS subscription_expires_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS subscription_started_at TIMESTAMPTZ;

-- Đếm số lượt booking accepted trong tháng hiện tại (dùng để enforce freemium limit)
-- Computed via query, không cần column riêng

-- =====================================================
-- PLATFORM WALLET (cho commission + booking_fee)
-- =====================================================
-- Tạo 1 row platform wallet đặc biệt với user_id = NULL
-- Dùng platform_id để track
CREATE TABLE IF NOT EXISTS platform_wallet (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  balance BIGINT DEFAULT 0,
  total_commission_earned BIGINT DEFAULT 0,
  total_booking_fees_earned BIGINT DEFAULT 0,
  total_subscription_earned BIGINT DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed 1 row nếu chưa có
INSERT INTO platform_wallet (balance) 
SELECT 0 WHERE NOT EXISTS (SELECT 1 FROM platform_wallet);

-- =====================================================
-- SUBSCRIPTION TRANSACTIONS
-- =====================================================
ALTER TABLE transactions DROP CONSTRAINT IF EXISTS transactions_type_check;
ALTER TABLE transactions ADD CONSTRAINT transactions_type_check
  CHECK (type IN ('deposit', 'withdraw', 'escrow_hold', 'escrow_release', 'platform_fee', 'refund', 'subscription', 'booking_fee'));

-- =====================================================
-- RLS cho platform_wallet
-- =====================================================
ALTER TABLE platform_wallet ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'platform_wallet' AND policyname = 'Public read platform_wallet'
  ) THEN
    CREATE POLICY "Public read platform_wallet" ON platform_wallet FOR SELECT USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'platform_wallet' AND policyname = 'Public update platform_wallet'
  ) THEN
    CREATE POLICY "Public update platform_wallet" ON platform_wallet FOR UPDATE USING (true);
  END IF;
END $$;

-- =====================================================
-- INDEX
-- =====================================================
CREATE INDEX IF NOT EXISTS idx_users_subscription ON users(subscription_plan);
CREATE INDEX IF NOT EXISTS idx_users_sub_expires ON users(subscription_expires_at);

-- =====================================================
-- Cập nhật tất cả tutors hiện tại về plan 'free'
-- =====================================================
UPDATE users SET subscription_plan = 'free' WHERE subscription_plan IS NULL;

SELECT 'Monetization migration hoàn tất!' as status;
