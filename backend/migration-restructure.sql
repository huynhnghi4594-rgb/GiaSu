-- =====================================================
-- MIGRATION: Tái cấu trúc TutorMatch
-- Chạy trên Supabase SQL Editor
-- =====================================================

-- 1. XÁC THỰC GIA SƯ (Verification)
-- =====================================================
ALTER TABLE users ADD COLUMN IF NOT EXISTS verification_status TEXT DEFAULT 'pending' 
  CHECK (verification_status IN ('pending', 'verified', 'rejected'));
ALTER TABLE users ADD COLUMN IF NOT EXISTS id_card_number TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS id_card_name TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS qualification_info TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS verification_note TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ;

-- Set existing seed tutors as verified
UPDATE users SET verification_status = 'verified', verified_at = NOW()
WHERE role = 'tutor' AND email LIKE '%@test.com';

-- Set students as verified by default (students don't need verification)
UPDATE users SET verification_status = 'verified' WHERE role = 'student';

-- 2. VÍ ĐIỆN TỬ (Wallets)
-- =====================================================
CREATE TABLE IF NOT EXISTS wallets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  balance INTEGER DEFAULT 0 CHECK (balance >= 0),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. LỊCH SỬ GIAO DỊCH (Transactions)
-- =====================================================
CREATE TABLE IF NOT EXISTS transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_id UUID REFERENCES wallets(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('deposit', 'withdraw', 'escrow_hold', 'escrow_release', 'platform_fee', 'refund')),
  amount INTEGER NOT NULL CHECK (amount > 0),
  description TEXT,
  related_booking_id UUID,
  status TEXT DEFAULT 'completed' CHECK (status IN ('pending', 'completed', 'failed')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. CẬP NHẬT BOOKINGS cho thanh toán
-- =====================================================
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS payment_status TEXT DEFAULT 'unpaid' 
  CHECK (payment_status IN ('unpaid', 'escrow_held', 'released', 'refunded'));
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS total_amount INTEGER DEFAULT 0;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS platform_fee INTEGER DEFAULT 0;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS tutor_payout INTEGER DEFAULT 0;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;

-- 5. TẠO VÍ cho users hiện tại
-- =====================================================
INSERT INTO wallets (user_id, balance)
SELECT id, 0 FROM users
WHERE id NOT IN (SELECT user_id FROM wallets WHERE user_id IS NOT NULL)
ON CONFLICT (user_id) DO NOTHING;

-- 6. RLS cho bảng mới
-- =====================================================
ALTER TABLE wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read wallets" ON wallets FOR SELECT USING (true);
CREATE POLICY "Public insert wallets" ON wallets FOR INSERT WITH CHECK (true);
CREATE POLICY "Public update wallets" ON wallets FOR UPDATE USING (true);

CREATE POLICY "Public read transactions" ON transactions FOR SELECT USING (true);
CREATE POLICY "Public insert transactions" ON transactions FOR INSERT WITH CHECK (true);
CREATE POLICY "Public update transactions" ON transactions FOR UPDATE USING (true);

-- 7. INDEX
-- =====================================================
CREATE INDEX IF NOT EXISTS idx_wallets_user_id ON wallets(user_id);
CREATE INDEX IF NOT EXISTS idx_transactions_wallet_id ON transactions(wallet_id);
CREATE INDEX IF NOT EXISTS idx_transactions_booking_id ON transactions(related_booking_id);
CREATE INDEX IF NOT EXISTS idx_users_verification ON users(verification_status);

SELECT 'Migration hoàn tất!' as status;
