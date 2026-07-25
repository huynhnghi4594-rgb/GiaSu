const { supabaseAdmin } = require('./config/supabase');

async function checkDatabaseStructure() {
  console.log('🔍 Checking database structure...\n');
  
  try {
    // Check users table columns
    console.log('1. Checking users table...');
    const { data: userData, error: userError } = await supabaseAdmin
      .from('users')
      .select('*')
      .limit(1);
    
    if (userError) {
      console.log('❌ Error checking users table:', userError.message);
    } else {
      console.log('✅ Users table accessible');
      if (userData && userData.length > 0) {
        const user = userData[0];
        console.log('   Sample user columns:', Object.keys(user));
        console.log('   Has verification_status?', 'verification_status' in user);
        console.log('   Current verification_status:', user.verification_status);
      }
    }
    
    // Check tutor_profiles
    console.log('\n2. Checking tutor_profiles table...');
    const { data: tutorData, error: tutorError } = await supabaseAdmin
      .from('tutor_profiles')
      .select('*')
      .limit(1);
    
    if (tutorError) {
      console.log('❌ Error checking tutor_profiles:', tutorError.message);
    } else {
      console.log('✅ Tutor_profiles table accessible');
    }
    
    // Check if migration needs to be run
    console.log('\n3. Checking if migration needed...');
    
    // Try to select verification_status specifically
    const { error: verificationError } = await supabaseAdmin
      .from('users')
      .select('verification_status')
      .limit(1);
    
    if (verificationError && verificationError.code === '42703') {
      console.log('⚠️ verification_status column does NOT exist - migration required');
      console.log('   Error details:', verificationError.message);
    } else if (verificationError) {
      console.log('❌ Other error:', verificationError.message);
    } else {
      console.log('✅ verification_status column exists');
    }
    
    // Check wallets table
    console.log('\n4. Checking wallets table...');
    const { error: walletsError } = await supabaseAdmin
      .from('wallets')
      .select('*')
      .limit(1);
    
    if (walletsError) {
      if (walletsError.code === '42P01') {
        console.log('⚠️ wallets table does NOT exist - migration required');
      } else {
        console.log('❌ Error checking wallets:', walletsError.message);
      }
    } else {
      console.log('✅ Wallets table exists');
    }
    
    console.log('\n🎯 Summary:');
    console.log('- Cần chạy migration để thêm verification_status vào users');
    console.log('- Cần chạy migration để tạo bảng wallets');
    
  } catch (error) {
    console.error('❌ Unexpected error:', error);
  }
}

checkDatabaseStructure();