# Kiến trúc Hệ thống TutorMatch

## Tổng quan
Hệ thống nền tảng kết nối gia sư và học sinh với các tính năng xác thực, thanh toán, và quản lý.

## Kiến trúc hệ thống
```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   Frontend      │────▶│   Backend API   │────▶│   Database      │
│   (HTML/CSS/JS) │     │   (Node.js)     │     │   (Supabase)    │
└─────────────────┘     └─────────────────┘     └─────────────────┘
        │                        │                        │
        │                        │                        │
┌───────▼────────┐       ┌───────▼────────┐       ┌───────▼────────┐
│   Client-Side  │       │   REST API     │       │   PostgreSQL   │
│   Validation   │       │   JWT Auth     │       │   pgvector     │
└────────────────┘       └────────────────┘       └────────────────┘
```

## Công nghệ sử dụng

### 1. Frontend
- **HTML5/CSS3**: Giao diện người dùng
- **Vanilla JavaScript**: Xử lý logic client-side
- **http-server**: Development server đơn giản

### 2. Backend  
- **Node.js v22+**: Runtime môi trường
- **Express.js**: Web framework REST API
- **JWT (JSON Web Tokens)**: Xác thực stateless
- **bcryptjs**: Mã hóa mật khẩu

### 3. Database & Infrastructure
- **Supabase (PostgreSQL)**: Database quan hệ với RLS
- **pgvector**: Cosine similarity cho gợi ý gia sư
- **Row Level Security**: Bảo mật dữ liệu

## Mô hình dữ liệu

### Các bảng chính:

#### 1. `users` - Người dùng
```sql
id UUID PRIMARY KEY
email TEXT UNIQUE
password TEXT
name TEXT
role TEXT CHECK ('student', 'tutor', 'admin', 'accountant')
verification_status TEXT CHECK ('pending', 'verified', 'rejected')
id_card_number TEXT
id_card_name TEXT
qualification_info TEXT
preferred_subjects TEXT[]
subject_embedding VECTOR(1536)  -- cho pgvector
```

#### 2. `tutor_profiles` - Hồ sơ gia sư
```sql
id UUID PRIMARY KEY
user_id UUID REFERENCES users(id)
bio TEXT
hourly_rate INTEGER
```

#### 3. `wallets` - Ví điện tử
```sql
id UUID PRIMARY KEY
user_id UUID UNIQUE REFERENCES users(id)
balance INTEGER DEFAULT 0
```

#### 4. `transactions` - Giao dịch
```sql
id UUID PRIMARY KEY
wallet_id UUID REFERENCES wallets(id)
type TEXT CHECK ('deposit', 'withdraw', 'escrow_hold', 'escrow_release', 'platform_fee', 'refund')
amount INTEGER
description TEXT
related_booking_id UUID
status TEXT CHECK ('pending', 'completed', 'failed')
```

#### 5. `bookings` - Đặt lịch học
```sql
id UUID PRIMARY KEY
student_id UUID REFERENCES users(id)
tutor_id UUID REFERENCES tutor_profiles(id)
payment_status TEXT CHECK ('unpaid', 'escrow_held', 'released', 'refunded')
total_amount INTEGER
platform_fee INTEGER
tutor_payout INTEGER
```

## Luồng thanh toán Escrow

### Quy trình 5 bước:
1. **Học sinh nạp tiền** vào ví
2. **Tạo booking**: Tiền tự động tạm giữ (escrow_hold)
3. **Gia sư nhận lớp** và hoàn thành buổi học
4. **Học sinh xác nhận** hoàn thành
5. **Giải ngân**: 90% cho gia sư, 10% phí nền tảng

### Bảo vệ thông tin liên hệ:
- Không lưu SĐT/địa chỉ trong booking
- Liên lạc qua tin nhắn nội bộ
- Chỉ trao đổi contact khi booking confirmed & paid

## API Endpoints

### Authentication
- `POST /api/auth/login` - Đăng nhập
- `POST /api/auth/register` - Đăng ký

### Tutors
- `GET /api/tutors/search` - Tìm kiếm gia sư (chỉ verified)
- `GET /api/tutors/recommendations` - Gợi ý bằng cosine similarity
- `GET /api/tutors/profile/me` - Hồ sơ gia sư
- `GET /api/tutors/verification/status` - Trạng thái xác minh

### Wallets & Payments
- `GET /api/wallets/balance` - Số dư ví
- `POST /api/wallets/deposit` - Nạp tiền
- `POST /api/wallets/withdraw` - Rút tiền
- `GET /api/wallets/transactions` - Lịch sử giao dịch

### Bookings
- `POST /api/bookings` - Tạo booking + escrow hold
- `PUT /api/bookings/:id/complete` - Gia sư đánh dấu hoàn thành
- `PUT /api/bookings/:id/confirm` - Học sinh xác nhận + giải ngân

### Admin
- `GET /api/admin/pending-tutors` - Danh sách gia sư chờ duyệt
- `PUT /api/admin/verify-tutor/:id` - Duyệt/từ chối gia sư

## Bảo mật

### 1. Xác thực 2 lớp:
- **JWT Token**: Stateless authentication
- **Role-based Access Control**: Phân quyền theo role
- **Password Hashing**: bcrypt với salt 10 rounds

### 2. Database Security:
- **Row Level Security**: Mỗi user chỉ thấy dữ liệu của mình
- **Parameterized Queries**: Ngăn SQL injection
- **Input Validation**: Server-side validation

### 3. Payment Security:
- **Escrow System**: Tiền được giữ trung gian
- **Balance Checks**: Kiểm tra số dư trước giao dịch
- **Transaction Logs**: Ghi lại mọi giao dịch

## Triển khai

### Development:
```bash
# Backend
cd backend && npm run dev  # http://localhost:5000

# Frontend  
cd frontend && npm run dev  # http://localhost:3000
```

### Production Ready:
1. **Environment Variables**: JWT_SECRET, SUPABASE_URL, SUPABASE_KEY
2. **Error Handling**: Centralized error middleware
3. **Input Validation**: Request body validation
4. **CORS Configuration**: Chỉ cho phép frontend domain

## Tối ưu hóa

### 1. Database:
- **Indexes**: Trên các cột tìm kiếm thường xuyên
- **pgvector**: Cosine similarity cho gợi ý nhanh
- **Connection Pooling**: Quản lý kết nối hiệu quả

### 2. API:
- **Pagination**: Cho danh sách lớn
- **Caching**: Redis cho dữ liệu ít thay đổi
- **Compression**: Gzip response

## Scaling

### Vertical Scaling:
- Tăng RAM/CPU cho database
- Load balancer cho backend instances

### Horizontal Scaling:
- Microservices cho auth, payments, notifications
- CDN cho static assets
- Message queue cho async tasks

## Giải quyết vấn đề từ Hội đồng

### ❌ Vấn đề 1: Xác thực gia sư giả (localStorage)
**Giải pháp**: verification_status trong database, không thể giả mạo

### ❌ Vấn đề 2: Ví điện tử giả (100% localStorage)  
**Giải pháp**: wallets table trên server với transaction logs

### ❌ Vấn đề 3: Cho phép liên hệ trực tiếp
**Giải pháp**: Xóa SĐT/địa chỉ khỏi booking, chỉ liên lạc qua nền tảng

### ❌ Vấn đề 4: Lỗi đăng nhập gia sư
**Giải pháp**: Fix JWT role validation, proper error handling