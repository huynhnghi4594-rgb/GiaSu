# Tutor Finder Backend API

Backend API cho hệ thống tìm gia sư với Supabase và Cosine Similarity.

## 🚀 Cài đặt

```bash
cd backend
npm install
```

## ⚙️ Cấu hình

Tạo file `.env`:
```env
PORT=5000
NODE_ENV=development

SUPABASE_URL=https://rqrvaalxidtomzdlbvos.supabase.co
SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_KEY=your_service_key

JWT_SECRET=your_secret_key
FRONTEND_URL=http://localhost:3000
```

## 🗄️ Setup Database

1. Mở Supabase SQL Editor
2. Chạy file `supabase-schema-fixed.sql`
3. Kiểm tra tables đã được tạo

## ▶️ Chạy Server

### Development
```bash
npm run dev
```

### Production
```bash
npm start
```

Server sẽ chạy tại: http://localhost:5000

## 📡 API Endpoints

### Authentication
- `POST /api/auth/register` - Đăng ký (student/tutor)
- `POST /api/auth/login` - Đăng nhập

### Tutors
- `GET /api/tutors/search` - Tìm kiếm gia sư (với filters)
- `GET /api/tutors/recommendations` - Gợi ý gia sư (cosine similarity)
- `GET /api/tutors/:id` - Chi tiết gia sư
- `GET /api/tutors/profile/me` - Profile của tutor (auth required)
- `PUT /api/tutors/profile` - Cập nhật profile (auth required)
- `POST /api/tutors/subjects` - Thêm môn học (auth required)
- `DELETE /api/tutors/subjects/:id` - Xóa môn học (auth required)
- `POST /api/tutors/schedules` - Thêm lịch dạy (auth required)
- `DELETE /api/tutors/schedules/:id` - Xóa lịch dạy (auth required)

### Bookings
- `POST /api/bookings` - Tạo booking (student)
- `GET /api/bookings/my` - Xem bookings của mình (student)
- `GET /api/bookings/incoming` - Xem bookings đến mình (tutor)
- `PUT /api/bookings/:id/status` - Chấp nhận/từ chối booking (tutor)

## 🔐 Authentication

Sử dụng JWT token trong header:
```
Authorization: Bearer <token>
```

## 🧪 Test API

```bash
# Health check
curl http://localhost:5000/api/health

# Register student
curl -X POST http://localhost:5000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test Student",
    "email": "test@student.com",
    "password": "123456",
    "role": "student",
    "preferred_subjects": ["Toán", "Lý"]
  }'

# Search tutors
curl http://localhost:5000/api/tutors/search?subject=Toán&min_price=100000
```

## 📁 Cấu trúc

```
backend/
├── config/
│   └── supabase.js        # Supabase client
├── middleware/
│   └── auth.js            # JWT authentication
├── routes/
│   ├── auth.js            # Authentication routes
│   ├── tutors.js          # Tutor routes
│   └── bookings.js        # Booking routes
├── .env                   # Environment variables
├── server.js              # Main server file
└── package.json
```

## 🎯 Tính năng nổi bật

- ✅ Cosine Similarity để gợi ý gia sư thông minh
- ✅ Tìm kiếm nâng cao với nhiều bộ lọc
- ✅ JWT authentication
- ✅ Row Level Security với Supabase
- ✅ Vector embeddings cho subjects
