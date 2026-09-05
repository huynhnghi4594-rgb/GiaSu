const express = require('express');
const router = express.Router();
const { supabaseAdmin } = require('../config/supabase');
const { authenticate, requireRole } = require('../middleware/auth');
const bcrypt = require('bcryptjs');

// Helper: check if role is admin
function isSuperAdmin(req, res, next) {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Chỉ có Super Admin mới có quyền thực hiện hành động này' });
  }
  next();
}

// GET all users
router.get('/users', authenticate, isSuperAdmin, async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('users')
      .select('*')
      .order('created_at', { ascending: false });
      
    if (error) throw error;
    
    const mapped = data.map(u => {
      const copy = { ...u };
      if (copy.email === 'admin') {
        copy.role = 'admin';
      } else if (copy.email === 'accountant') {
        copy.role = 'accountant';
      }
      return copy;
    });
    
    res.json(mapped);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Lỗi lấy danh sách người dùng' });
  }
});

// POST create user
router.post('/users', authenticate, isSuperAdmin, async (req, res) => {
  try {
    const { name, email, password, role } = req.body;
    if (!name || !email || !password || !role) {
      return res.status(400).json({ error: 'Thiếu thông tin bắt buộc' });
    }
    if (!['student', 'tutor', 'accountant'].includes(role)) {
      return res.status(400).json({ error: 'Role không hợp lệ' });
    }
    
    let dbRole = role;
    let dbEmail = email.toLowerCase().trim();
    if (role === 'accountant') {
      dbRole = 'student';
      if (dbEmail !== 'accountant' && !dbEmail.startsWith('accountant_')) {
        dbEmail = 'accountant_' + dbEmail;
      }
    }
    
    const hashed = await bcrypt.hash(password, 10);
    
    const { data: user, error: userError } = await supabaseAdmin
      .from('users')
      .insert({
        name,
        email: dbEmail,
        password: hashed,
        role: dbRole
      })
      .select()
      .single();
      
    if (userError) {
      if (userError.message.includes('unique')) {
        return res.status(400).json({ error: 'Email đã tồn tại' });
      }
      throw userError;
    }
    
    // Nếu tạo tutor, tạo tutor_profile tương ứng
    if (role === 'tutor') {
      const { error: profileError } = await supabaseAdmin
        .from('tutor_profiles')
        .insert({
          user_id: user.id,
          bio: '',
          hourly_rate: null
        });
      if (profileError) throw profileError;
    }
    
    res.status(201).json(user);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Lỗi khi tạo người dùng mới' });
  }
});

// =====================================================
// ADMIN: Lấy danh sách gia sư chờ duyệt
// =====================================================
router.get('/pending-tutors', authenticate, isSuperAdmin, async (req, res) => {
  try {
    const { data: tutors, error } = await supabaseAdmin
      .from('users')
      .select(`
        id, name, email, created_at,
        id_card_number, id_card_name, qualification_info,
        verification_status, verification_note, verified_at,
        tutor_profiles (bio, hourly_rate)
      `)
      .eq('role', 'tutor')
      .eq('verification_status', 'pending')
      .order('created_at', { ascending: true });
    
    if (error) throw error;
    
    res.json(tutors || []);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Lỗi khi lấy danh sách gia sư chờ duyệt' });
  }
});

// =====================================================
// ADMIN: Duyệt/từ chối gia sư
// =====================================================
router.put('/verify-tutor/:id', authenticate, isSuperAdmin, async (req, res) => {
  try {
    const tutorId = req.params.id;
    const { action, verification_note } = req.body;
    
    if (!['verify', 'reject'].includes(action)) {
      return res.status(400).json({ error: 'Action phải là "verify" hoặc "reject"' });
    }
    
    const verification_status = action === 'verify' ? 'verified' : 'rejected';
    const verified_at = action === 'verify' ? new Date().toISOString() : null;
    
    const { data: tutor, error } = await supabaseAdmin
      .from('users')
      .update({
        verification_status,
        verification_note: verification_note || '',
        verified_at
      })
      .eq('id', tutorId)
      .eq('role', 'tutor')
      .select()
      .single();
    
    if (error) throw error;
    
    res.json({ 
      message: action === 'verify' ? 'Đã duyệt gia sư' : 'Đã từ chối gia sư',
      tutor 
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Lỗi khi xử lý yêu cầu duyệt' });
  }
});

// =====================================================
// ADMIN: PUT update user info
// =====================================================
router.put('/users/:id', authenticate, isSuperAdmin, async (req, res) => {
  try {
    const { name, email, role } = req.body;
    if (!['student', 'tutor', 'accountant'].includes(role)) {
      return res.status(400).json({ error: 'Role không hợp lệ' });
    }

    let dbRole = role;
    let dbEmail = email.toLowerCase().trim();
    if (role === 'accountant') {
      dbRole = 'student';
      if (dbEmail !== 'accountant' && !dbEmail.startsWith('accountant_')) {
        dbEmail = 'accountant_' + dbEmail;
      }
    }

    // Lấy user cũ trước
    const { data: oldUser } = await supabaseAdmin
      .from('users')
      .select('role')
      .eq('id', req.params.id)
      .single();
      
    const { data: user, error } = await supabaseAdmin
      .from('users')
      .update({ name, email: dbEmail, role: dbRole })
      .eq('id', req.params.id)
      .select()
      .single();
      
    if (error) throw error;
    
    // Nếu đổi role sang tutor mà chưa có profile, tạo profile
    if (role === 'tutor' && oldUser?.role !== 'tutor') {
      const { data: profile } = await supabaseAdmin
        .from('tutor_profiles')
        .select('id')
        .eq('user_id', req.params.id)
        .maybeSingle();
      if (!profile) {
        await supabaseAdmin
          .from('tutor_profiles')
          .insert({ user_id: req.params.id, bio: '', hourly_rate: null });
      }
    }
    
    res.json(user);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Lỗi cập nhật thông tin người dùng' });
  }
});

// DELETE user
router.delete('/users/:id', authenticate, isSuperAdmin, async (req, res) => {
  try {
    const { data: oldUser } = await supabaseAdmin
      .from('users')
      .select('id, role, email')
      .eq('id', req.params.id)
      .single();

    if (!oldUser) {
      return res.status(404).json({ error: 'Không tìm thấy người dùng' });
    }

    // Không cho phép xóa tài khoản admin chính
    if (oldUser.email === 'admin') {
      return res.status(403).json({ error: 'Không thể xóa tài khoản admin chính' });
    }

    if (oldUser.role === 'tutor') {
      // Xóa bookings, schedules, tutor_profiles liên kết
      await supabaseAdmin.from('bookings').delete().eq('tutor_id', req.params.id);
      await supabaseAdmin.from('schedules').delete().eq('tutor_id', req.params.id);
      await supabaseAdmin.from('tutor_profiles').delete().eq('user_id', req.params.id);
    }

    // Accountant được lưu với role='student' và email bắt đầu bằng 'accountant_'
    // Không cần xử lý cascade đặc biệt, chỉ xóa user là đủ
    
    const { error } = await supabaseAdmin
      .from('users')
      .delete()
      .eq('id', req.params.id);
      
    if (error) throw error;
    res.json({ message: 'Xóa tài khoản thành công!' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Lỗi khi xóa người dùng' });
  }
});

// GET all bookings
router.get('/bookings', authenticate, isSuperAdmin, async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('bookings')
      .select(`
        *,
        student:users!bookings_student_id_fkey (
          name
        ),
        tutor_profiles!inner (
          users!inner (
            name
          )
        ),
        schedules!inner (
          day_of_week,
          start_time,
          end_time
        )
      `)
      .order('created_at', { ascending: false });
      
    if (error) throw error;
    
    const formatted = data.map(b => ({
      id: b.id,
      subject: b.subject,
      message: b.message,
      status: b.status,
      created_at: b.created_at,
      student_name: b.student?.name || 'Học sinh',
      tutor_name: b.tutor_profiles?.users?.name || 'Gia sư',
      day_of_week: b.schedules?.day_of_week,
      start_time: b.schedules?.start_time,
      end_time: b.schedules?.end_time
    }));
    
    res.json(formatted);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Lỗi lấy danh sách booking' });
  }
});

module.exports = router;

// =====================================================
// ADMIN: Giải ngân escrow — trả tiền thật cho gia sư + platform
// POST /api/admin/escrow-release
// Body: { booking_id }
// =====================================================
router.post('/escrow-release', authenticate, isSuperAdmin, async (req, res) => {
  const { booking_id } = req.body;
  if (!booking_id) return res.status(400).json({ error: 'Thiếu booking_id' });

  try {
    // 1. Lấy thông tin booking
    const { data: booking, error: bErr } = await supabaseAdmin
      .from('bookings')
      .select(`
        id, payment_status, total_amount, platform_fee, tutor_payout, booking_fee,
        student_id,
        tutor_profiles!inner ( user_id )
      `)
      .eq('id', booking_id)
      .single();

    if (bErr || !booking) return res.status(404).json({ error: 'Không tìm thấy booking' });
    if (booking.payment_status !== 'escrow_held') {
      return res.status(400).json({ error: `Booking đang ở trạng thái "${booking.payment_status}", không thể giải ngân` });
    }

    const tutorUserId = booking.tutor_profiles?.user_id;
    const tutorPayout = booking.tutor_payout || 0;
    const platformFee = booking.platform_fee || 0;
    const bookingFee = booking.booking_fee || 0;

    // 2. Cộng tiền vào ví gia sư
    const { data: tutorWallet, error: twErr } = await supabaseAdmin
      .from('wallets')
      .select('id, balance')
      .eq('user_id', tutorUserId)
      .single();

    if (twErr && twErr.code === 'PGRST116') {
      // Tạo ví mới cho gia sư nếu chưa có
      await supabaseAdmin.from('wallets').insert({ user_id: tutorUserId, balance: tutorPayout });
    } else if (twErr) {
      throw twErr;
    } else {
      await supabaseAdmin
        .from('wallets')
        .update({ balance: tutorWallet.balance + tutorPayout })
        .eq('user_id', tutorUserId);
    }

    // Ghi transaction cho gia sư
    const { data: finalTutorWallet } = await supabaseAdmin
      .from('wallets').select('id').eq('user_id', tutorUserId).single();
    if (finalTutorWallet) {
      await supabaseAdmin.from('transactions').insert({
        wallet_id: finalTutorWallet.id,
        type: 'escrow_release',
        amount: tutorPayout,
        description: `Giải ngân học phí booking #${booking_id}`,
        related_booking_id: booking_id,
        status: 'completed'
      });
    }

    // 3. Cộng commission + booking_fee vào platform_wallet
    const totalPlatformRevenue = platformFee + bookingFee;
    if (totalPlatformRevenue > 0) {
      // Trực tiếp update platform_wallet (không dùng RPC)
      try {
        const { data: pw } = await supabaseAdmin.from('platform_wallet').select('*').limit(1).single();
        if (pw) {
          await supabaseAdmin.from('platform_wallet').update({
            balance: (pw.balance || 0) + totalPlatformRevenue,
            total_commission_earned: (pw.total_commission_earned || 0) + platformFee,
            total_booking_fees_earned: (pw.total_booking_fees_earned || 0) + bookingFee,
            updated_at: new Date().toISOString()
          }).eq('id', pw.id);
        }
      } catch (pwErr) {
        console.log('⚠️ Platform wallet update skipped:', pwErr.message);
      }
    }

    // 4. Đánh dấu booking là đã giải ngân
    await supabaseAdmin
      .from('bookings')
      .update({ payment_status: 'released', completed_at: new Date().toISOString() })
      .eq('id', booking_id);

    res.json({
      message: 'Giải ngân thành công',
      booking_id,
      tutor_received: tutorPayout,
      platform_commission: platformFee,
      platform_booking_fee: bookingFee,
      total_platform_revenue: totalPlatformRevenue
    });
  } catch (err) {
    console.error('Escrow release error:', err);
    res.status(500).json({ error: 'Lỗi khi giải ngân' });
  }
});

// =====================================================
// ADMIN: Hoàn tiền (refund) booking
// POST /api/admin/refund
// Body: { booking_id, reason }
// =====================================================
router.post('/refund', authenticate, isSuperAdmin, async (req, res) => {
  const { booking_id, reason } = req.body;
  if (!booking_id) return res.status(400).json({ error: 'Thiếu booking_id' });

  try {
    const { data: booking, error: bErr } = await supabaseAdmin
      .from('bookings')
      .select('id, payment_status, total_amount, student_id')
      .eq('id', booking_id)
      .single();

    if (bErr || !booking) return res.status(404).json({ error: 'Không tìm thấy booking' });
    if (booking.payment_status !== 'escrow_held') {
      return res.status(400).json({ error: `Không thể hoàn tiền booking ở trạng thái "${booking.payment_status}"` });
    }

    // Hoàn tiền vào ví học sinh
    const { data: studentWallet } = await supabaseAdmin
      .from('wallets').select('id, balance').eq('user_id', booking.student_id).single();

    if (studentWallet) {
      await supabaseAdmin
        .from('wallets')
        .update({ balance: studentWallet.balance + booking.total_amount })
        .eq('user_id', booking.student_id);

      await supabaseAdmin.from('transactions').insert({
        wallet_id: studentWallet.id,
        type: 'refund',
        amount: booking.total_amount,
        description: `Hoàn tiền booking #${booking_id}${reason ? ': ' + reason : ''}`,
        related_booking_id: booking_id,
        status: 'completed'
      });
    }

    await supabaseAdmin
      .from('bookings')
      .update({ payment_status: 'refunded', status: 'rejected' })
      .eq('id', booking_id);

    res.json({ message: 'Hoàn tiền thành công', booking_id, refunded_amount: booking.total_amount });
  } catch (err) {
    console.error('Refund error:', err);
    res.status(500).json({ error: 'Lỗi khi hoàn tiền' });
  }
});

// =====================================================
// ADMIN: Lấy số dư platform wallet
// GET /api/admin/platform-wallet
// =====================================================
router.get('/platform-wallet', authenticate, isSuperAdmin, async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('platform_wallet')
      .select('*')
      .limit(1)
      .single();

    if (error && error.code === 'PGRST116') {
      return res.json({ balance: 0, total_commission_earned: 0, total_booking_fees_earned: 0, total_subscription_earned: 0 });
    }
    if (error) throw error;

    res.json(data);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Lỗi khi lấy số dư platform' });
  }
});

// =====================================================
// ADMIN: Lấy danh sách bookings có thể giải ngân
// GET /api/admin/pending-escrow
// =====================================================
router.get('/pending-escrow', authenticate, isSuperAdmin, async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('bookings')
      .select(`
        id, subject, status, payment_status, total_amount, platform_fee, tutor_payout, booking_fee,
        created_at, completed_at,
        student:users!bookings_student_id_fkey ( name, email ),
        tutor_profiles!inner (
          users!inner ( name )
        )
      `)
      .eq('payment_status', 'escrow_held')
      .eq('status', 'accepted')
      .order('created_at', { ascending: false });

    if (error) throw error;

    const formatted = (data || []).map(b => ({
      id: b.id,
      subject: b.subject,
      status: b.status,
      payment_status: b.payment_status,
      total_amount: b.total_amount,
      platform_fee: b.platform_fee,
      tutor_payout: b.tutor_payout,
      booking_fee: b.booking_fee || 0,
      created_at: b.created_at,
      student_name: b.student?.name,
      student_email: b.student?.email,
      tutor_name: b.tutor_profiles?.users?.name
    }));

    res.json(formatted);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Lỗi khi lấy danh sách escrow' });
  }
});

// =====================================================
// ADMIN: Lấy danh sách subscription hiện tại
// GET /api/admin/subscriptions
// =====================================================
router.get('/subscriptions', authenticate, isSuperAdmin, async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('users')
      .select('id, name, email, subscription_plan, subscription_started_at, subscription_expires_at')
      .eq('role', 'tutor')
      .order('subscription_plan', { ascending: false });

    if (error) throw error;
    res.json(data || []);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Lỗi khi lấy danh sách subscription' });
  }
});
