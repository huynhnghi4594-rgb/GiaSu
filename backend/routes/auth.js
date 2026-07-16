const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { supabaseAdmin } = require('../config/supabase');
const { JWT_SECRET } = require('../middleware/auth');

// Helper: Tạo simple embedding từ preferred_subjects
function createSubjectEmbedding(subjects) {
  if (!subjects || subjects.length === 0) return null;
  
  const subjectMap = {
    'Toán': 0, 'Lý': 1, 'Hóa': 2, 'Sinh': 3,
    'Văn': 4, 'Anh văn': 5, 'Sử': 6, 'Địa': 7,
    'GDCD': 8, 'Tin học': 9
  };
  
  const vector = new Array(384).fill(0);
  
  subjects.forEach(subject => {
    if (subjectMap[subject] !== undefined) {
      vector[subjectMap[subject]] = 1.0;
    }
  });
  
  return `[${vector.join(',')}]`;
}

// =====================================================
// ĐĂNG KÝ
// =====================================================
router.post('/register', async (req, res) => {
  try {
    const { name, email, password, role, preferred_subjects } = req.body;
    
    // Validate
    if (!name || !email || !password || !role) {
      return res.status(400).json({ error: 'Thiếu thông tin bắt buộc' });
    }
    
    if (!['student', 'tutor'].includes(role)) {
      return res.status(400).json({ error: 'Role không hợp lệ' });
    }
    
    // Hash password
    const hashed = await bcrypt.hash(password, 10);
    
    // Tạo embedding nếu là student và có preferred_subjects
    const subjectEmbedding = (role === 'student' && preferred_subjects && preferred_subjects.length > 0)
      ? createSubjectEmbedding(preferred_subjects)
      : null;
    
    // Tạo user
    const { data: user, error: userError } = await supabaseAdmin
      .from('users')
      .insert({
        name,
        email,
        password: hashed,
        role,
        preferred_subjects: preferred_subjects || null,
        subject_embedding: subjectEmbedding
      })
      .select()
      .single();
    
    if (userError) {
      if (userError.message.includes('unique')) {
        return res.status(400).json({ error: 'Email đã tồn tại' });
      }
      throw userError;
    }
    
    // Nếu là tutor, tạo tutor_profile
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
    
    // Tạo JWT token
    const token = jwt.sign(
      { id: user.id, role: user.role },
      JWT_SECRET,
      { expiresIn: '7d' }
    );
    
    res.json({
      message: 'Đăng ký thành công',
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role
      }
    });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ error: 'Lỗi khi đăng ký' });
  }
});

// =====================================================
// ĐĂNG NHẬP
// =====================================================
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    if (!email || !password) {
      return res.status(400).json({ error: 'Thiếu email hoặc mật khẩu' });
    }
    
    // Tìm user
    const { data: user, error } = await supabaseAdmin
      .from('users')
      .select('*')
      .eq('email', email)
      .single();
    
    if (error || !user) {
      return res.status(401).json({ error: 'Email hoặc mật khẩu không đúng' });
    }
    
    // Kiểm tra password
    const valid = await bcrypt.compare(password, user.password);
    
    if (!valid) {
      return res.status(401).json({ error: 'Email hoặc mật khẩu không đúng' });
    }
    
    // Tạo JWT token
    const token = jwt.sign(
      { id: user.id, role: user.role },
      JWT_SECRET,
      { expiresIn: '7d' }
    );
    
    res.json({
      message: 'Đăng nhập thành công',
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role
      }
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Lỗi khi đăng nhập' });
  }
});

module.exports = router;
