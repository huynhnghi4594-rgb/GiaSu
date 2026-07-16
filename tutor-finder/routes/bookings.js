const express = require('express');
const router = express.Router();
const db = require('../database');
const { authenticate, requireRole } = require('../middleware/auth');

// Student: create booking
router.post('/', authenticate, requireRole('student'), async (req, res) => {
  const { tutor_user_id, subject, schedule_id, message } = req.body;
  const profile = await db.getAsync('SELECT * FROM tutor_profiles WHERE user_id = ?', [tutor_user_id]);
  if (!profile) return res.status(404).json({ error: 'Không tìm thấy gia sư' });

  await db.runAsync(
    'INSERT INTO bookings (student_id, tutor_id, subject, schedule_id, message) VALUES (?, ?, ?, ?, ?)',
    [req.user.id, profile.id, subject, schedule_id, message || '']
  );
  res.json({ message: 'Đăng ký thành công, chờ gia sư xác nhận' });
});

// Student: get own bookings
router.get('/my', authenticate, requireRole('student'), async (req, res) => {
  const bookings = await db.allAsync(`
    SELECT b.*, u.name as tutor_name, sc.day_of_week, sc.start_time, sc.end_time
    FROM bookings b
    JOIN tutor_profiles tp ON b.tutor_id = tp.id
    JOIN users u ON tp.user_id = u.id
    JOIN schedules sc ON b.schedule_id = sc.id
    WHERE b.student_id = ?
    ORDER BY b.created_at DESC
  `, [req.user.id]);
  res.json(bookings);
});

// Tutor: get incoming bookings
router.get('/incoming', authenticate, requireRole('tutor'), async (req, res) => {
  const profile = await db.getAsync('SELECT * FROM tutor_profiles WHERE user_id = ?', [req.user.id]);
  const bookings = await db.allAsync(`
    SELECT b.*, u.name as student_name, sc.day_of_week, sc.start_time, sc.end_time
    FROM bookings b
    JOIN users u ON b.student_id = u.id
    JOIN schedules sc ON b.schedule_id = sc.id
    WHERE b.tutor_id = ?
    ORDER BY b.created_at DESC
  `, [profile.id]);
  res.json(bookings);
});

// Tutor: accept or reject booking
router.put('/:id/status', authenticate, requireRole('tutor'), async (req, res) => {
  const { status } = req.body;
  if (!['accepted', 'rejected'].includes(status))
    return res.status(400).json({ error: 'Trạng thái không hợp lệ' });
  const profile = await db.getAsync('SELECT * FROM tutor_profiles WHERE user_id = ?', [req.user.id]);
  const result = await db.runAsync(
    'UPDATE bookings SET status = ? WHERE id = ? AND tutor_id = ?',
    [status, req.params.id, profile.id]
  );
  if (result.changes === 0) return res.status(404).json({ error: 'Không tìm thấy đơn đăng ký' });
  res.json({ message: `Đã ${status === 'accepted' ? 'chấp nhận' : 'từ chối'} đơn đăng ký` });
});

module.exports = router;
