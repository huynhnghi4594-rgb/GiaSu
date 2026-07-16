const express = require('express');
const router = express.Router();
const db = require('../database');
const { authenticate, requireRole } = require('../middleware/auth');

// Search tutors by subject/level
router.get('/search', async (req, res) => {
  const { subject, level } = req.query;
  let query = `
    SELECT u.id, u.name, tp.bio, tp.hourly_rate,
           GROUP_CONCAT(s.name || ' (' || s.level || ')') as subjects
    FROM users u
    JOIN tutor_profiles tp ON u.id = tp.user_id
    JOIN subjects s ON tp.id = s.tutor_id
    WHERE 1=1
  `;
  const params = [];
  if (subject) { query += ' AND s.name LIKE ?'; params.push(`%${subject}%`); }
  if (level)   { query += ' AND s.level = ?'; params.push(level); }
  query += ' GROUP BY u.id';
  const tutors = await db.allAsync(query, params);
  res.json(tutors);
});

// Get own profile (tutor) — must be before /:id
router.get('/profile/me', authenticate, requireRole('tutor'), async (req, res) => {
  const profile = await db.getAsync('SELECT * FROM tutor_profiles WHERE user_id = ?', [req.user.id]);
  if (!profile) return res.status(404).json({ error: 'Không tìm thấy hồ sơ' });
  profile.subjects = await db.allAsync('SELECT * FROM subjects WHERE tutor_id = ?', [profile.id]);
  profile.schedules = await db.allAsync('SELECT * FROM schedules WHERE tutor_id = ?', [profile.id]);
  res.json(profile);
});

// Get tutor detail
router.get('/:id', async (req, res) => {
  const tutor = await db.getAsync(`
    SELECT u.id, u.name, tp.id as profile_id, tp.bio, tp.hourly_rate
    FROM users u JOIN tutor_profiles tp ON u.id = tp.user_id
    WHERE u.id = ?
  `, [req.params.id]);
  if (!tutor) return res.status(404).json({ error: 'Không tìm thấy gia sư' });
  tutor.subjects = await db.allAsync('SELECT * FROM subjects WHERE tutor_id = ?', [tutor.profile_id]);
  tutor.schedules = await db.allAsync('SELECT * FROM schedules WHERE tutor_id = ?', [tutor.profile_id]);
  res.json(tutor);
});

// Update tutor profile
router.put('/profile', authenticate, requireRole('tutor'), async (req, res) => {
  const { bio, hourly_rate } = req.body;
  await db.runAsync('UPDATE tutor_profiles SET bio = ?, hourly_rate = ? WHERE user_id = ?',
    [bio, hourly_rate, req.user.id]);
  res.json({ message: 'Cập nhật thành công' });
});

// Add subject
router.post('/subjects', authenticate, requireRole('tutor'), async (req, res) => {
  const { name, level } = req.body;
  if (!name || !level) return res.status(400).json({ error: 'Thiếu thông tin môn học' });
  const profile = await db.getAsync('SELECT * FROM tutor_profiles WHERE user_id = ?', [req.user.id]);
  await db.runAsync('INSERT INTO subjects (tutor_id, name, level) VALUES (?, ?, ?)', [profile.id, name, level]);
  res.json({ message: 'Thêm môn học thành công' });
});

// Delete subject
router.delete('/subjects/:id', authenticate, requireRole('tutor'), async (req, res) => {
  const profile = await db.getAsync('SELECT * FROM tutor_profiles WHERE user_id = ?', [req.user.id]);
  await db.runAsync('DELETE FROM subjects WHERE id = ? AND tutor_id = ?', [req.params.id, profile.id]);
  res.json({ message: 'Xóa thành công' });
});

// Add schedule
router.post('/schedules', authenticate, requireRole('tutor'), async (req, res) => {
  const { day_of_week, start_time, end_time } = req.body;
  if (!day_of_week || !start_time || !end_time)
    return res.status(400).json({ error: 'Thiếu thông tin lịch dạy' });
  const profile = await db.getAsync('SELECT * FROM tutor_profiles WHERE user_id = ?', [req.user.id]);
  await db.runAsync('INSERT INTO schedules (tutor_id, day_of_week, start_time, end_time) VALUES (?, ?, ?, ?)',
    [profile.id, day_of_week, start_time, end_time]);
  res.json({ message: 'Thêm lịch dạy thành công' });
});

// Delete schedule
router.delete('/schedules/:id', authenticate, requireRole('tutor'), async (req, res) => {
  const profile = await db.getAsync('SELECT * FROM tutor_profiles WHERE user_id = ?', [req.user.id]);
  await db.runAsync('DELETE FROM schedules WHERE id = ? AND tutor_id = ?', [req.params.id, profile.id]);
  res.json({ message: 'Xóa lịch thành công' });
});

module.exports = router;
