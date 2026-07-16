const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../database');

const SECRET = 'tutor_secret_key_2024';

router.post('/register', async (req, res) => {
  const { name, email, password, role } = req.body;
  if (!name || !email || !password || !role)
    return res.status(400).json({ error: 'Vui lòng điền đầy đủ thông tin' });
  if (!['tutor', 'student'].includes(role))
    return res.status(400).json({ error: 'Vai trò không hợp lệ' });

  try {
    const hashed = bcrypt.hashSync(password, 10);
    const result = await db.runAsync(
      'INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)',
      [name, email, hashed, role]
    );
    if (role === 'tutor') {
      await db.runAsync('INSERT INTO tutor_profiles (user_id) VALUES (?)', [result.lastID]);
    }
    const token = jwt.sign({ id: result.lastID, role }, SECRET, { expiresIn: '7d' });
    res.json({ token, user: { id: result.lastID, name, email, role } });
  } catch (e) {
    if (e.message && e.message.includes('UNIQUE'))
      return res.status(400).json({ error: 'Email đã được sử dụng' });
    res.status(500).json({ error: 'Lỗi server' });
  }
});

router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  const user = await db.getAsync('SELECT * FROM users WHERE email = ?', [email]);
  if (!user || !bcrypt.compareSync(password, user.password))
    return res.status(401).json({ error: 'Email hoặc mật khẩu không đúng' });
  const token = jwt.sign({ id: user.id, role: user.role }, SECRET, { expiresIn: '7d' });
  res.json({ token, user: { id: user.id, name: user.name, email: user.email, role: user.role } });
});

module.exports = router;
module.exports.SECRET = SECRET;
