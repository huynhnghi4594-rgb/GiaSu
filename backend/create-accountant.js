const { supabaseAdmin } = require('./config/supabase');
const bcrypt = require('bcryptjs');

async function main() {
  const hash = await bcrypt.hash('admin123', 10);
  
  console.log('👉 Đang chèn tài khoản accountant (lưu dưới dạng role student trong DB)...');
  
  const { data, error } = await supabaseAdmin
    .from('users')
    .insert({
      name: 'Kế toán hệ thống',
      email: 'accountant',
      password: hash,
      role: 'student' // Bypass CHECK constraint of PostgreSQL
    })
    .select()
    .single();
    
  if (error) {
    if (error.message.includes('unique')) {
      console.log('⚠️ Tài khoản accountant đã tồn tại trong database.');
    } else {
      console.error('❌ Lỗi:', error.message || error);
    }
  } else {
    console.log('✅ Tạo tài khoản accountant thành công!', data);
  }
  process.exit(0);
}

main();
