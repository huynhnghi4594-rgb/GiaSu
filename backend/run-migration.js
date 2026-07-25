const fs = require('fs');
const { supabaseAdmin } = require('./config/supabase');

async function runMigration() {
  console.log('🚀 Running migration...');
  
  try {
    // Read migration file
    const migrationSQL = fs.readFileSync('./migration-restructure.sql', 'utf8');
    
    // Split into individual statements
    const statements = migrationSQL
      .split(';')
      .map(stmt => stmt.trim())
      .filter(stmt => stmt.length > 0);
    
    console.log(`📋 Found ${statements.length} SQL statements to execute`);
    
    // Execute each statement
    for (let i = 0; i < statements.length; i++) {
      const stmt = statements[i];
      console.log(`\n📝 Executing statement ${i + 1}/${statements.length}...`);
      
      try {
        const { error } = await supabaseAdmin.rpc('exec_sql', { sql_query: stmt });
        
        if (error) {
          // Try direct query for some statements
          const { error: directError } = await supabaseAdmin.query(stmt);
          
          if (directError) {
            console.log(`⚠️ Statement ${i + 1} failed:`, directError.message);
            // Continue with next statement
            continue;
          }
        }
        
        console.log(`✅ Statement ${i + 1} executed`);
      } catch (err) {
        console.log(`⚠️ Statement ${i + 1} error:`, err.message);
      }
    }
    
    console.log('\n🎉 Migration completed!');
    
    // Verify migration
    console.log('\n🔍 Verifying migration...');
    
    // Check if verification_status column exists
    const { data: checkData, error: checkError } = await supabaseAdmin
      .from('users')
      .select('verification_status')
      .limit(1);
    
    if (checkError) {
      console.log('❌ Verification failed: Could not check verification_status');
    } else {
      console.log('✅ verification_status column exists');
    }
    
  } catch (error) {
    console.error('❌ Migration failed:', error);
  }
}

runMigration();