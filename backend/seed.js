const { supabaseAdmin } = require('./config/supabase');
const bcrypt = require('bcryptjs');

const tutorsData = [
  {
    name: 'Nguyễn Hải Long',
    email: 'long.nguyen@tutor.com',
    bio: 'Thủ khoa khối A Đại học Bách Khoa Hà Nội. Có 4 năm kinh nghiệm luyện thi đại học môn Toán, Lý và giảng dạy lập trình C/C++/Python cơ bản.',
    hourly_rate: 250000,
    subjects: [
      { name: 'Toán', level: 'THPT' },
      { name: 'Lý', level: 'THPT' },
      { name: 'Tin học', level: 'Đại học' }
    ],
    schedules: [
      { day_of_week: 'Thứ 3', start_time: '18:00', end_time: '20:00' },
      { day_of_week: 'Thứ 5', start_time: '18:00', end_time: '20:00' },
      { day_of_week: 'Chủ nhật', start_time: '09:00', end_time: '11:00' }
    ]
  },
  {
    name: 'Phạm Minh Thư',
    email: 'thu.pham@tutor.com',
    bio: 'Tốt nghiệp Đại học Ngoại Thương Hà Nội, chứng chỉ IELTS 8.5. Chuyên giảng dạy tiếng Anh giao tiếp, Tiếng Anh ôn thi tốt nghiệp THPT và ôn luyện chứng chỉ IELTS/TOEIC.',
    hourly_rate: 300000,
    subjects: [
      { name: 'Anh văn', level: 'THPT' },
      { name: 'Anh văn', level: 'Người đi làm' },
      { name: 'Anh văn', level: 'Đại học' }
    ],
    schedules: [
      { day_of_week: 'Thứ 2', start_time: '19:30', end_time: '21:30' },
      { day_of_week: 'Thứ 4', start_time: '19:30', end_time: '21:30' },
      { day_of_week: 'Thứ 7', start_time: '15:00', end_time: '17:00' }
    ]
  },
  {
    name: 'Lê Minh Đức',
    email: 'duc.le@tutor.com',
    bio: 'Thạc sĩ chuyên ngành Hóa học hữu cơ tại Pháp. Đã có kinh nghiệm dạy học sinh thi học sinh giỏi cấp Thành phố môn Hóa & Sinh.',
    hourly_rate: 220000,
    subjects: [
      { name: 'Hóa', level: 'THPT' },
      { name: 'Sinh', level: 'THPT' },
      { name: 'Hóa', level: 'THCS' }
    ],
    schedules: [
      { day_of_week: 'Thứ 2', start_time: '17:30', end_time: '19:30' },
      { day_of_week: 'Thứ 6', start_time: '17:30', end_time: '19:30' }
    ]
  },
  {
    name: 'Hoàng Khánh Vy',
    email: 'vy.hoang@tutor.com',
    bio: 'Giáo viên Toán & Khoa học THCS Đoàn Thị Điểm. Nhiệt tình, thân thiện, nắm vững phương pháp giảng dạy giúp học sinh trung bình lấy lại căn bản.',
    hourly_rate: 180000,
    subjects: [
      { name: 'Toán', level: 'Tiểu học' },
      { name: 'Toán', level: 'THCS' }
    ],
    schedules: [
      { day_of_week: 'Thứ 3', start_time: '15:00', end_time: '17:00' },
      { day_of_week: 'Thứ 5', start_time: '15:00', end_time: '17:00' },
      { day_of_week: 'Thứ 7', start_time: '09:00', end_time: '11:00' }
    ]
  },
  {
    name: 'Phan Anh Tuấn',
    email: 'tuan.phan@tutor.com',
    bio: 'Thạc sĩ Văn học Việt Nam. Luyện thi môn Ngữ văn ôn thi lớp 10 chuyên và tốt nghiệp THPT Quốc gia với phương pháp tư duy sơ đồ tư duy.',
    hourly_rate: 200000,
    subjects: [
      { name: 'Văn', level: 'THPT' },
      { name: 'Văn', level: 'THCS' },
      { name: 'Sử', level: 'THPT' }
    ],
    schedules: [
      { day_of_week: 'Thứ 4', start_time: '18:00', end_time: '20:00' },
      { day_of_week: 'Thứ 6', start_time: '18:00', end_time: '20:00' },
      { day_of_week: 'Chủ nhật', start_time: '14:00', end_time: '16:00' }
    ]
  },
  {
    name: 'Đỗ Thùy Trang',
    email: 'trang.do@tutor.com',
    bio: 'Kỹ sư phần mềm đang làm việc tại VNG, cựu sinh viên Đại học Quốc gia. Dạy lập trình Scratch, Python căn bản cho học sinh và lập trình web cho sinh viên.',
    hourly_rate: 280000,
    subjects: [
      { name: 'Tin học', level: 'THCS' },
      { name: 'Tin học', level: 'THPT' },
      { name: 'Tin học', level: 'Đại học' }
    ],
    schedules: [
      { day_of_week: 'Thứ 3', start_time: '19:30', end_time: '21:30' },
      { day_of_week: 'Thứ 6', start_time: '19:30', end_time: '21:30' }
    ]
  },
  {
    name: 'Trần Quốc Bảo',
    email: 'bao.tran@tutor.com',
    bio: 'Sinh viên năm 3 khoa Sư phạm Toán - Lý trường ĐH Sư Phạm. Tận tâm, nhiệt tình, có 2 năm dạy kèm ôn thi tốt nghiệp THCS và THPT.',
    hourly_rate: 130000,
    subjects: [
      { name: 'Toán', level: 'THPT' },
      { name: 'Lý', level: 'THPT' },
      { name: 'Toán', level: 'THCS' }
    ],
    schedules: [
      { day_of_week: 'Thứ 2', start_time: '18:00', end_time: '20:00' },
      { day_of_week: 'Thứ 4', start_time: '18:00', end_time: '20:00' },
      { day_of_week: 'Thứ 7', start_time: '18:00', end_time: '20:00' }
    ]
  }
];

async function seed() {
  console.log('🏁 Bắt đầu seeding thêm dữ liệu 7 gia sư mới...');
  
  const passwordHash = await bcrypt.hash('password123', 10);
  
  for (const tutor of tutorsData) {
    try {
      console.log(`\n👉 Đang chèn gia sư: ${tutor.name} (${tutor.email})...`);
      
      // 1. Tạo user trong bảng users
      const { data: user, error: userError } = await supabaseAdmin
        .from('users')
        .insert({
          name: tutor.name,
          email: tutor.email,
          password: passwordHash,
          role: 'tutor'
        })
        .select()
        .single();
        
      if (userError) {
        if (userError.message.includes('unique')) {
          console.log(`⚠️ Email ${tutor.email} đã tồn tại trong hệ thống. Bỏ qua.`);
          continue;
        }
        throw userError;
      }
      
      console.log(`✅ Tạo user thành công. ID: ${user.id}`);
      
      // 2. Tạo profile gia sư trong bảng tutor_profiles
      const { data: profile, error: profileError } = await supabaseAdmin
        .from('tutor_profiles')
        .insert({
          user_id: user.id,
          bio: tutor.bio,
          hourly_rate: tutor.hourly_rate
        })
        .select()
        .single();
        
      if (profileError) throw profileError;
      console.log(`✅ Tạo profile thành công. Profile ID: ${profile.id}`);
      
      // 3. Tạo các môn dạy rảnh trong bảng subjects
      const subjectsToInsert = tutor.subjects.map(s => ({
        tutor_id: profile.id,
        name: s.name,
        level: s.level
      }));
      
      const { error: subjectsError } = await supabaseAdmin
        .from('subjects')
        .insert(subjectsToInsert);
        
      if (subjectsError) throw subjectsError;
      console.log(`✅ Đã chèn ${tutor.subjects.length} môn học giảng dạy.`);
      
      // 4. Tạo các khung lịch dạy rảnh trong bảng schedules
      const schedulesToInsert = tutor.schedules.map(sc => ({
        tutor_id: profile.id,
        day_of_week: sc.day_of_week,
        start_time: sc.start_time,
        end_time: sc.end_time
      }));
      
      const { error: schedulesError } = await supabaseAdmin
        .from('schedules')
        .insert(schedulesToInsert);
        
      if (schedulesError) throw schedulesError;
      console.log(`✅ Đã chèn ${tutor.schedules.length} khung lịch rảnh.`);
      
    } catch (err) {
      console.error(`❌ Lỗi khi xử lý gia sư ${tutor.name}:`, err.message || err);
    }
  }
  
  console.log('\n🎉 Quá trình seeding dữ liệu kết thúc!');
  process.exit(0);
}

seed();
