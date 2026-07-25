const axios = require('axios');

async function testTutorLogin() {
  try {
    console.log('🧪 Testing tutor login...');
    
    // Test với tài khoản gia sư mẫu từ seed
    const response = await axios.post('http://localhost:5000/api/auth/login', {
      email: 'long.nguyen@tutor.com',
      password: 'password123'
    }, {
      headers: {
        'Content-Type': 'application/json'
      }
    });
    
    console.log('✅ Login successful!');
    console.log('Response data:', response.data);
    
    if (response.data.user && response.data.user.role === 'tutor') {
      console.log('✅ Role is correctly set to "tutor"');
    } else {
      console.log('❌ Role is NOT "tutor":', response.data.user?.role);
    }
    
    // Test API profile/me với token
    const token = response.data.token;
    console.log('\n🔑 Testing /api/tutors/profile/me with token...');
    
    try {
      const profileResponse = await axios.get('http://localhost:5000/api/tutors/profile/me', {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      
      console.log('✅ /api/tutors/profile/me successful!');
      console.log('Profile data:', profileResponse.data);
    } catch (profileError) {
      console.log('❌ /api/tutors/profile/me failed:', profileError.response?.status, profileError.response?.data);
    }
    
  } catch (error) {
    console.log('❌ Login failed:');
    if (error.response) {
      console.log('Status:', error.response.status);
      console.log('Data:', error.response.data);
    } else {
      console.log('Error:', error.message);
    }
  }
}

testTutorLogin();