-- =====================================================
-- DATABASE SCHEMA VỚI COSINE SIMILARITY (ĐÃ SỬA LỖI)
-- Copy và chạy trên Supabase SQL Editor
-- =====================================================

-- Xóa bảng cũ nếu có
DROP TABLE IF EXISTS bookings CASCADE;
DROP TABLE IF EXISTS schedules CASCADE;
DROP TABLE IF EXISTS subjects CASCADE;
DROP TABLE IF EXISTS tutor_profiles CASCADE;
DROP TABLE IF EXISTS users CASCADE;

-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- =====================================================
-- TABLES
-- =====================================================

CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('student', 'tutor')),
  preferred_subjects JSONB DEFAULT NULL,
  subject_embedding vector(384),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE tutor_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  bio TEXT,
  hourly_rate INTEGER,
  subject_embedding vector(384),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE subjects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tutor_id UUID REFERENCES tutor_profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  level TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tutor_id UUID REFERENCES tutor_profiles(id) ON DELETE CASCADE,
  day_of_week TEXT NOT NULL,
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE bookings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID REFERENCES users(id) ON DELETE CASCADE,
  tutor_id UUID REFERENCES tutor_profiles(id) ON DELETE CASCADE,
  subject TEXT NOT NULL,
  schedule_id UUID REFERENCES schedules(id) ON DELETE CASCADE,
  message TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_role ON users(role);
CREATE INDEX idx_users_embedding ON users USING ivfflat (subject_embedding vector_cosine_ops);
CREATE INDEX idx_tutor_profiles_user_id ON tutor_profiles(user_id);
CREATE INDEX idx_tutor_embedding ON tutor_profiles USING ivfflat (subject_embedding vector_cosine_ops);
CREATE INDEX idx_subjects_tutor_id ON subjects(tutor_id);
CREATE INDEX idx_subjects_name ON subjects(name);
CREATE INDEX idx_schedules_tutor_id ON schedules(tutor_id);
CREATE INDEX idx_bookings_student_id ON bookings(student_id);
CREATE INDEX idx_bookings_tutor_id ON bookings(tutor_id);

-- =====================================================
-- FUNCTION: Tạo embedding từ subjects (ĐÃ SỬA LỖI)
-- =====================================================
CREATE OR REPLACE FUNCTION simple_subject_embedding(subjects TEXT[])
RETURNS vector(384) AS $$
DECLARE
  result FLOAT8[];
  subject_map JSONB;
  i INT;
  subject TEXT;  -- ĐÃ SỬA: Dùng TEXT thay vì FLOAT
BEGIN
  -- Map các môn học phổ biến
  subject_map := '{
    "Toán": 0, "Lý": 1, "Hóa": 2, "Sinh": 3, 
    "Văn": 4, "Anh văn": 5, "Sử": 6, "Địa": 7,
    "GDCD": 8, "Tin học": 9
  }'::JSONB;
  
  -- Khởi tạo array với 384 phần tử = 0
  result := array_fill(0.0::FLOAT8, ARRAY[384]);
  
  -- Duyệt qua từng môn học
  FOREACH subject IN ARRAY subjects LOOP
    IF subject_map ? subject THEN
      i := (subject_map->>subject)::INT;
      result[i+1] := 1.0;  -- PostgreSQL array index từ 1
    END IF;
  END LOOP;
  
  -- Chuyển array thành vector
  RETURN result::vector(384);
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- =====================================================
-- RPC FUNCTION: Lấy gợi ý với cosine similarity
-- =====================================================
CREATE OR REPLACE FUNCTION get_recommended_tutors(student_embedding vector(384))
RETURNS TABLE (
  id UUID,
  name TEXT,
  bio TEXT,
  hourly_rate INTEGER,
  similarity_score FLOAT,
  subjects JSONB,
  schedules JSONB
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    u.id,
    u.name,
    tp.bio,
    tp.hourly_rate,
    (1 - (student_embedding <=> tp.subject_embedding))::FLOAT as similarity_score,
    (
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', s.id,
          'name', s.name,
          'level', s.level
        )
      )
      FROM subjects s
      WHERE s.tutor_id = tp.id
    ) as subjects,
    (
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', sc.id,
          'day_of_week', sc.day_of_week,
          'start_time', sc.start_time,
          'end_time', sc.end_time
        )
      )
      FROM schedules sc
      WHERE sc.tutor_id = tp.id
    ) as schedules
  FROM users u
  INNER JOIN tutor_profiles tp ON u.id = tp.user_id
  WHERE u.role = 'tutor'
    AND tp.subject_embedding IS NOT NULL
  ORDER BY 
    similarity_score DESC,
    tp.hourly_rate ASC NULLS LAST
  LIMIT 10;
END;
$$ LANGUAGE plpgsql STABLE;

-- =====================================================
-- TRIGGER: Auto update embedding khi thêm/xóa subject
-- =====================================================
CREATE OR REPLACE FUNCTION update_tutor_embedding()
RETURNS TRIGGER AS $$
DECLARE
  tutor_subjects TEXT[];
BEGIN
  SELECT array_agg(DISTINCT name) INTO tutor_subjects
  FROM subjects
  WHERE tutor_id = COALESCE(NEW.tutor_id, OLD.tutor_id);
  
  UPDATE tutor_profiles
  SET subject_embedding = simple_subject_embedding(tutor_subjects)
  WHERE id = COALESCE(NEW.tutor_id, OLD.tutor_id);
  
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_tutor_embedding ON subjects;
CREATE TRIGGER trigger_update_tutor_embedding
  AFTER INSERT OR DELETE ON subjects
  FOR EACH ROW
  EXECUTE FUNCTION update_tutor_embedding();

-- =====================================================
-- ROW LEVEL SECURITY
-- =====================================================
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE tutor_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE subjects ENABLE ROW LEVEL SECURITY;
ALTER TABLE schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read users" ON users FOR SELECT USING (true);
CREATE POLICY "Public read tutor_profiles" ON tutor_profiles FOR SELECT USING (true);
CREATE POLICY "Public read subjects" ON subjects FOR SELECT USING (true);
CREATE POLICY "Public read schedules" ON schedules FOR SELECT USING (true);
CREATE POLICY "Anyone can create bookings" ON bookings FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can view bookings" ON bookings FOR SELECT USING (true);
CREATE POLICY "Anyone can update bookings" ON bookings FOR UPDATE USING (true);

-- =====================================================
-- DỮ LIỆU MẪU
-- =====================================================

-- Students
INSERT INTO users (name, email, password, role, preferred_subjects, subject_embedding) VALUES
('Nguyễn Văn A', 'student1@test.com', '$2a$10$demo.hashed.password', 'student', 
  '["Toán", "Lý"]'::jsonb, 
  simple_subject_embedding(ARRAY['Toán', 'Lý'])),
('Trần Thị B', 'student2@test.com', '$2a$10$demo.hashed.password', 'student', 
  '["Anh văn", "Hóa"]'::jsonb,
  simple_subject_embedding(ARRAY['Anh văn', 'Hóa'])),
('Lê Văn C', 'student3@test.com', '$2a$10$demo.hashed.password', 'student',
  '["Toán", "Anh văn"]'::jsonb,
  simple_subject_embedding(ARRAY['Toán', 'Anh văn']));

-- Tutors
INSERT INTO users (name, email, password, role) VALUES
('Gia sư Phương', 'tutor1@test.com', '$2a$10$demo.hashed.password', 'tutor'),
('Gia sư Minh', 'tutor2@test.com', '$2a$10$demo.hashed.password', 'tutor'),
('Gia sư Lan', 'tutor3@test.com', '$2a$10$demo.hashed.password', 'tutor');

-- Tutor profiles và subjects
DO $$
DECLARE
  tutor1_uid UUID;
  tutor2_uid UUID;
  tutor3_uid UUID;
  tutor1_pid UUID;
  tutor2_pid UUID;
  tutor3_pid UUID;
BEGIN
  SELECT id INTO tutor1_uid FROM users WHERE email = 'tutor1@test.com';
  SELECT id INTO tutor2_uid FROM users WHERE email = 'tutor2@test.com';
  SELECT id INTO tutor3_uid FROM users WHERE email = 'tutor3@test.com';

  -- Tutor 1: Toán, Lý
  INSERT INTO tutor_profiles (user_id, bio, hourly_rate, subject_embedding) VALUES
  (tutor1_uid, 'Giáo viên Toán - Lý có 5 năm kinh nghiệm', 150000,
   simple_subject_embedding(ARRAY['Toán', 'Lý']))
  RETURNING id INTO tutor1_pid;

  INSERT INTO subjects (tutor_id, name, level) VALUES
  (tutor1_pid, 'Toán', 'THPT'),
  (tutor1_pid, 'Lý', 'THPT'),
  (tutor1_pid, 'Toán', 'THCS');

  INSERT INTO schedules (tutor_id, day_of_week, start_time, end_time) VALUES
  (tutor1_pid, 'Thứ 2', '18:00', '20:00'),
  (tutor1_pid, 'Thứ 4', '18:00', '20:00'),
  (tutor1_pid, 'Thứ 6', '18:00', '20:00');

  -- Tutor 2: Anh văn
  INSERT INTO tutor_profiles (user_id, bio, hourly_rate, subject_embedding) VALUES
  (tutor2_uid, 'Chuyên gia Anh văn - IELTS 8.0', 200000,
   simple_subject_embedding(ARRAY['Anh văn']))
  RETURNING id INTO tutor2_pid;

  INSERT INTO subjects (tutor_id, name, level) VALUES
  (tutor2_pid, 'Anh văn', 'THPT'),
  (tutor2_pid, 'Anh văn', 'THCS'),
  (tutor2_pid, 'Anh văn', 'Đại học');

  INSERT INTO schedules (tutor_id, day_of_week, start_time, end_time) VALUES
  (tutor2_pid, 'Thứ 3', '19:00', '21:00'),
  (tutor2_pid, 'Thứ 5', '19:00', '21:00'),
  (tutor2_pid, 'Thứ 7', '14:00', '16:00');

  -- Tutor 3: Hóa, Sinh
  INSERT INTO tutor_profiles (user_id, bio, hourly_rate, subject_embedding) VALUES
  (tutor3_uid, 'Giáo viên Hóa - Sinh học tại trường THPT', 120000,
   simple_subject_embedding(ARRAY['Hóa', 'Sinh']))
  RETURNING id INTO tutor3_pid;

  INSERT INTO subjects (tutor_id, name, level) VALUES
  (tutor3_pid, 'Hóa', 'THPT'),
  (tutor3_pid, 'Sinh', 'THPT');

  INSERT INTO schedules (tutor_id, day_of_week, start_time, end_time) VALUES
  (tutor3_pid, 'Thứ 2', '17:00', '19:00'),
  (tutor3_pid, 'Thứ 4', '17:00', '19:00'),
  (tutor3_pid, 'Chủ nhật', '09:00', '11:00');
END $$;

-- =====================================================
-- TEST COSINE SIMILARITY
-- =====================================================
SELECT '=== TEST: Gợi ý cho Student 1 (Toán, Lý) ===' as test;
SELECT 
  name,
  hourly_rate,
  similarity_score,
  subjects
FROM get_recommended_tutors(
  (SELECT subject_embedding FROM users WHERE email = 'student1@test.com')
);

-- =====================================================
-- THỐNG KÊ
-- =====================================================
SELECT '✅ Database đã được tạo thành công!' as status;
SELECT COUNT(*) || ' users' as info FROM users;
SELECT COUNT(*) || ' tutors' as info FROM tutor_profiles;
SELECT COUNT(*) || ' môn học' as info FROM subjects;
SELECT COUNT(*) || ' lịch dạy' as info FROM schedules;
