const express = require('express');
const router = express.Router();
const { supabaseAdmin } = require('../config/supabase');
const { authenticate, requireRole } = require('../middleware/auth');

// =====================================================
// STUDENT: Tạo booking
// =====================================================
router.post('/', authenticate, requireRole('student'), async (req, res) => {
  try {
    const { tutor_user_id, subject, schedule_id, message } = req.body;
    
    // Lấy tutor_profile_id từ user_id
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('tutor_profiles')
      .select('id')
      .eq('user_id', tutor_user_id)
      .single();
    
    if (profileError || !profile) {
      return res.status(404).json({ error: 'Không tìm thấy gia sư' });
    }
    
    // Tạo booking
    const { error: bookingError } = await supabaseAdmin
      .from('bookings')
      .insert({
        student_id: req.user.id,
        tutor_id: profile.id,
        subject,
        schedule_id,
        message: message || ''
      });
    
    if (bookingError) throw bookingError;
    
    res.json({ message: 'Đăng ký thành công, chờ gia sư xác nhận' });
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
    const { error } = await supabaseAdmin
      .from('bookings')
      .update({ status })
      .eq('id', req.params.id)
      .eq('tutor_id', profile.id);
    
    if (error) throw error;
    
    res.json({ 
      message: `Đã ${status === 'accepted' ? 'chấp nhận' : 'từ chối'} đơn đăng ký` 
    });
  } catch (err) {
    console.error('Error:', err);
    res.status(500).json({ error: 'Lỗi khi cập nhật trạng thái' });
  }
});

module.exports = router;
