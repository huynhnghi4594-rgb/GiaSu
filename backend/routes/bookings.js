const express = require('express');
const router = express.Router();
const { supabaseAdmin } = require('../config/supabase');
const { authenticate, requireRole } = require('../middleware/auth');
const { checkFreemiumLimit, BOOKING_FEE } = require('./subscriptions');

// =====================================================
// STUDENT: Tạo booking với escrow payment
// MODEL 1: Commission 10% từ học phí
// MODEL 4: Booking fee 10,000đ/lần đặt lịch
// =====================================================
router.post('/', authenticate, requireRole('student'), async (req, res) => {
  try {
    const { tutor_user_id, subject, schedule_id, message: rawMsg, duration_hours = 1 } = req.body;

    // Lọc bỏ SĐT và địa chỉ nếu học viên cũ hoặc client khác gửi lên
    const message = (rawMsg || '')
      .replace(/\[SDT:[^\]]*\]/gi, '')
      .replace(/\[Địa chỉ:[^\]]*\]/gi, '')
      .replace(/\[ĐỊA CHỈ:[^\]]*\]/gi, '')
      .trim();

    // Lấy tutor_profile_id và hourly_rate từ user_id
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('tutor_profiles')
      .select('id, hourly_rate')
      .eq('user_id', tutor_user_id)
      .single();

    if (profileError || !profile) {
      return res.status(404).json({ error: 'Không tìm thấy gia sư' });
    }

    // MODEL 3 (Freemium): Kiểm tra gia sư có còn slot không
    const freemiumCheck = await checkFreemiumLimit(tutor_user_id).catch(() => ({ allowed: true }));
    if (!freemiumCheck.allowed) {
      return res.status(400).json({ error: freemiumCheck.message });
    }

    // Tính toán tổng tiền
    const hourlyRate = profile.hourly_rate || 150000;       // default 150k/h
    const lessonFee  = hourlyRate * parseInt(duration_hours); // học phí thuần
    const platformFee = Math.floor(lessonFee * 0.1);          // MODEL 1: 10% commission
    const tutorPayout = lessonFee - platformFee;               // 90% về gia sư
    const bookingFee  = BOOKING_FEE;                           // MODEL 4: 10k/lần đặt
    const totalAmount = lessonFee + bookingFee;                // học sinh trả = học phí + booking fee

    // Kiểm tra số dư ví học sinh
    const { data: studentWallet, error: walletError } = await supabaseAdmin
      .from('wallets')
      .select('balance, id')
      .eq('user_id', req.user.id)
      .single();

    if (walletError) {
      if (walletError.code === 'PGRST116') {
        return res.status(400).json({ error: 'Ví của bạn chưa được tạo. Vui lòng nạp tiền trước.' });
      }
      throw walletError;
    }

    if (studentWallet.balance < totalAmount) {
      return res.status(400).json({
        error: `Số dư không đủ. Cần ${totalAmount.toLocaleString()}đ (học phí ${lessonFee.toLocaleString()}đ + phí đặt lịch ${bookingFee.toLocaleString()}đ), hiện có ${studentWallet.balance.toLocaleString()}đ`
      });
    }

    // Tạo booking với thông tin thanh toán
    const { data: booking, error: bookingError } = await supabaseAdmin
      .from('bookings')
      .insert({
        student_id: req.user.id,
        tutor_id: profile.id,
        subject,
        schedule_id,
        message: message || '',
        duration_hours: parseInt(duration_hours),
        total_amount: totalAmount,
        platform_fee: platformFee,
        booking_fee: bookingFee,
        tutor_payout: tutorPayout,
        payment_status: 'escrow_held'
      })
      .select()
      .single();

    if (bookingError) throw bookingError;

    // Trừ tiền từ ví học sinh (escrow hold toàn bộ totalAmount)
    const newBalance = studentWallet.balance - totalAmount;
    await supabaseAdmin
      .from('wallets')
      .update({ balance: newBalance })
      .eq('user_id', req.user.id);

    // Ghi transaction escrow_hold
    try {
      await supabaseAdmin.from('transactions').insert({
        wallet_id: studentWallet.id,
        type: 'escrow_hold',
        amount: totalAmount,
        description: `Tạm giữ học phí + phí đặt lịch cho booking #${booking.id} (${subject})`,
        related_booking_id: booking.id,
        status: 'completed'
      });
    } catch (txError) {
      console.log('⚠️ Could not create transaction record:', txError.message);
    }

    res.json({
      message: 'Đăng ký thành công, tiền đã được tạm giữ',
      booking_id: booking.id,
      breakdown: {
        lesson_fee: lessonFee,
        booking_fee: bookingFee,
        total_charged: totalAmount,
        platform_commission: platformFee,
        tutor_will_receive: tutorPayout
      },
      your_new_balance: newBalance
    });
  } catch (err) {
    console.error('Error:', err);
    res.status(500).json({ error: 'Lỗi khi tạo booking' });
  }
});

// =====================================================
// STUDENT: Xem bookings của mình
// =====================================================
router.get('/my', authenticate, requireRole('student'), async (req, res) => {
  try {
    const { data: bookings, error } = await supabaseAdmin
      .from('bookings')
      .select(`
        *,
        tutor_profiles!inner (
          user_id,
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
      .eq('student_id', req.user.id)
      .order('created_at', { ascending: false });
    
    if (error) throw error;
    
    // Format response
    const formatted = bookings.map(b => ({
      id: b.id,
      subject: b.subject,
      message: b.message,
      status: b.status,
      created_at: b.created_at,
      tutor_name: b.tutor_profiles?.users?.name,
      day_of_week: b.schedules?.day_of_week,
      start_time: b.schedules?.start_time,
      end_time: b.schedules?.end_time
    }));
    
    res.json(formatted);
  } catch (err) {
    console.error('Error:', err);
    res.status(500).json({ error: 'Lỗi khi lấy danh sách booking' });
  }
});

// =====================================================
// TUTOR: Xem bookings đến mình
// =====================================================
router.get('/incoming', authenticate, requireRole('tutor'), async (req, res) => {
  try {
    // Lấy tutor_profile_id
    const { data: profile } = await supabaseAdmin
      .from('tutor_profiles')
      .select('id')
      .eq('user_id', req.user.id)
      .single();
    
    if (!profile) {
      return res.status(404).json({ error: 'Không tìm thấy hồ sơ' });
    }
    
    const { data: bookings, error } = await supabaseAdmin
      .from('bookings')
      .select(`
        *,
        users!bookings_student_id_fkey (
          name
        ),
        schedules!inner (
          day_of_week,
          start_time,
          end_time
        )
      `)
      .eq('tutor_id', profile.id)
      .order('created_at', { ascending: false });
    
    if (error) throw error;
    
    // Format response
    const formatted = bookings.map(b => ({
      id: b.id,
      subject: b.subject,
      message: b.message,
      status: b.status,
      created_at: b.created_at,
      student_name: b.users?.name,
      day_of_week: b.schedules?.day_of_week,
      start_time: b.schedules?.start_time,
      end_time: b.schedules?.end_time
    }));
    
    res.json(formatted);
  } catch (err) {
    console.error('Error:', err);
    res.status(500).json({ error: 'Lỗi khi lấy danh sách booking' });
  }
});

// =====================================================
// TUTOR: Chấp nhận/từ chối booking
// =====================================================
router.put('/:id/status', authenticate, requireRole('tutor'), async (req, res) => {
  try {
    const { status } = req.body;
    
    if (!['accepted', 'rejected'].includes(status)) {
      return res.status(400).json({ error: 'Trạng thái không hợp lệ' });
    }
    
    // Lấy tutor_profile_id
    const { data: profile } = await supabaseAdmin
      .from('tutor_profiles')
      .select('id')
      .eq('user_id', req.user.id)
      .single();
    
    if (!profile) {
      return res.status(404).json({ error: 'Không tìm thấy hồ sơ' });
    }
    
    // Update booking status
    const { data: updatedBooking, error } = await supabaseAdmin
      .from('bookings')
      .update({ status })
      .eq('id', req.params.id)
      .eq('tutor_id', profile.id)
      .select()
      .single();
    
    if (error) throw error;

    // Nếu chấp nhận đơn này, tự động từ chối các đơn đặt lịch khác trùng lịch dạy (cùng schedule_id và đang pending)
    if (status === 'accepted' && updatedBooking) {
      await supabaseAdmin
        .from('bookings')
        .update({ status: 'rejected' })
        .eq('tutor_id', profile.id)
        .eq('schedule_id', updatedBooking.schedule_id)
        .eq('status', 'pending');
    }
    
    res.json({ 
      message: `Đã ${status === 'accepted' ? 'chấp nhận' : 'từ chối'} đơn đăng ký` 
    });
  } catch (err) {
    console.error('Error:', err);
    res.status(500).json({ error: 'Lỗi khi cập nhật trạng thái' });
  }
});

module.exports = router;
