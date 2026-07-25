const { supabaseAdmin } = require('./config/supabase');

async function runSimpleMigration() {
  console.log('🚀 Running simplified migration...\n');
  
  try {
    console.log('1. Checking current database structure...');
    
    // Kiểm tra cột verification_status
    const { error: checkError } = await supabaseAdmin
      .from('users')
      .select('verification_status')
      .limit(1);
    
    if (checkError && checkError.code === '42703') {
      console.log('❌ verification_status column does not exist');
      console.log('⚠️ CẦN CHẠY SQL MIGRATION TRÊN SUPABASE TRỰC TIẾP');
    } else {
      console.log('✅ verification_status column exists');
    }
    
    // Kiểm tra bảng wallets
    const { error: walletsError } = await supabaseAdmin
      .from('wallets')
      .select('*')
      .limit(1);
    
    if (walletsError && walletsError.code === '42P01') {
      console.log('❌ wallets table does not exist');
      console.log('⚠️ CẦN CHẠY SQL MIGRATION TRÊN SUPABASE TRỰC TIẾP');
    } else {
      console.log('✅ wallets table exists');
    }
    
    console.log('\n🎯 HƯỚNG DẪN:');
    console.log('1. Vào Supabase Dashboard (https://supabase.com/dashboard)');
    console.log('2. Chọn project TutorMatch');
    console.log('3. Vào SQL Editor');
    console.log('4. Chạy migration-restructure.sql');
    console.log('\n📋 SQL Migration có sẵn tại: backend/migration-restructure.sql');
    
  } catch (error) {
    console.error('❌ Migration check failed:', error);
  }
}

runSimpleMigration();