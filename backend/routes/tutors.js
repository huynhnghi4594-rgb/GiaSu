const express = require('express');
const router = express.Router();
const { supabaseAdmin } = require('../config/supabase');
const { authenticate, requireRole } = require('../middleware/auth');

// =====================================================
// GỢI Ý GIA SƯ DÙNG COSINE SIMILARITY
// =====================================================
router.get('/recommendations', authenticate, requireRole('student'), async (req, res) => {
  try {
    const { data: student, error: studentError } = await supabaseAdmin
      .from('users')
      .select('preferred_subjects, subject_embedding')
      .eq('id', req.user.id)
      .single();
    
    if (studentError) throw studentError;
    
    if (!student?.preferred_subjects || student.preferred_subjects.length === 0) {
      return res.json([]);
    }

    // Gọi RPC function để lấy gợi ý với cosine similarity
    const { data: tutors, error: tutorError } = await supabaseAdmin.rpc('get_recommended_tutors', {
      student_embedding: student.subject_embedding
    });

    if (tutorError) {
      console.error('RPC Error:', tutorError);
      return fallbackRecommendations(student.preferred_subjects, res);
    }

    res.json(tutors);
  } catch (err) {
    console.error('Error:', err);
    res.status(500).json({ error: 'Lỗi khi lấy gợi ý' });
  }
});

// Fallback: Simple matching nếu RPC không hoạt động
async function fallbackRecommendations(preferredSubjects, res) {
  try {
    const { data: tutors, error } = await supabaseAdmin
      .from('users')
      .select(`
        id, name,
        tutor_profiles!inner (
          bio, hourly_rate,
          subjects (name, level)
        )
      `)
      .eq('role', 'tutor')
      .limit(20);

    if (error) throw error;

    const tutorsWithMatch = tutors.map(tutor => {
      const subjects = tutor.tutor_profiles?.subjects || [];
      const subjectNames = subjects.map(s => s.name);
      const matchCount = preferredSubjects.filter(pref => subjectNames.includes(pref)).length;
      
      return {
        id: tutor.id,
        name: tutor.name,
        bio: tutor.tutor_profiles?.bio,
        hourly_rate: tutor.tutor_profiles?.hourly_rate,
        subjects: subjects,
        similarity_score: matchCount / Math.max(preferredSubjects.length, 1)
      };
    });

    tutorsWithMatch.sort((a, b) => {
      if (a.similarity_score !== b.similarity_score) {
        return b.similarity_score - a.similarity_score;
      }
      return (a.hourly_rate || 0) - (b.hourly_rate || 0);
    });

    res.json(tutorsWithMatch.slice(0, 10));
  } catch (err) {
    console.error('Fallback error:', err);
    res.status(500).json({ error: 'Lỗi khi lấy gợi ý' });
  }
}

// =====================================================
// TÌM KIẾM GIA SƯ VỚI BỘ LỌC NÂNG CAO
// =====================================================
router.get('/search', async (req, res) => {
  try {
    const { subject, level, min_price, max_price, day_of_week, sort_by, order } = req.query;
    
    let query = supabaseAdmin
      .from('users')
      .select(`
        id, name,
        tutor_profiles!inner (
          bio, hourly_rate,
          subjects (name, level),
          schedules (day_of_week, start_time, end_time)
        )
      `)
      .eq('role', 'tutor');
    
    // Lọc theo giá
    if (min_price) query = query.gte('tutor_profiles.hourly_rate', parseInt(min_price));
    if (max_price) query = query.lte('tutor_profiles.hourly_rate', parseInt(max_price));

    const { data: tutors, error } = await query;
    if (error) throw error;

    // Filter và sort ở JavaScript
    let filtered = tutors.map(t => ({
      id: t.id,
      name: t.name,
      bio: t.tutor_profiles?.bio,
      hourly_rate: t.tutor_profiles?.hourly_rate,
      subjects: t.tutor_profiles?.subjects || [],
      schedules: t.tutor_profiles?.schedules || []
    }));

    if (subject) {
      filtered = filtered.filter(t => 
        t.subjects.some(s => s.name.toLowerCase().includes(subject.toLowerCase()))
      );
    }

    if (level) {
      filtered = filtered.filter(t =>
        t.subjects.some(s => s.level === level)
      );
    }

    if (day_of_week) {
      filtered = filtered.filter(t =>
        t.schedules.some(sc => sc.day_of_week === day_of_week)
      );
    }

    if (sort_by === 'price') {
      filtered.sort((a, b) => {
        const diff = (a.hourly_rate || 0) - (b.hourly_rate || 0);
        return order === 'desc' ? -diff : diff;
      });
    }

    res.json(filtered);
  } catch (err) {
    console.error('Error:', err);
    res.status(500).json({ error: 'Lỗi khi tìm kiếm' });
  }
});

// =====================================================
// LẤY THÔNG TIN CHI TIẾT GIA SƯ
// =====================================================
router.get('/:id', async (req, res) => {
  try {
    const { data: tutor, error } = await supabaseAdmin
      .from('users')
      .select(`
        id, name,
        tutor_profiles!inner (
          id, bio, hourly_rate,
          subjects (id, name, level),
          schedules (id, day_of_week, start_time, end_time)
        )
      `)
      .eq('id', req.params.id)
      .eq('role', 'tutor')
      .single();
    
    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({ error: 'Không tìm thấy gia sư' });
      }
      throw error;
    }
    
    res.json({
      id: tutor.id,
      name: tutor.name,
      profile_id: tutor.tutor_profiles?.id,
      bio: tutor.tutor_profiles?.bio,
      hourly_rate: tutor.tutor_profiles?.hourly_rate,
      subjects: tutor.tutor_profiles?.subjects || [],
      schedules: tutor.tutor_profiles?.schedules || []
    });
  } catch (err) {
    console.error('Error:', err);
    res.status(500).json({ error: 'Lỗi server' });
  }
});

// =====================================================
// TUTOR MANAGEMENT ROUTES (Require Authentication)
// =====================================================

router.get('/profile/me', authenticate, requireRole('tutor'), async (req, res) => {
  try {
    const { data: profile, error } = await supabaseAdmin
      .from('tutor_profiles')
      .select('*, subjects (*), schedules (*)')
      .eq('user_id', req.user.id)
      .single();
    
    if (error && error.code === 'PGRST116') {
      return res.status(404).json({ error: 'Không tìm thấy hồ sơ' });
    }
    if (error) throw error;
    
    res.json(profile);
  } catch (err) {
    console.error('Error:', err);
    res.status(500).json({ error: 'Lỗi server' });
  }
});

router.put('/profile', authenticate, requireRole('tutor'), async (req, res) => {
  try {
    const { bio, hourly_rate } = req.body;
    const { error } = await supabaseAdmin
      .from('tutor_profiles')
      .update({ bio, hourly_rate })
      .eq('user_id', req.user.id);
    
    if (error) throw error;
    res.json({ message: 'Cập nhật thành công' });
  } catch (err) {
    console.error('Error:', err);
    res.status(500).json({ error: 'Lỗi khi cập nhật' });
  }
});

router.post('/subjects', authenticate, requireRole('tutor'), async (req, res) => {
  try {
    const { name, level } = req.body;
    if (!name || !level) {
      return res.status(400).json({ error: 'Thiếu thông tin môn học' });
    }
    
    const { data: profile } = await supabaseAdmin
      .from('tutor_profiles')
      .select('id')
      .eq('user_id', req.user.id)
      .single();
    
    if (!profile) return res.status(404).json({ error: 'Không tìm thấy hồ sơ' });
    
    const { error } = await supabaseAdmin
      .from('subjects')
      .insert({ tutor_id: profile.id, name, level });
    
    if (error) throw error;
    res.json({ message: 'Thêm môn học thành công' });
  } catch (err) {
    console.error('Error:', err);
    res.status(500).json({ error: 'Lỗi khi thêm môn học' });
  }
});

router.delete('/subjects/:id', authenticate, requireRole('tutor'), async (req, res) => {
  try {
    const { data: profile } = await supabaseAdmin
      .from('tutor_profiles')
      .select('id')
      .eq('user_id', req.user.id)
      .single();
    
    if (!profile) return res.status(404).json({ error: 'Không tìm thấy hồ sơ' });
    
    const { error } = await supabaseAdmin
      .from('subjects')
      .delete()
      .eq('id', req.params.id)
      .eq('tutor_id', profile.id);
    
    if (error) throw error;
    res.json({ message: 'Xóa thành công' });
  } catch (err) {
    console.error('Error:', err);
    res.status(500).json({ error: 'Lỗi khi xóa' });
  }
});

router.post('/schedules', authenticate, requireRole('tutor'), async (req, res) => {
  try {
    const { day_of_week, start_time, end_time } = req.body;
    if (!day_of_week || !start_time || !end_time) {
      return res.status(400).json({ error: 'Thiếu thông tin lịch dạy' });
    }
    
    const { data: profile } = await supabaseAdmin
      .from('tutor_profiles')
      .select('id')
      .eq('user_id', req.user.id)
      .single();
    
    if (!profile) return res.status(404).json({ error: 'Không tìm thấy hồ sơ' });
    
    const { error } = await supabaseAdmin
      .from('schedules')
      .insert({ tutor_id: profile.id, day_of_week, start_time, end_time });
    
    if (error) throw error;
    res.json({ message: 'Thêm lịch dạy thành công' });
  } catch (err) {
    console.error('Error:', err);
    res.status(500).json({ error: 'Lỗi khi thêm lịch' });
  }
});

router.delete('/schedules/:id', authenticate, requireRole('tutor'), async (req, res) => {
  try {
    const { data: profile } = await supabaseAdmin
      .from('tutor_profiles')
      .select('id')
      .eq('user_id', req.user.id)
      .single();
    
    if (!profile) return res.status(404).json({ error: 'Không tìm thấy hồ sơ' });
    
    const { error } = await supabaseAdmin
      .from('schedules')
      .delete()
      .eq('id', req.params.id)
      .eq('tutor_id', profile.id);
    
    if (error) throw error;
    res.json({ message: 'Xóa lịch thành công' });
  } catch (err) {
    console.error('Error:', err);
    res.status(500).json({ error: 'Lỗi khi xóa' });
  }
});

module.exports = router;
