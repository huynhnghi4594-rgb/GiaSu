# Implementation Plan

## Exploration & Preservation Tests (BEFORE Implementation)

- [ ] 1. Write bug condition exploration tests (BEFORE implementing fix)
  - **Property 1: Bug Condition** - Missing Preferred Subjects and Recommendations
  - **CRITICAL**: These tests MUST FAIL on unfixed code - failure confirms the bugs exist
  - **DO NOT attempt to fix the tests or the code when they fail**
  - **NOTE**: These tests encode the expected behavior - they will validate the fix when they pass after implementation
  - **GOAL**: Surface counterexamples that demonstrate the bugs exist
  - Write test for missing preferred_subjects collection during registration
  - Write test for missing recommendations endpoint
  - Write test for missing advanced search filters (price, day_of_week)
  - Write test for missing sorting functionality
  - Run tests on UNFIXED code
  - **EXPECTED OUTCOME**: Tests FAIL (this is correct - it proves the bugs exist)
  - Document counterexamples found to understand root cause
  - Mark task complete when tests are written, run, and failures are documented
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7_

- [ ] 2. Write preservation property tests (BEFORE implementing fix)
  - **Property 2: Preservation** - Existing Features Unchanged
  - **IMPORTANT**: Follow observation-first methodology
  - Observe behavior on UNFIXED code for non-buggy inputs:
    - Test login flow (POST /api/auth/login)
    - Test tutor registration (POST /api/auth/register with role="tutor")
    - Test booking flow (POST /api/bookings, GET /api/bookings/my, GET /api/bookings/incoming)
    - Test tutor profile management (PUT /api/tutors/profile, POST/DELETE subjects and schedules)
    - Test basic search without advanced filters (GET /api/tutors/search)
    - Test unauthenticated access to search page
  - Write property-based tests capturing observed behavior patterns from Preservation Requirements
  - Property-based testing generates many test cases for stronger guarantees
  - Run tests on UNFIXED code
  - **EXPECTED OUTCOME**: Tests PASS (this confirms baseline behavior to preserve)
  - Mark task complete when tests are written, run, and passing on unfixed code
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7_

## Implementation

- [ ] 3. Database Migration - Add preferred_subjects column

  - [ ] 3.1 Add migration for preferred_subjects column in users table
    - Open `tutor-finder/database.js`
    - In `db.serialize()` callback, add ALTER TABLE statement after existing CREATE TABLE statements
    - Add migration with error handling for duplicate column:
      ```javascript
      db.run(`ALTER TABLE users ADD COLUMN preferred_subjects TEXT DEFAULT NULL`, (err) => {
        if (err && !err.message.includes('duplicate column')) {
          console.error('Migration error:', err);
        }
      });
      ```
    - Column stores JSON string array (e.g., `'["Toán","Anh văn"]'`)
    - Only applies to role='student' (NULL for tutors)
    - _Bug_Condition: Student registration where preferred_subjects cannot be stored_
    - _Expected_Behavior: preferred_subjects stored as JSON in database_
    - _Preservation: Existing users table structure unchanged, no impact on existing data_
    - _Requirements: 2.1_

  - [ ] 3.2 Verify migration runs without errors
    - Restart server to trigger migration
    - Check database schema includes preferred_subjects column
    - Verify existing users are not affected
    - Test migration idempotency (run twice, no errors)
    - _Requirements: 2.1_

- [ ] 4. Backend API - Update Student Registration

  - [ ] 4.1 Update POST /api/auth/register to accept preferred_subjects
    - Open `tutor-finder/routes/auth.js`
    - In `POST /register` handler, destructure preferred_subjects from req.body:
      ```javascript
      const { name, email, password, role, preferred_subjects } = req.body;
      ```
    - Validate preferred_subjects is array if provided (optional parameter)
    - Convert array to JSON string for storage: `JSON.stringify(preferred_subjects)`
    - Modify INSERT query to include preferred_subjects when role='student':
      ```javascript
      if (role === 'student' && preferred_subjects && preferred_subjects.length > 0) {
        const subjectsJson = JSON.stringify(preferred_subjects);
        const result = await db.runAsync(
          'INSERT INTO users (name, email, password, role, preferred_subjects) VALUES (?, ?, ?, ?, ?)',
          [name, email, hashed, role, subjectsJson]
        );
      } else {
        const result = await db.runAsync(
          'INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)',
          [name, email, hashed, role]
        );
      }
      ```
    - _Bug_Condition: isBugCondition(input) where input.action=="register" AND input.userRole=="student"_
    - _Expected_Behavior: System stores preferred_subjects in database for students_
    - _Preservation: Tutor registration flow unchanged (no preferred_subjects), existing registration validation unchanged_
    - _Requirements: 2.1, 3.5_

  - [ ] 4.2 Write unit tests for registration with preferred_subjects
    - Test student registration WITH preferred_subjects array
    - Test student registration WITHOUT preferred_subjects (should work)
    - Test tutor registration (should ignore preferred_subjects)
    - Test invalid preferred_subjects format (not array)
    - Verify database stores JSON string correctly
    - _Requirements: 2.1_

- [ ] 5. Backend API - Create Recommendations Endpoint

  - [ ] 5.1 Implement GET /api/tutors/recommendations endpoint
    - Open `tutor-finder/routes/tutors.js`
    - Add new route BEFORE existing routes (to avoid route conflicts):
      ```javascript
      router.get('/recommendations', authenticate, requireRole('student'), async (req, res) => {
        // 1. Get student's preferred subjects
        const user = await db.getAsync('SELECT preferred_subjects FROM users WHERE id = ?', [req.user.id]);
        if (!user || !user.preferred_subjects) {
          return res.json([]); // Return empty if no preferences
        }
        const preferences = JSON.parse(user.preferred_subjects);
        
        // 2. Query tutors with matching subjects (prioritized) + other tutors
        const placeholders = preferences.map(() => '?').join(',');
        const query = `
          SELECT u.id, u.name, tp.bio, tp.hourly_rate,
                 GROUP_CONCAT(DISTINCT s.name || ' (' || s.level || ')') as subjects,
                 CASE 
                   WHEN s.name IN (${placeholders}) THEN 1 
                   ELSE 0 
                 END as is_match
          FROM users u
          JOIN tutor_profiles tp ON u.id = tp.user_id
          JOIN subjects s ON tp.id = s.tutor_id
          GROUP BY u.id
          ORDER BY is_match DESC, tp.hourly_rate ASC
          LIMIT 10
        `;
        const tutors = await db.allAsync(query, preferences);
        res.json(tutors);
      });
      ```
    - Endpoint requires authentication and student role
    - Returns empty array if student has no preferred_subjects
    - Prioritizes tutors teaching preferred subjects (is_match=1)
    - Orders by match status DESC, then hourly_rate ASC
    - Limits to 10 tutors
    - _Bug_Condition: isBugCondition(input) where input.action=="viewDashboard" AND input.userRole=="student"_
    - _Expected_Behavior: System displays personalized tutor recommendations based on preferred_subjects_
    - _Preservation: Existing routes unchanged, no impact on search or profile endpoints_
    - _Requirements: 2.2, 2.7_

  - [ ] 5.2 Write unit tests for recommendations endpoint
    - Test student WITH preferred_subjects gets prioritized tutors
    - Test student WITHOUT preferred_subjects gets empty array
    - Test tutor role cannot access endpoint (403)
    - Test unauthenticated request returns 401
    - Test recommendation algorithm prioritizes matching subjects
    - Test limit of 10 tutors enforced
    - Verify secondary sorting by hourly_rate ASC
    - _Requirements: 2.2, 2.7_

- [ ] 6. Backend API - Enhance Search Endpoint with Advanced Filters

  - [ ] 6.1 Update GET /api/tutors/search to accept advanced filters
    - Open `tutor-finder/routes/tutors.js`
    - In `GET /search` handler, extract new query parameters:
      ```javascript
      const { subject, level, min_price, max_price, day_of_week, sort_by, order } = req.query;
      ```
    - Modify SQL query to include LEFT JOIN with schedules table:
      ```javascript
      let query = `
        SELECT DISTINCT u.id, u.name, tp.bio, tp.hourly_rate,
               GROUP_CONCAT(DISTINCT s.name || ' (' || s.level || ')') as subjects
        FROM users u
        JOIN tutor_profiles tp ON u.id = tp.user_id
        JOIN subjects s ON tp.id = s.tutor_id
        LEFT JOIN schedules sc ON tp.id = sc.tutor_id
        WHERE 1=1
      `;
      const params = [];
      ```
    - Add WHERE clauses for new filters:
      ```javascript
      if (subject) { query += ' AND s.name LIKE ?'; params.push(`%${subject}%`); }
      if (level) { query += ' AND s.level = ?'; params.push(level); }
      if (min_price) { query += ' AND tp.hourly_rate >= ?'; params.push(parseInt(min_price)); }
      if (max_price) { query += ' AND tp.hourly_rate <= ?'; params.push(parseInt(max_price)); }
      if (day_of_week) { query += ' AND sc.day_of_week = ?'; params.push(day_of_week); }
      
      query += ' GROUP BY u.id';
      ```
    - Add ORDER BY clause for sorting:
      ```javascript
      if (sort_by === 'price') {
        query += ` ORDER BY tp.hourly_rate ${order === 'desc' ? 'DESC' : 'ASC'}`;
      } else {
        query += ` ORDER BY tp.hourly_rate ASC`; // Default sorting
      }
      ```
    - _Bug_Condition: isBugCondition(input) where input.action=="searchTutors" AND NOT canFilterByPrice AND NOT canFilterByAvailability AND NOT canSortResults_
    - _Expected_Behavior: System filters by price range, day_of_week, and sorts results as requested_
    - _Preservation: Search without filters returns all tutors (existing behavior), basic subject/level filters still work_
    - _Requirements: 2.3, 2.4, 2.5, 2.6, 3.1_

  - [ ] 6.2 Write unit tests for advanced search filters
    - Test min_price filter only
    - Test max_price filter only
    - Test min_price AND max_price together
    - Test day_of_week filter (verify JOIN with schedules)
    - Test combinations: subject + price + day_of_week
    - Test sorting by price ASC
    - Test sorting by price DESC
    - Test search with NO filters (should return all tutors)
    - Test search with only basic filters (subject/level) - preservation
    - _Requirements: 2.3, 2.4, 2.5, 2.6, 3.1_

- [ ] 7. Frontend - Update Student Registration Form

  - [ ] 7.1 Add preferred subjects multi-select to register.html
    - Open `tutor-finder/public/register.html`
    - Add subject preferences section after role selection:
      ```html
      <div id="subjectPreferences" style="display:none">
        <label>Môn học cần tìm gia sư (chọn nhiều):</label>
        <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:8px;margin-bottom:12px">
          <label><input type="checkbox" name="preferredSubjects" value="Toán"> Toán</label>
          <label><input type="checkbox" name="preferredSubjects" value="Anh văn"> Anh văn</label>
          <label><input type="checkbox" name="preferredSubjects" value="Lý"> Vật lý</label>
          <label><input type="checkbox" name="preferredSubjects" value="Hóa"> Hóa học</label>
          <label><input type="checkbox" name="preferredSubjects" value="Văn"> Ngữ văn</label>
          <label><input type="checkbox" name="preferredSubjects" value="Sử"> Lịch sử</label>
        </div>
      </div>
      ```
    - Add event listener to show/hide based on role:
      ```javascript
      document.getElementById('role').addEventListener('change', (e) => {
        document.getElementById('subjectPreferences').style.display = 
          e.target.value === 'student' ? 'block' : 'none';
      });
      ```
    - _Bug_Condition: Registration form where hasPreferredSubjectsField() returns false_
    - _Expected_Behavior: Student sees and can select preferred subjects during registration_
    - _Preservation: Tutor registration form unchanged_
    - _Requirements: 2.1_

  - [ ] 7.2 Update register() function to collect and send preferred_subjects
    - In `register()` function, collect checked subjects:
      ```javascript
      const role = document.getElementById('role').value;
      const preferred_subjects = role === 'student' 
        ? Array.from(document.querySelectorAll('#subjectPreferences input[name="preferredSubjects"]:checked'))
            .map(cb => cb.value)
        : undefined;
      
      const body = { name, email, password, role };
      if (preferred_subjects && preferred_subjects.length > 0) {
        body.preferred_subjects = preferred_subjects;
      }
      
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      ```
    - Handle optional preferred_subjects (student may not select any)
    - Ensure array is sent to backend
    - _Requirements: 2.1_

  - [ ] 7.3 Test student registration flow end-to-end
    - Register student WITH selected subjects
    - Register student WITHOUT selecting subjects (should work)
    - Register tutor (preferences should not appear)
    - Verify database stores preferred_subjects correctly
    - Verify login after registration works
    - _Requirements: 2.1, 3.5_

- [ ] 8. Frontend - Add Recommendations Section to Student Dashboard

  - [ ] 8.1 Add recommendations UI to student-dashboard.html
    - Open `tutor-finder/public/student-dashboard.html`
    - Add recommendations section BEFORE "Lịch học của tôi":
      ```html
      <div class="card">
        <h2>⭐ Gia sư được đề xuất</h2>
        <div id="recommendationList"></div>
      </div>
      ```
    - Add CSS styles for tutor cards (if not exists):
      ```css
      .tutor-card {
        border: 1px solid #e5e7eb;
        border-radius: 8px;
        padding: 16px;
        margin-bottom: 12px;
      }
      .tag {
        display: inline-block;
        background: #dbeafe;
        color: #1e40af;
        padding: 4px 10px;
        border-radius: 4px;
        font-size: 0.85rem;
        margin-right: 6px;
      }
      ```
    - _Bug_Condition: Dashboard where hasRecommendationsSection() returns false_
    - _Expected_Behavior: Student sees recommendations section on dashboard_
    - _Preservation: Existing "Lịch học của tôi" section unchanged_
    - _Requirements: 2.2_

  - [ ] 8.2 Implement loadRecommendations() function
    - Add function to fetch and display recommendations:
      ```javascript
      async function loadRecommendations() {
        const token = localStorage.getItem('token');
        const res = await fetch('/api/tutors/recommendations', {
          headers: { 'Authorization': 'Bearer ' + token }
        });
        
        if (!res.ok) {
          console.error('Failed to load recommendations');
          return;
        }
        
        const tutors = await res.json();
        const el = document.getElementById('recommendationList');
        
        if (!tutors.length) {
          el.innerHTML = '<p style="color:#9ca3af;font-size:0.88rem">Chưa có đề xuất. Cập nhật môn học ưu tiên trong phần cài đặt.</p>';
          return;
        }
        
        el.innerHTML = tutors.map(t => `
          <div class="tutor-card">
            <h3>${t.name}</h3>
            <p>${t.bio || 'Chưa có giới thiệu'}</p>
            <p>💰 ${t.hourly_rate ? t.hourly_rate.toLocaleString() + ' đ/giờ' : 'Thỏa thuận'}</p>
            <div>${(t.subjects || '').split(',').map(s => '<span class="tag">' + s.trim() + '</span>').join('')}</div>
            <br>
            <a href="?book=${t.id}" style="background:#2563eb;color:white;padding:7px 16px;border-radius:7px;text-decoration:none;font-size:0.88rem;font-weight:600">
              Đặt lịch học
            </a>
          </div>
        `).join('');
      }
      ```
    - Call loadRecommendations() on page load (after authentication check)
    - Handle empty recommendations gracefully
    - Show tutor match indicator (prioritized tutors appear first)
    - _Requirements: 2.2, 2.7_

  - [ ] 8.3 Test recommendations display end-to-end
    - Login as student with preferred_subjects
    - Verify recommendations appear on dashboard
    - Verify matched tutors appear first (teach preferred subjects)
    - Verify empty state when no preferences
    - Verify "Đặt lịch học" button links correctly
    - Test with various screen sizes (responsive)
    - _Requirements: 2.2, 2.7_

- [ ] 9. Frontend - Add Advanced Search Filters to index.html

  - [ ] 9.1 Expand search form with price and availability filters
    - Open `tutor-finder/public/index.html`
    - Add new filter rows after existing subject/level filters:
      ```html
      <div class="form-row">
        <input type="text" id="searchSubject" placeholder="Môn học (VD: Toán, Anh văn...)">
        <select id="searchLevel">
          <option value="">-- Tất cả cấp độ --</option>
          <option value="Tiểu học">Tiểu học</option>
          <option value="THCS">THCS</option>
          <option value="THPT">THPT</option>
          <option value="Đại học">Đại học</option>
          <option value="Người đi làm">Người đi làm</option>
        </select>
      </div>
      <div class="form-row">
        <input type="number" id="minPrice" placeholder="Giá tối thiểu (đ/giờ)" min="0" step="10000">
        <input type="number" id="maxPrice" placeholder="Giá tối đa (đ/giờ)" min="0" step="10000">
        <select id="dayOfWeek">
          <option value="">-- Tất cả ngày --</option>
          <option value="Thứ 2">Thứ 2</option>
          <option value="Thứ 3">Thứ 3</option>
          <option value="Thứ 4">Thứ 4</option>
          <option value="Thứ 5">Thứ 5</option>
          <option value="Thứ 6">Thứ 6</option>
          <option value="Thứ 7">Thứ 7</option>
          <option value="Chủ nhật">Chủ nhật</option>
        </select>
      </div>
      ```
    - Add CSS for form-row if not exists:
      ```css
      .form-row {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
        gap: 12px;
        margin-bottom: 12px;
      }
      ```
    - _Bug_Condition: Search form where canFilterByPrice() and canFilterByAvailability() return false_
    - _Expected_Behavior: Search form includes price and day_of_week filters_
    - _Preservation: Existing subject/level filters unchanged_
    - _Requirements: 2.3, 2.4, 2.5_

  - [ ] 9.2 Add sorting controls to search form
    - Add sort row after filters:
      ```html
      <div class="form-row">
        <select id="sortBy">
          <option value="">Sắp xếp theo</option>
          <option value="price">Giá</option>
        </select>
        <select id="order">
          <option value="asc">Tăng dần</option>
          <option value="desc">Giảm dần</option>
        </select>
        <button class="btn-primary" onclick="searchTutors()">Tìm kiếm</button>
      </div>
      ```
    - _Bug_Condition: Search form where canSortResults() returns false_
    - _Expected_Behavior: Search form includes sorting controls_
    - _Requirements: 2.6_

  - [ ] 9.3 Update searchTutors() function to send all filter parameters
    - Modify `searchTutors()` to collect all filter values:
      ```javascript
      async function searchTutors() {
        const params = new URLSearchParams();
        
        const subject = document.getElementById('searchSubject').value;
        const level = document.getElementById('searchLevel').value;
        const minPrice = document.getElementById('minPrice').value;
        const maxPrice = document.getElementById('maxPrice').value;
        const dayOfWeek = document.getElementById('dayOfWeek').value;
        const sortBy = document.getElementById('sortBy').value;
        const order = document.getElementById('order').value;
        
        if (subject) params.append('subject', subject);
        if (level) params.append('level', level);
        if (minPrice) params.append('min_price', minPrice);
        if (maxPrice) params.append('max_price', maxPrice);
        if (dayOfWeek) params.append('day_of_week', dayOfWeek);
        if (sortBy) params.append('sort_by', sortBy);
        if (order && sortBy) params.append('order', order);
        
        const res = await fetch('/api/tutors/search?' + params);
        const tutors = await res.json();
        
        // ... existing rendering logic ...
      }
      ```
    - Ensure all parameters are optional (backward compatible)
    - _Requirements: 2.3, 2.4, 2.5, 2.6, 3.1_

  - [ ] 9.4 Test advanced search end-to-end
    - Test filter by price range only
    - Test filter by day_of_week only
    - Test filter by subject + price + day_of_week
    - Test sorting by price ASC
    - Test sorting by price DESC
    - Test search with NO filters (should show all tutors) - preservation
    - Test search with only basic filters - preservation
    - Test as unauthenticated user - preservation
    - Verify UI is responsive on mobile
    - _Requirements: 2.3, 2.4, 2.5, 2.6, 3.1, 3.6_

## Validation

- [ ] 10. Verify bug condition exploration tests now pass
  - **Property 1: Expected Behavior** - Preferred Subjects and Recommendations Working
  - **IMPORTANT**: Re-run the SAME tests from task 1 - do NOT write new tests
  - The tests from task 1 encode the expected behavior
  - When these tests pass, it confirms the expected behavior is satisfied
  - Re-run exploration tests from task 1:
    - Test preferred_subjects collection during registration
    - Test recommendations endpoint returns tutors
    - Test advanced search filters work (price, day_of_week)
    - Test sorting functionality works
  - **EXPECTED OUTCOME**: Tests PASS (confirms bugs are fixed)
  - Document any remaining issues found
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7_

- [ ] 11. Verify preservation tests still pass
  - **Property 2: Preservation** - Existing Features Unchanged
  - **IMPORTANT**: Re-run the SAME tests from task 2 - do NOT write new tests
  - Re-run preservation tests from task 2:
    - Login flow (POST /api/auth/login)
    - Tutor registration (POST /api/auth/register with role="tutor")
    - Booking flow (all endpoints)
    - Tutor profile management (all endpoints)
    - Basic search without advanced filters
    - Unauthenticated access
  - **EXPECTED OUTCOME**: Tests PASS (confirms no regressions)
  - Document any regressions found and fix before proceeding
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7_

- [ ] 12. Integration Tests

  - [ ] 12.1 Full student registration and recommendation flow
    - Register new student with preferred_subjects: ["Toán", "Anh văn"]
    - Login with new student account
    - Navigate to student-dashboard.html
    - Verify recommendations section displays tutors
    - Verify tutors teaching Toán or Anh văn appear first
    - Click "Đặt lịch học" on recommended tutor
    - Verify booking flow works (preservation)
    - _Requirements: 2.1, 2.2, 2.7, 3.2_

  - [ ] 12.2 Full advanced search flow
    - Navigate to index.html (unauthenticated)
    - Enter search criteria:
      - Subject: "Toán"
      - Level: "THPT"
      - Min price: 100000
      - Max price: 300000
      - Day: "Thứ 2"
      - Sort by: "price", order: "asc"
    - Submit search
    - Verify only tutors matching ALL criteria are displayed
    - Verify results are sorted by price ascending
    - Clear filters and search again
    - Verify all tutors are displayed (preservation)
    - _Requirements: 2.3, 2.4, 2.5, 2.6, 3.1, 3.6_

  - [ ] 12.3 Cross-user recommendation test
    - Register Student A with preferences: ["Toán"]
    - Register Student B with preferences: ["Hóa"]
    - Create Tutor X teaching "Toán"
    - Create Tutor Y teaching "Hóa"
    - Login as Student A
    - Verify recommendations prioritize Tutor X
    - Login as Student B
    - Verify recommendations prioritize Tutor Y
    - _Requirements: 2.2, 2.7_

  - [ ] 12.4 Migration and backward compatibility test
    - Backup database
    - Run server to trigger migration
    - Verify existing users can still login (preservation)
    - Create new student WITH preferred_subjects
    - Create new student WITHOUT preferred_subjects
    - Verify both can access dashboard
    - Verify student without preferences sees empty recommendations
    - _Requirements: 2.1, 3.5, 3.7_

  - [ ] 12.5 Edge cases and error handling
    - Test registration with empty preferred_subjects array
    - Test registration with invalid preferred_subjects format (non-array)
    - Test recommendations endpoint with student having NULL preferred_subjects
    - Test search with min_price > max_price (should return empty or all)
    - Test search with non-existent day_of_week value
    - Test search with negative prices
    - Test sorting with invalid sort_by value
    - Verify all edge cases handled gracefully (no crashes)
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6_

- [ ] 13. Checkpoint - Ensure all tests pass
  - Run all unit tests
  - Run all integration tests
  - Run all property-based tests (exploration and preservation)
  - Verify no console errors in browser
  - Verify no server errors in logs
  - Check database integrity (no orphaned records)
  - Review code for any TODO or FIXME comments
  - Ensure all requirements are satisfied
  - Ask the user if any questions arise or if additional testing is needed
