const { supabaseAdmin } = require('./config/supabase');
const bcrypt = require('bcryptjs');

async function checkOrCreateStudentAccount() {
  console.log('👨‍🎓 Kiểm tra/ tạo tài khoản student mẫu...\n');
  
  const studentEmail = 'student@test.com';
  const studentPassword = 'password123';
  
  try {
    // Check if student exists
    const { data: existingStudent, error } = await supabaseAdmin
      .from('users')
      .select('*')
      .eq('email', studentEmail)
      .single();
    
    if (error && error.code === 'PGRST116') {
      // Student doesn't exist, create one
      console.log('📝 Tài khoản student không tồn tại, đang tạo...');
      
      const hashedPassword = await bcrypt.hash(studentPassword, 10);
      
      const { data: newStudent, error: createError } = await supabaseAdmin
        .from('users')
        .insert({
          name: 'Học Sinh Mẫu',
          email: studentEmail,
          password: hashedPassword,
          role: 'student',
          verification_status: 'verified', // Students auto-verified
          preferred_subjects: ['Toán', 'Lý', 'Hóa']
        })
        .select()
        .single();
      
      if (createError) {
        console.log('❌ Lỗi tạo student:', createError.message);
        return;
      }
      
      console.log('✅ Đã tạo tài khoản student:');
      console.log(`   ID: ${newStudent.id}`);
      console.log(`   Email: ${newStudent.email}`);
      console.log(`   Role: ${newStudent.role}`);
      console.log(`   Password: ${studentPassword}`);
      
    } else if (error) {
      console.log('❌ Lỗi kiểm tra student:', error.message);
    } else {
      console.log('✅ Tài khoản student đã tồn tại:');
      console.log(`   ID: ${existingStudent.id}`);
      console.log(`   Email: ${existingStudent.email}`);
      console.log(`   Role: ${existingStudent.role}`);
      console.log(`   Verification: ${existingStudent.verification_status}`);
      
      // Update verification_status if needed
      if (!existingStudent.verification_status) {
        console.log('🔄 Cập nhật verification_status...');
        await supabaseAdmin
          .from('users')
          .update({ verification_status: 'verified' })
          .eq('id', existingStudent.id);
      }
    }
    
    // Test login
    console.log('\n🔐 Testing login...');
    const http = require('http');
    
    const response = await new Promise((resolve, reject) => {
      const req = http.request({
        hostname: 'localhost',
        port: 5000,
        path: '/api/auth/login',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      }, (res) => {
        let data = '';
        res.on('data', (chunk) => data += chunk);
        res.on('end', () => resolve({ status: res.statusCode, data: JSON.parse(data || '{}') }));
      });
      
      req.on('error', reject);
      req.write(JSON.stringify({
        email: studentEmail,
        password: studentPassword
      }));
      req.end();
    });
    
    if (response.status === 200) {
      console.log('✅ Student login successful!');
      console.log(`   Token received: ${response.data.token.substring(0, 50)}...`);
      console.log(`   User role: ${response.data.user.role}`);
      console.log(`   Verification: ${response.data.user.verification_status}`);
    } else {
      console.log(`❌ Login failed: Status ${response.status}`);
      console.log(`   Error: ${response.data.error}`);
    }
    
  } catch (error) {
    console.error('❌ Unexpected error:', error);
  }
}

checkOrCreateStudentAccount();