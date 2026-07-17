require('dotenv').config();
const { supabaseAdmin } = require('./config/supabase');
const bcrypt = require('bcryptjs');

async function test() {
  try {
    const hashed = await bcrypt.hash('testpass123', 10);
    console.log('Inserting test user...');
    const { data, error } = await supabaseAdmin
      .from('users')
      .insert({
        name: 'Test Admin Create',
        email: 'test_admin_create@example.com',
        password: hashed,
        role: 'student'
      })
      .select()
      .single();
      
    if (error) {
      console.error('❌ Insert Error:', error);
    } else {
      console.log('✅ Insert Success:', data);
      // Clean up
      await supabaseAdmin.from('users').delete().eq('id', data.id);
      console.log('🗑️ Cleaned up test user.');
    }
  } catch (err) {
    console.error('Catch error:', err);
  }
  process.exit(0);
}

test();
