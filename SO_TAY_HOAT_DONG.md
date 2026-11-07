# SỔ TAY HOẠT ĐỘNG GAME CÔ THẢO (`SO_TAY_HOAT_DONG.md`)

Tài liệu này ghi chép quy trình hoạt động nhân vật, luồng câu hỏi Tiếng Anh trên bảng lớp, hệ thống quà tặng tương tác trong lớp học và bảng điều khiển Dev Studio của **Game Cô Thảo**.

---

## 1. Luồng Tiết Học & Câu Hỏi Tiếng Anh Trên Bảng Lớp
- **Luồng 1 (Chuẩn bị câu hỏi):** Cô Thảo thông báo chuẩn bị câu hỏi mới (lấy ngẫu nhiên từ danh sách câu nói trong cấu hình).
- **Luồng 2 (Đọc câu hỏi):** Hiển thị từ vựng Tiếng Anh lên bảng phấn và phát âm câu hỏi.
- **Luồng 3 (Chờ trả lời):** Đếm ngược thời gian để học sinh trong lớp và người xem bình luận đáp án; hỗ trợ Cô Thảo nói các câu vu vơ giữ nhiệt trong lúc chờ.
- **Luồng 4 (Đọc đáp án):** Công bố đáp án đúng trên bảng.
- **Luồng 5 (Bảng kết quả):** Vinh danh Top học sinh trả lời đúng nhanh nhất, cộng điểm đồng loạt và đọc lời khen theo điều kiện chuỗi Top 1 liên tiếp (combo).
- **Luồng 6 (Vinh danh / Xếp chỗ):** Đọc lời khen theo mốc chuỗi thắng liên tiếp và mời các bạn trả lời đúng từ ngoài cửa vào ngồi ghế trong lớp.

---

## 2. Hệ Thống Quà Tặng Tương Tác Trong Lớp Học
| Sự kiện Quà | Mệnh giá | Hiệu ứng trong lớp học |
| :--- | :--- | :--- |
| **Tặng hoa Cô / Thầy** | `1 coin` | Học sinh ôm bó hoa trước ngực đi lên đứng cạnh Cô giáo / Thầy giám thị và tung bó hoa tặng. |
| **Đỉnh (Nuôi mèo)** | `1 coin` | Đặt mèo cưng lên bàn học (tối đa 5 con trên bàn; từ con thứ 6 sẽ nhảy xuống đất đi dạo quanh lớp rồi rời đi). Chat: *"Em nuôi mèo nè cô"*. |
| **Ăn vụn** | `1 coin` | Đặt bịch bánh snack lên bàn học. Chat: *"Nhăm nhăm"*. |
| **Bắn tim** | `5 coins` | Hiệu ứng tương tác lớp học. Chat: *"Ring! Ring!"*. |
| **Chú heo may mắn** | `10 coins` | Thêm 1 chú heo lên bàn học (tối đa 1 con trên bàn) và gọi đàn 8 chú heo chạy náo loạn khắp lớp. Chat: *"ột ột 😈😈😈"*. |
| **Quà VIP** | `>= 20 coins` | Lắp dàn PC Gaming trên bàn học kèm hiệu ứng vinh danh đặc biệt. |

---

## 3. Hệ Thống NPC Tự Động & Bảng Điều Khiển Dev Studio
- **NPC Tự Động:**
  - Học sinh NPC trong lớp và ngoài hàng chờ rải chat phát biểu tự nhiên theo thanh trượt **Mật độ rải chat (`0% - 100%`)**.
  - Khi trả lời câu hỏi trên bảng: NPC trả lời đúng sẽ bình luận đáp án chuẩn như người thật; NPC trả lời sai sẽ giữ im lặng hoặc gõ nhầm vị trí 2 chữ cái liền nhau.
- **Dev Map & Model Quà:**
  - Tùy chỉnh vị trí bàn học đôi, khoảng cách học sinh với bàn học, khoảng cách 2 học sinh ngồi cùng bàn.
  - Tùy chỉnh kích thước và vị trí ngang/dọc của các model quà tặng (bó hoa, con mèo, bịch bánh, con heo) trên bàn.
  - Tùy chỉnh hiệu ứng lắc lư dễ thương khi nhân vật di chuyển (`0 = tắt`).
