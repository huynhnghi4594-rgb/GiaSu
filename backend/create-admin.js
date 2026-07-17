const { supabaseAdmin } = require('./config/supabase');
const bcrypt = require('bcryptjs');

async function main() {
  const hash = await bcrypt.hash('admin123', 10);
  
  console.log('👉 Đang chèn tài khoản admin (lưu dưới dạng role student trong DB)...');
  
  const { data, error } = await supabaseAdmin
    .from('users')
    .insert({
      name: 'Admin',
      email: 'admin',
      password: hash,
      role: 'student' // Bypass CHECK constraint of PostgreSQL
    })
    .select()
    .single();
    
  if (error) {
    if (error.message.includes('unique')) {
      console.log('⚠️ Tài khoản admin đã tồn tại trong database.');
    } else {
      console.error('❌ Lỗi:', error.message || error);
    }
  } else {
    console.log('✅ Tạo tài khoản admin thành công!', data);
  }
  process.exit(0);
}

main();
