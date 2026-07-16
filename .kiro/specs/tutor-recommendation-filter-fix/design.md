# Tutor Recommendation and Filtering System Bugfix Design

## Overview

Bản thiết kế này mô tả cách sửa ba vấn đề chính trong hệ thống tìm kiếm và đề xuất gia sư:

1. **Thiếu thu thập môn học ưu tiên**: Thêm trường preferred_subjects vào bảng users và form đăng ký học sinh
2. **Thiếu tính năng đề xuất tự động**: Tạo endpoint mới `/api/tutors/recommendations` để đề xuất gia sư dựa trên môn học ưu tiên
3. **Bộ lọc hạn chế**: Mở rộng endpoint `/api/tutors/search` với các tham số lọc theo giá, ngày trong tuần, và sắp xếp kết quả

Chiến lược sửa lỗi tập trung vào việc mở rộng schema database, thêm API endpoints mới, và cập nhật giao diện người dùng mà không làm ảnh hưởng đến các tính năng hiện có (authentication, booking, tutor profile management).

## Glossary

- **Bug_Condition (C)**: Điều kiện kích hoạt lỗi - khi học sinh không thể nhận đề xuất cá nhân hóa hoặc lọc gia sư theo tiêu chí chi tiết
- **Property (P)**: Hành vi mong muốn - hệ thống thu thập sở thích, đề xuất gia sư phù hợp, và cung cấp bộ lọc đầy đủ
- **Preservation**: Tất cả tính năng hiện tại (đăng nhập, đặt lịch, quản lý hồ sơ) phải hoạt động bình thường sau khi fix
- **preferred_subjects**: Danh sách môn học mà học sinh quan tâm, được lưu dưới dạng chuỗi JSON trong database
- **Recommendation Algorithm**: Thuật toán ưu tiên gia sư dạy môn học trùng với preferred_subjects của học sinh
- **Advanced Filtering**: Bộ lọc mở rộng bao gồm price range (min_price, max_price), availability (day_of_week), và sorting (sort_by, order)


## Bug Details

### Bug Condition

Hệ thống hiện tại không cung cấp trải nghiệm tìm kiếm cá nhân hóa cho học sinh. Lỗi xảy ra ở ba điểm:

1. **Registration Flow**: Form đăng ký học sinh (register.html) không hỏi môn học ưu tiên, và backend (routes/auth.js) không lưu thông tin này
2. **Dashboard Display**: Trang student-dashboard.html không có section hiển thị gia sư được đề xuất
3. **Search Functionality**: Endpoint `/api/tutors/search` chỉ hỗ trợ 2 tham số (subject, level) và không sắp xếp kết quả

**Formal Specification:**
```
FUNCTION isBugCondition(input)
  INPUT: input of type { action: string, userRole: string, filters: object }
  OUTPUT: boolean
  
  RETURN (input.action == "register" AND input.userRole == "student" AND NOT hasPreferredSubjectsField())
         OR (input.action == "viewDashboard" AND input.userRole == "student" AND NOT hasRecommendationsSection())
         OR (input.action == "searchTutors" AND NOT canFilterByPrice(input.filters) AND NOT canFilterByAvailability(input.filters) AND NOT canSortResults(input.filters))
END FUNCTION
```

### Examples

- **Example 1 (Registration)**: Học sinh Minh đăng ký tài khoản với vai trò "student", nhưng không được hỏi môn học cần tìm → Không thể nhận đề xuất cá nhân hóa
- **Example 2 (Dashboard)**: Học sinh Lan đăng nhập và truy cập dashboard, chỉ thấy danh sách lịch học → Phải tự tìm kiếm thủ công trên trang chính
- **Example 3 (Search - Price)**: Học sinh Hùng muốn tìm gia sư Toán với giá 100k-200k/giờ → Không có bộ lọc giá, phải xem từng gia sư
- **Example 4 (Search - Availability)**: Học sinh Mai muốn tìm gia sư rảnh thứ 7 → Không có bộ lọc ngày, phải click vào từng profile để xem lịch


## Expected Behavior

### Preservation Requirements

**Unchanged Behaviors:**
- Authentication flow (đăng nhập, đăng xuất) phải hoạt động như hiện tại
- Tutor registration và profile management (thêm môn học, lịch dạy) không thay đổi
- Booking flow (tạo đơn, chấp nhận/từ chối) phải hoạt động bình thường
- Trang tìm kiếm vẫn hiển thị tất cả gia sư khi không chọn bộ lọc nào
- Người dùng chưa đăng nhập vẫn có thể tìm kiếm gia sư

**Scope:**
Tất cả requests không liên quan đến student registration, recommendations, hoặc advanced search filters phải hoạt động giống hệt như trước khi fix. Bao gồm:
- POST /api/auth/login - Không thay đổi
- PUT /api/tutors/profile - Không thay đổi
- POST /api/bookings - Không thay đổi
- GET /api/bookings/my - Không thay đổi
- GET /api/bookings/incoming - Không thay đổi
- Tutor registration flow - Không thay đổi


## Hypothesized Root Cause

Dựa trên phân tích bugfix.md và codebase, các nguyên nhân chính là:

1. **Database Schema Incomplete**: Bảng `users` không có cột để lưu preferred_subjects của học sinh
   - Khi thiết kế ban đầu, chỉ tập trung vào tutor profiles (bio, hourly_rate, subjects)
   - Không dự đoán nhu cầu personalization cho học sinh

2. **Missing API Endpoint for Recommendations**: Không có route `/api/tutors/recommendations`
   - Backend không có logic để lấy preferred_subjects của học sinh
   - Không có thuật toán để match subjects của tutor với preferences của student

3. **Limited Search Query Parameters**: Endpoint `/api/tutors/search` chỉ xử lý subject và level
   - Không parse các tham số min_price, max_price, day_of_week
   - SQL query không có JOIN với bảng schedules để lọc theo availability
   - Không có ORDER BY clause để sắp xếp kết quả

4. **Frontend Missing UI Components**:
   - register.html không có input field cho preferred_subjects
   - student-dashboard.html không có section để hiển thị recommendations
   - index.html không có các input fields cho price range và day_of_week filter


## Correctness Properties

Property 1: Bug Condition - Preferred Subjects Collection and Recommendations

_For any_ student registration request where preferred_subjects are provided, the system SHALL store these subjects in the database and use them to generate personalized tutor recommendations on the student dashboard, prioritizing tutors who teach the preferred subjects.

**Validates: Requirements 2.1, 2.2, 2.7**

Property 2: Bug Condition - Advanced Filtering and Sorting

_For any_ tutor search request where advanced filters (price range, day_of_week) or sorting (sort_by, order) parameters are provided, the system SHALL filter and sort the results accordingly, returning only tutors that match all specified criteria in the requested order.

**Validates: Requirements 2.3, 2.4, 2.5, 2.6**

Property 3: Preservation - Existing Features Unchanged

_For any_ request that does not involve student registration with preferred_subjects, recommendations endpoint, or advanced search filters, the system SHALL produce exactly the same response as the original system, preserving all existing authentication, booking, and tutor management functionality.

**Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7**


## Fix Implementation

### Changes Required

Assuming our root cause analysis is correct, chúng ta cần thực hiện các thay đổi sau:

### 1. Database Schema Changes

**File**: `tutor-finder/database.js`

**Function**: `db.serialize()` callback

**Specific Changes**:
1. **Add preferred_subjects column to users table**: 
   ```sql
   ALTER TABLE users ADD COLUMN preferred_subjects TEXT DEFAULT NULL;
   ```
   - Lưu dưới dạng JSON string (e.g., `'["Toán","Anh văn"]'`)
   - Chỉ áp dụng cho role = 'student'
   - NULL nếu học sinh không chọn hoặc user là tutor

2. **Migration Strategy**: Thêm migration check để không lỗi nếu cột đã tồn tại
   ```javascript
   db.run(`ALTER TABLE users ADD COLUMN preferred_subjects TEXT DEFAULT NULL`, (err) => {
     if (err && !err.message.includes('duplicate column')) throw err;
   });
   ```


### 2. Backend API Changes

#### 2.1 Update Registration Endpoint

**File**: `tutor-finder/routes/auth.js`

**Function**: `POST /register`

**Specific Changes**:
1. **Accept preferred_subjects parameter**: Thêm vào destructuring
   ```javascript
   const { name, email, password, role, preferred_subjects } = req.body;
   ```

2. **Validate and store preferred_subjects**: Chỉ lưu nếu role = 'student'
   ```javascript
   if (role === 'student' && preferred_subjects) {
     const subjectsJson = JSON.stringify(preferred_subjects); // Array to JSON string
     await db.runAsync(
       'INSERT INTO users (name, email, password, role, preferred_subjects) VALUES (?, ?, ?, ?, ?)',
       [name, email, hashed, role, subjectsJson]
     );
   } else {
     await db.runAsync(
       'INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)',
       [name, email, hashed, role]
     );
   }
   ```


#### 2.2 Create Recommendations Endpoint

**File**: `tutor-finder/routes/tutors.js`

**New Route**: `GET /api/tutors/recommendations`

**Specific Changes**:
1. **Add new endpoint before existing routes**:
   ```javascript
   router.get('/recommendations', authenticate, requireRole('student'), async (req, res) => {
     // 1. Get student's preferred subjects
     const user = await db.getAsync('SELECT preferred_subjects FROM users WHERE id = ?', [req.user.id]);
     if (!user || !user.preferred_subjects) {
       return res.json([]); // Return empty if no preferences
     }
     const preferences = JSON.parse(user.preferred_subjects);
     
     // 2. Query tutors with matching subjects (prioritized) + other tutors
     const query = `
       SELECT u.id, u.name, tp.bio, tp.hourly_rate,
              GROUP_CONCAT(s.name || ' (' || s.level || ')') as subjects,
              CASE 
                WHEN s.name IN (${preferences.map(() => '?').join(',')}) THEN 1 
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


#### 2.3 Enhance Search Endpoint

**File**: `tutor-finder/routes/tutors.js`

**Function**: `GET /search`

**Specific Changes**:
1. **Extract new query parameters**:
   ```javascript
   const { subject, level, min_price, max_price, day_of_week, sort_by, order } = req.query;
   ```

2. **Build dynamic SQL query with price and availability filters**:
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
   
   if (subject) { query += ' AND s.name LIKE ?'; params.push(`%${subject}%`); }
   if (level) { query += ' AND s.level = ?'; params.push(level); }
   if (min_price) { query += ' AND tp.hourly_rate >= ?'; params.push(parseInt(min_price)); }
   if (max_price) { query += ' AND tp.hourly_rate <= ?'; params.push(parseInt(max_price)); }
   if (day_of_week) { query += ' AND sc.day_of_week = ?'; params.push(day_of_week); }
   
   query += ' GROUP BY u.id';
   ```

3. **Add sorting logic**:
   ```javascript
   if (sort_by === 'price') {
     query += ` ORDER BY tp.hourly_rate ${order === 'desc' ? 'DESC' : 'ASC'}`;
   } else if (sort_by === 'rating') {
     // TODO: Implement when rating system is added
     query += ` ORDER BY tp.hourly_rate ASC`; // Fallback to price for now
   }
   ```


### 3. Frontend Changes

#### 3.1 Update Student Registration Page

**File**: `tutor-finder/public/register.html`

**Specific Changes**:
1. **Add multi-select for preferred subjects** (after role selection):
   ```html
   <div id="subjectPreferences" style="display:none">
     <label>Môn học cần tìm gia sư (chọn nhiều):</label>
     <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:8px;margin-bottom:12px">
       <label><input type="checkbox" value="Toán"> Toán</label>
       <label><input type="checkbox" value="Anh văn"> Anh văn</label>
       <label><input type="checkbox" value="Lý"> Vật lý</label>
       <label><input type="checkbox" value="Hóa"> Hóa học</label>
       <label><input type="checkbox" value="Văn"> Ngữ văn</label>
       <label><input type="checkbox" value="Sử"> Lịch sử</label>
     </div>
   </div>
   ```

2. **Show/hide preferences based on role selection**:
   ```javascript
   document.getElementById('role').addEventListener('change', (e) => {
     document.getElementById('subjectPreferences').style.display = 
       e.target.value === 'student' ? 'block' : 'none';
   });
   ```

3. **Collect and send preferred_subjects in register() function**:
   ```javascript
   const preferred_subjects = role === 'student' 
     ? Array.from(document.querySelectorAll('#subjectPreferences input:checked')).map(cb => cb.value)
     : undefined;
   
   const body = { name, email, password, role };
   if (preferred_subjects && preferred_subjects.length > 0) {
     body.preferred_subjects = preferred_subjects;
   }
   ```


#### 3.2 Add Recommendations Section to Student Dashboard

**File**: `tutor-finder/public/student-dashboard.html`

**Specific Changes**:
1. **Add recommendations section** (before "Lịch học của tôi"):
   ```html
   <div class="card">
     <h2>⭐ Gia sư được đề xuất</h2>
     <div id="recommendationList"></div>
   </div>
   ```

2. **Add loadRecommendations() function**:
   ```javascript
   async function loadRecommendations() {
     const res = await fetch('/api/tutors/recommendations', { headers });
     if (!res.ok) return;
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
         <div>${(t.subjects || '').split(',').map(s => \`<span class="tag">\${s.trim()}</span>\`).join('')}</div>
         <br>
         <a href="?book=${t.id}" style="background:#2563eb;color:white;padding:7px 16px;border-radius:7px;text-decoration:none;font-size:0.88rem;font-weight:600">
           Đặt lịch học
         </a>
       </div>
     `).join('');
   }
   
   // Call on page load
   loadRecommendations();
   ```


#### 3.3 Enhance Search Page with Advanced Filters

**File**: `tutor-finder/public/index.html`

**Specific Changes**:
1. **Expand search form with new filters**:
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
     <input type="number" id="minPrice" placeholder="Giá tối thiểu (đ/giờ)" min="0">
     <input type="number" id="maxPrice" placeholder="Giá tối đa (đ/giờ)" min="0">
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


2. **Update searchTutors() function to include new parameters**:
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
     // ... existing rendering logic
   }
   ```


## Testing Strategy

### Validation Approach

Testing strategy theo cấu trúc hai giai đoạn: trước tiên, kiểm tra lỗi trên code chưa fix (exploratory), sau đó verify rằng fix hoạt động đúng và không làm hỏng tính năng hiện có.

### Exploratory Bug Condition Checking

**Goal**: Xác nhận rằng các lỗi thực sự tồn tại trong code chưa fix, và hiểu rõ nguyên nhân gốc rễ.

**Test Plan**: Kiểm tra từng bug condition trên codebase hiện tại để xác nhận:

**Test Cases**:
1. **Registration Missing Preferences Test**: 
   - Kiểm tra register.html không có input field cho preferred_subjects
   - Kiểm tra POST /api/auth/register không xử lý preferred_subjects parameter
   - Kiểm tra database không có cột preferred_subjects trong bảng users
   - **Expected**: Xác nhận không có cách nào lưu môn học ưu tiên

2. **Dashboard Missing Recommendations Test**:
   - Kiểm tra student-dashboard.html không có section recommendations
   - Kiểm tra không có endpoint GET /api/tutors/recommendations
   - **Expected**: Xác nhận không có tính năng đề xuất

3. **Search Limited Filters Test**:
   - Gọi GET /api/tutors/search với params min_price=100000
   - Gọi GET /api/tutors/search với params day_of_week="Thứ 2"
   - Kiểm tra index.html không có input fields cho price và day filters
   - **Expected**: Xác nhận các params này bị ignore hoặc gây lỗi

4. **Search No Sorting Test**:
   - Gọi GET /api/tutors/search với params sort_by=price&order=asc
   - **Expected**: Xác nhận kết quả không được sắp xếp theo giá

**Expected Counterexamples**:
- preferred_subjects không được lưu khi student đăng ký
- Dashboard không hiển thị recommendations dù student có preferences
- Search không lọc theo giá hoặc ngày trong tuần
- Kết quả search không sắp xếp theo yêu cầu


### Fix Checking

**Goal**: Verify rằng sau khi fix, tất cả bug conditions đều được giải quyết đúng.

**Pseudocode:**
```
FOR ALL input WHERE isBugCondition(input) DO
  result := fixedSystem(input)
  ASSERT expectedBehavior(result)
END FOR
```

**Test Cases**:

1. **Registration with Preferences Test**:
   - POST /api/auth/register với body: `{ role: "student", preferred_subjects: ["Toán", "Anh văn"], ... }`
   - ASSERT: User được tạo với preferred_subjects được lưu dưới dạng JSON
   - ASSERT: Token và user object được trả về đúng

2. **Recommendations Display Test**:
   - Tạo student với preferred_subjects = ["Toán"]
   - Tạo 2 tutors: 1 dạy Toán, 1 dạy Hóa
   - GET /api/tutors/recommendations
   - ASSERT: Tutor dạy Toán được ưu tiên (is_match = 1)
   - ASSERT: Trả về tối đa 10 tutors

3. **Price Filter Test**:
   - Tạo tutors với hourly_rate: 100k, 200k, 300k
   - GET /api/tutors/search?min_price=150000&max_price=250000
   - ASSERT: Chỉ trả về tutor có rate 200k

4. **Day of Week Filter Test**:
   - Tạo tutor A có schedule Thứ 2, tutor B có schedule Thứ 3
   - GET /api/tutors/search?day_of_week=Thứ 2
   - ASSERT: Chỉ trả về tutor A

5. **Sorting Test**:
   - GET /api/tutors/search?sort_by=price&order=asc
   - ASSERT: Kết quả sắp xếp theo hourly_rate tăng dần


### Preservation Checking

**Goal**: Verify rằng tất cả tính năng không liên quan đến fix vẫn hoạt động bình thường.

**Pseudocode:**
```
FOR ALL input WHERE NOT isBugCondition(input) DO
  ASSERT originalSystem(input) = fixedSystem(input)
END FOR
```

**Testing Approach**: Property-based testing được khuyến nghị cho preservation checking vì:
- Tự động generate nhiều test cases covering toàn bộ input domain
- Phát hiện edge cases mà manual tests có thể bỏ sót
- Đảm bảo behavior unchanged với high confidence

**Test Plan**: Observe behavior trên UNFIXED code cho các flows không liên quan, sau đó viết property-based tests để capture behavior đó.

**Test Cases**:

1. **Login Preservation Test**:
   - POST /api/auth/login với credentials hợp lệ
   - ASSERT: Trả về token và user object giống hệt unfixed code
   - Test với nhiều users (students và tutors)

2. **Tutor Registration Preservation Test**:
   - POST /api/auth/register với role = "tutor" (không có preferred_subjects)
   - ASSERT: Tutor được tạo bình thường, tutor_profile được tạo
   - ASSERT: Không có lỗi liên quan đến preferred_subjects

3. **Booking Flow Preservation Test**:
   - POST /api/bookings (student tạo booking)
   - GET /api/bookings/my (student xem bookings)
   - GET /api/bookings/incoming (tutor xem bookings)
   - PUT /api/bookings/:id/status (tutor accept/reject)
   - ASSERT: Tất cả endpoints hoạt động giống unfixed code

4. **Tutor Profile Management Preservation Test**:
   - PUT /api/tutors/profile (update bio, hourly_rate)
   - POST /api/tutors/subjects (add subject)
   - DELETE /api/tutors/subjects/:id
   - POST /api/tutors/schedules (add schedule)
   - DELETE /api/tutors/schedules/:id
   - ASSERT: Tất cả operations hoạt động giống unfixed code

5. **Basic Search Preservation Test**:
   - GET /api/tutors/search?subject=Toán (không có advanced filters)
   - GET /api/tutors/search (không có params nào)
   - ASSERT: Trả về kết quả giống unfixed code

6. **Unauthenticated Access Preservation Test**:
   - Truy cập index.html và search tutors mà không đăng nhập
   - ASSERT: Tất cả functions hoạt động bình thường


### Unit Tests

- Test database migration (ALTER TABLE) không gây lỗi khi cột đã tồn tại
- Test JSON stringify/parse cho preferred_subjects array
- Test recommendation algorithm với nhiều scenarios:
  - Student không có preferences → return empty array
  - Student có preferences nhưng không có tutor match → return other tutors
  - Student có preferences và có tutors match → prioritize matched tutors
- Test search filters với từng parameter riêng lẻ:
  - Chỉ min_price
  - Chỉ max_price
  - Chỉ day_of_week
  - Combinations của filters
- Test sorting với price asc/desc
- Test registration với và không có preferred_subjects

### Property-Based Tests

- Generate random student registrations (với và không có preferred_subjects) và verify database state
- Generate random search parameters và verify SQL query correctness
- Generate random tutor profiles và verify recommendation algorithm không crash với edge cases
- Generate random booking requests và verify preservation (booking flow unchanged)
- Generate random tutor profile updates và verify preservation (profile management unchanged)

### Integration Tests

- Full student flow: Đăng ký với preferences → Login → Xem recommendations → Book tutor
- Full search flow: Nhập filters → Submit → Verify results → Sort → Verify sorted results
- Cross-user flow: Student A đăng ký với preferences ["Toán"], Student B với ["Hóa"] → Verify recommendations khác nhau
- Migration flow: Run migration → Verify existing users vẫn login được → Create new users → Verify họ có cột preferred_subjects
