# 🏫 Game Cô Thảo — Lớp Học Tương Tác TikTok Live

Ứng dụng tương tác trực tiếp (**Game Cô Thảo**) mô phỏng không gian lớp học vui nhộn trên TikTok Live, nơi người xem tham gia trả lời câu hỏi Tiếng Anh cùng Cô Thảo để giành chỗ ngồi trong lớp, tích lũy điểm xếp hạng và gửi các món quà tương tác hài hước.

---

## ✨ Tính năng nổi bật

- **Tiết học Tiếng Anh tương tác tự động (6 Luồng)**:
  - Cô Thảo tự động dẫn dắt tiết học, đọc câu hỏi, nói câu giữ nhiệt trong lúc chờ, chấm điểm và vinh danh học sinh trả lời đúng theo chuỗi Top 1 liên tiếp.
  - Người xem trả lời đúng được mời vào ngồi bàn học trong lớp và tích điểm trên Bảng Xếp Hạng.
- **Hệ thống Quà Tặng Lớp Học sinh động**:
  - **Tặng hoa Cô / Thầy (`1 xu`)**: Học sinh mang bó hoa lên tặng Cô giáo hoặc Thầy giám thị.
  - **Đỉnh - Nuôi mèo (`1 xu`)**: Nuôi mèo trên bàn học (tối đa 5 con trên bàn, mèo dư sẽ nhảy xuống đi dạo quanh lớp).
  - **Ăn vụn (`1 xu`)**: Bịch bánh snack trên bàn học.
  - **Chú heo may mắn (`10 xu`)**: Đặt heo lên bàn và thả đàn 8 chú heo chạy quanh lớp.
  - **Quà VIP (`>= 20 xu`)**: Nâng cấp bàn học với dàn PC Gaming.
- **Dev Studio toàn diện**:
  - **Tổng Quan & Kết Nối**: Kết nối TikFinity / TikTok Live Connector (WebSocket), đồng bộ sang màn hình Live (`?obs=1`), Sao lưu / Khôi phục cấu hình (`.json`).
  - **Bố Cục Map**: Kéo thả các bảng HUD, chỉnh bàn học đôi, khoảng cách học sinh & bạn cùng bàn, kích thước nhân vật và kích thước/vị trí các model quà.
  - **Âm Thanh**: Quản lý nhạc nền, giọng đọc TTS và âm lượng riêng cho từng sự kiện quà tặng.
  - **Quản Lý NPC**: Điều chỉnh số lượng NPC, mật độ rải chat tự nhiên, tỷ lệ trả lời đúng/sai của NPC và nhập vai điều khiển trực tiếp.

---

## 🚀 Cài đặt & Chạy trên máy cá nhân (Local PC)

```bash
# 1. Cài đặt thư viện
npm install

# 2. Chạy chế độ phát triển (Development)
npm run dev
```

Sau khi chạy, mở trình duyệt tại địa chỉ:
- **Bảng điều khiển & Sân khấu (Admin)**: `http://localhost:3000`
- **Nguồn phát cho OBS / TikTok Live Studio (Ẩn bảng Dev)**: `http://localhost:3000/?obs=1`
