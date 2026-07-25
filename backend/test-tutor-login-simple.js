const http = require('http');

function testTutorLogin() {
  console.log('🧪 Testing tutor login...');
  
  const postData = JSON.stringify({
    email: 'long.nguyen@tutor.com',
    password: 'password123'
  });
  
  const options = {
    hostname: 'localhost',
    port: 5000,
    path: '/api/auth/login',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(postData)
    }
  };
  
  const req = http.request(options, (res) => {
    console.log(`Status: ${res.statusCode}`);
    
    let data = '';
    res.on('data', (chunk) => {
      data += chunk;
    });
    
    res.on('end', () => {
      try {
        const result = JSON.parse(data);
        console.log('Response:', result);
        
        if (res.statusCode === 200) {
          console.log('✅ Login successful!');
          
          if (result.user && result.user.role === 'tutor') {
            console.log('✅ Role is correctly set to "tutor"');
            
            // Test profile/me with the token
            if (result.token) {
              testTutorProfile(result.token);
            }
          } else {
            console.log('❌ Role is NOT "tutor":', result.user?.role);
          }
        } else {
          console.log('❌ Login failed:', result.error);
        }
      } catch (e) {
        console.log('❌ Parse error:', e.message);
        console.log('Raw data:', data);
      }
    });
  });
  
  req.on('error', (e) => {
    console.log('❌ Request error:', e.message);
  });
  
  req.write(postData);
  req.end();
}

function testTutorProfile(token) {
  console.log('\n🔑 Testing /api/tutors/profile/me with token...');
  
  const options = {
    hostname: 'localhost',
    port: 5000,
    path: '/api/tutors/profile/me',
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    }
  };
  
  const req = http.request(options, (res) => {
    console.log(`Profile Status: ${res.statusCode}`);
    
    let data = '';
    res.on('data', (chunk) => {
      data += chunk;
    });
    
    res.on('end', () => {
      try {
        if (res.statusCode === 200) {
          const result = JSON.parse(data);
          console.log('✅ /api/tutors/profile/me successful!');
          console.log('Profile data available');
        } else {
          const result = JSON.parse(data);
          console.log('❌ /api/tutors/profile/me failed:', result.error);
        }
      } catch (e) {
        console.log('❌ Parse error:', e.message);
        console.log('Raw data:', data);
      }
    });
  });
  
  req.on('error', (e) => {
    console.log('❌ Profile request error:', e.message);
  });
  
  req.end();
}

// Test với các tài khoản khác
function testMultipleLogins() {
  console.log('\n🧪 Testing multiple tutor logins...');
  
  const testAccounts = [
    { email: 'long.nguyen@tutor.com', name: 'Tutor 1' },
    { email: 'thu.pham@tutor.com', name: 'Tutor 2' },
    { email: 'duc.le@tutor.com', name: 'Tutor 3' }
  ];
  
  testAccounts.forEach(account => {
    console.log(`\nTesting ${account.name} (${account.email})...`);
    
    const postData = JSON.stringify({
      email: account.email,
      password: 'password123'
    });
    
    const req = http.request({
      hostname: 'localhost',
      port: 5000,
      path: '/api/auth/login',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        try {
          const result = JSON.parse(data);
          if (res.statusCode === 200) {
            console.log(`✅ ${account.name}: Login successful, role=${result.user?.role}`);
          } else {
            console.log(`❌ ${account.name}: Login failed - ${result.error}`);
          }
        } catch (e) {
          console.log(`❌ ${account.name}: Parse error`);
        }
      });
    });
    
    req.on('error', (e) => {
      console.log(`❌ ${account.name}: Request error`);
    });
    
    req.write(postData);
    req.end();
  });
}

// Run tests
testTutorLogin();

// Wait a bit then run multiple tests
setTimeout(testMultipleLogins, 2000);