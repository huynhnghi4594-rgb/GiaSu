const express = require('express');
const router = express.Router();
const { supabaseAdmin } = require('../config/supabase');
const { authenticate, requireRole } = require('../middleware/auth');

// =====================================================
// Gói subscription
// =====================================================
const PLANS = {
  free: {
    name: 'Miễn phí',
    price: 0,
    monthly_student_limit: 3,   // Freemium: tối đa 3 học viên/tháng
    featured_in_search: false,
    description: 'Tối đa 3 học viên/tháng, không nổi bật trong tìm kiếm'
  },
  premium: {
    name: 'Premium',
    price: 199000, // 199k/tháng
    monthly_student_limit: null,  // Không giới hạn
    featured_in_search: true,
    description: 'Không giới hạn học viên, nổi bật đầu danh sách tìm kiếm'
  }
};

const BOOKING_FEE = 10000; // 10k/lần đặt lịch

// =====================================================
// GET /api/subscriptions/plans — Lấy danh sách gói
// =====================================================
router.get('/plans', async (req, res) => {
  res.json({ plans: PLANS, booking_fee: BOOKING_FEE });
});

// =====================================================
// GET /api/subscriptions/my — Lấy gói hiện tại của gia sư
// =====================================================
router.get('/my', authenticate, requireRole('tutor'), async (req, res) => {
  try {
    const { data: user, error } = await supabaseAdmin
      .from('users')
      .select('subscription_plan, subscription_started_at, subscription_expires_at')
      .eq('id', req.user.id)
      .single();

    if (error) throw error;

    const plan = user.subscription_plan || 'free';
    const now = new Date();
    const isExpired = user.subscription_expires_at && new Date(user.subscription_expires_at) < now;

    // Nếu premium đã hết hạn, tự động hạ về free
    if (plan === 'premium' && isExpired) {
      await supabaseAdmin
        .from('users')
        .update({ subscription_plan: 'free', subscription_expires_at: null })
        .eq('id', req.user.id);

      return res.json({
        plan: 'free',
        is_expired: true,
        message: 'Gói Premium đã hết hạn, đã chuyển về Free',
        plan_info: PLANS['free']
      });
    }

    // Đếm số học viên tháng này (bookings accepted)
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const { data: profile } = await supabaseAdmin
      .from('tutor_profiles').select('id').eq('user_id', req.user.id).single();

    let monthlyStudentCount = 0;
    if (profile) {
      const { count } = await supabaseAdmin
        .from('bookings')
        .select('id', { count: 'exact', head: true })
        .eq('tutor_id', profile.id)
        .eq('status', 'accepted')
        .gte('created_at', startOfMonth);
      monthlyStudentCount = count || 0;
    }

    const planInfo = PLANS[plan] || PLANS['free'];
    const remainingSlots = planInfo.monthly_student_limit !== null
      ? Math.max(0, planInfo.monthly_student_limit - monthlyStudentCount)
      : null;

    res.json({
      plan,
      subscription_started_at: user.subscription_started_at,
      subscription_expires_at: user.subscription_expires_at,
      monthly_student_count: monthlyStudentCount,
      remaining_slots: remainingSlots,
      plan_info: planInfo
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Lỗi khi lấy thông tin gói' });
  }
});

// =====================================================
// POST /api/subscriptions/upgrade — Nâng cấp lên Premium
// Body: { months } — số tháng muốn đăng ký (1, 3, 6, 12)
// Thanh toán từ ví
// =====================================================
router.post('/upgrade', authenticate, requireRole('tutor'), async (req, res) => {
  try {
    const { months = 1 } = req.body;
    const validMonths = [1, 3, 6, 12];
    if (!validMonths.includes(parseInt(months))) {
      return res.status(400).json({ error: 'Số tháng không hợp lệ (1, 3, 6, 12)' });
    }

    const numMonths = parseInt(months);
    const totalCost = PLANS.premium.price * numMonths;

    // Kiểm tra ví gia sư
    const { data: wallet, error: wErr } = await supabaseAdmin
      .from('wallets').select('id, balance').eq('user_id', req.user.id).single();

    if (wErr && wErr.code === 'PGRST116') {
      return res.status(400).json({ error: 'Bạn chưa có ví. Vui lòng nạp tiền trước.' });
    }
    if (wErr) throw wErr;
    if (wallet.balance < totalCost) {
      return res.status(400).json({
        error: `Số dư không đủ. Cần ${totalCost.toLocaleString()}đ, hiện có ${wallet.balance.toLocaleString()}đ`
      });
    }

    // Tính thời hạn mới
    const { data: currentUser } = await supabaseAdmin
      .from('users')
      .select('subscription_plan, subscription_expires_at')
      .eq('id', req.user.id)
      .single();

    const now = new Date();
    let newExpiry;
    if (currentUser.subscription_plan === 'premium' && currentUser.subscription_expires_at) {
      const currentExpiry = new Date(currentUser.subscription_expires_at);
      if (currentExpiry > now) {
        // Gia hạn từ ngày hết hạn hiện tại
        newExpiry = new Date(currentExpiry);
      } else {
        newExpiry = new Date(now);
      }
    } else {
      newExpiry = new Date(now);
    }
    newExpiry.setMonth(newExpiry.getMonth() + numMonths);

    // Trừ tiền ví
    await supabaseAdmin
      .from('wallets')
      .update({ balance: wallet.balance - totalCost })
      .eq('user_id', req.user.id);

    // Ghi transaction
    await supabaseAdmin.from('transactions').insert({
      wallet_id: wallet.id,
      type: 'subscription',
      amount: totalCost,
      description: `Đăng ký gói Premium ${numMonths} tháng`,
      status: 'completed'
    });

    // Cập nhật subscription
    await supabaseAdmin.from('users').update({
      subscription_plan: 'premium',
      subscription_started_at: now.toISOString(),
      subscription_expires_at: newExpiry.toISOString()
    }).eq('id', req.user.id);

    // Cộng vào platform_wallet
    const { data: pw } = await supabaseAdmin.from('platform_wallet').select('*').limit(1).single();
    if (pw) {
      await supabaseAdmin.from('platform_wallet').update({
        balance: (pw.balance || 0) + totalCost,
        total_subscription_earned: (pw.total_subscription_earned || 0) + totalCost,
        updated_at: now.toISOString()
      }).eq('id', pw.id);
    }

    res.json({
      message: `Đã nâng cấp lên Premium ${numMonths} tháng thành công!`,
      plan: 'premium',
      expires_at: newExpiry.toISOString(),
      cost: totalCost,
      new_wallet_balance: wallet.balance - totalCost
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Lỗi khi nâng cấp gói' });
  }
});

// =====================================================
// POST /api/subscriptions/downgrade — Hạ về Free (không hoàn tiền)
// =====================================================
router.post('/downgrade', authenticate, requireRole('tutor'), async (req, res) => {
  try {
    await supabaseAdmin.from('users').update({
      subscription_plan: 'free',
      subscription_expires_at: null
    }).eq('id', req.user.id);

    res.json({ message: 'Đã chuyển về gói Free. Thay đổi có hiệu lực ngay.', plan: 'free' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Lỗi khi hạ gói' });
  }
});

// =====================================================
// MIDDLEWARE export để dùng trong bookings.js
// Kiểm tra gia sư freemium có đủ slot không
// =====================================================
async function checkFreemiumLimit(tutorUserId) {
  const { data: user } = await supabaseAdmin
    .from('users')
    .select('subscription_plan')
    .eq('id', tutorUserId)
    .single();

  if (!user || user.subscription_plan === 'premium') return { allowed: true };

  // Free: kiểm tra số học viên tháng này
  const { data: profile } = await supabaseAdmin
    .from('tutor_profiles').select('id').eq('user_id', tutorUserId).single();

  if (!profile) return { allowed: true };

  const startOfMonth = new Date();
  startOfMonth.setDate(1); startOfMonth.setHours(0, 0, 0, 0);

  const { count } = await supabaseAdmin
    .from('bookings')
    .select('id', { count: 'exact', head: true })
    .eq('tutor_id', profile.id)
    .eq('status', 'accepted')
    .gte('created_at', startOfMonth.toISOString());

  if ((count || 0) >= 3) {
    return {
      allowed: false,
      message: 'Gia sư này đã đạt giới hạn 3 học viên/tháng của gói Free. Vui lòng chọn gia sư khác hoặc đợi tháng sau.'
    };
  }
  return { allowed: true };
}

module.exports = router;
module.exports.checkFreemiumLimit = checkFreemiumLimit;
module.exports.BOOKING_FEE = BOOKING_FEE;
module.exports.PLANS = PLANS;
