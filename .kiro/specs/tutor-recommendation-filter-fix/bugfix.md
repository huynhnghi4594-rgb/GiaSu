# Bugfix Requirements Document

## Introduction

Hệ thống tìm kiếm và đề xuất gia sư hiện tại có ba vấn đề chính ảnh hưởng đến trải nghiệm của học sinh:

1. **Thiếu thu thập môn học ưu tiên**: Khi học sinh đăng ký, hệ thống không hỏi môn học họ cần tìm, dẫn đến không thể cá nhân hóa đề xuất.
2. **Không có tính năng đề xuất tự động**: Dashboard học sinh không hiển thị danh sách gia sư được đề xuất dựa trên sở thích, yêu cầu học sinh phải tự tìm kiếm thủ công.
3. **Bộ lọc tìm kiếm hạn chế**: Trang tìm kiếm chỉ có 2 tiêu chí lọc (môn học và cấp độ), không cho phép lọc theo giá, thời gian rảnh, hoặc sắp xếp kết quả.

Những vấn đề này làm giảm hiệu quả tìm kiếm và khiến học sinh khó khăn trong việc tìm gia sư phù hợp với nhu cầu và ngân sách của họ.

## Bug Analysis

### Current Behavior (Defect)

1.1 WHEN học sinh đăng ký tài khoản THEN hệ thống không hỏi môn học ưu tiên của họ

1.2 WHEN học sinh truy cập student-dashboard.html THEN không có danh sách gia sư được đề xuất nào hiển thị

1.3 WHEN học sinh tìm kiếm gia sư trên trang index.html THEN chỉ có thể lọc theo môn học và cấp độ

1.4 WHEN học sinh muốn lọc gia sư theo khoảng giá THEN không có bộ lọc giá tiền (min-max)

1.5 WHEN học sinh muốn lọc gia sư theo thời gian rảnh THEN không có bộ lọc ngày trong tuần

1.6 WHEN học sinh tìm thấy danh sách gia sư THEN không có tùy chọn sắp xếp theo giá hoặc đánh giá

1.7 WHEN học sinh có nhiều kết quả tìm kiếm THEN kết quả hiển thị không có thứ tự ưu tiên rõ ràng

### Expected Behavior (Correct)

2.1 WHEN học sinh đăng ký tài khoản THEN hệ thống SHALL hỏi và lưu môn học ưu tiên của họ vào database

2.2 WHEN học sinh truy cập student-dashboard.html THEN hệ thống SHALL hiển thị danh sách gia sư được đề xuất dựa trên môn học ưu tiên

2.3 WHEN học sinh tìm kiếm gia sư trên trang index.html THEN hệ thống SHALL cung cấp bộ lọc đầy đủ bao gồm môn học, cấp độ, khoảng giá, và ngày trong tuần

2.4 WHEN học sinh nhập khoảng giá (min-max) THEN hệ thống SHALL chỉ hiển thị gia sư có mức giá trong khoảng đó

2.5 WHEN học sinh chọn ngày trong tuần THEN hệ thống SHALL chỉ hiển thị gia sư có lịch rảnh vào ngày đó

2.6 WHEN học sinh xem kết quả tìm kiếm THEN hệ thống SHALL cung cấp tùy chọn sắp xếp theo giá (tăng/giảm dần) và đánh giá

2.7 WHEN học sinh có môn học ưu tiên THEN hệ thống SHALL ưu tiên hiển thị gia sư dạy môn đó trong kết quả tìm kiếm và đề xuất

### Unchanged Behavior (Regression Prevention)

3.1 WHEN học sinh không chọn bộ lọc nào THEN hệ thống SHALL CONTINUE TO hiển thị tất cả gia sư như hiện tại

3.2 WHEN học sinh đặt lịch học với gia sư THEN quy trình đặt lịch hiện tại SHALL CONTINUE TO hoạt động bình thường

3.3 WHEN gia sư cập nhật hồ sơ, môn học, hoặc lịch dạy THEN các tính năng này SHALL CONTINUE TO hoạt động như hiện tại

3.4 WHEN học sinh xem danh sách lịch học đã đăng ký THEN tính năng này SHALL CONTINUE TO hoạt động bình thường

3.5 WHEN gia sư đăng ký tài khoản THEN quy trình đăng ký gia sư SHALL CONTINUE TO không thay đổi (không hỏi môn học ưu tiên)

3.6 WHEN người dùng chưa đăng nhập truy cập trang tìm kiếm THEN họ vẫn SHALL CONTINUE TO có thể tìm kiếm và xem danh sách gia sư

3.7 WHEN người dùng đăng nhập/đăng xuất THEN các tính năng authentication hiện tại SHALL CONTINUE TO hoạt động bình thường
