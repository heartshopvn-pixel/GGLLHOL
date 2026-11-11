# Nâng Cấp Hệ Thống Cúp Vàng 15 Phút, Tinh Chỉnh Thẻ Tên & Vật Phẩm Bàn Học

Bản kế hoạch tổng hợp toàn bộ 5 hạng mục nâng cấp gameplay và công cụ điều khiển Dev cho **Lớp Học 12A1 Live**: chuẩn hóa phần thưởng **Cúp Vàng** cho kỳ kiểm tra 15 phút (kèm bảng **Kỷ lục cúp vàng** và huy hiệu cúp sở hữu dưới thẻ tên), hoàn thiện bộ chỉnh **chiều cao thẻ tên độc lập**, bổ sung chỉnh **tọa độ Con Heo trên bàn**, và khắc phục triệt để việc **NPC giả lập đánh Zombie bị gắn nhầm Khiên**.

## Xác Nhận & Các Quyết Định Đã Chốt

> [!IMPORTANT]
> Ba lựa chọn trải nghiệm dưới đây đã được chốt theo xác nhận của bạn và sẽ được áp dụng xuyên suốt khi triển khai:

- **Hiển thị thẻ Cúp Vàng dưới thẻ tên học sinh**: **Luôn hiển thị cho mọi học sinh** (kể cả khi đang có `0` cúp), định dạng tối giản gồm **số cúp màu vàng + icon Cúp Vàng**.
- **Cơ chế làm mới Bảng Kỷ lục cúp vàng**: **Chỉ reset thủ công** khi người điều khiển bấm nút **Reset** trên HUD/Dev (tách biệt hoàn toàn với tổng số cúp tích lũy mà từng học sinh sở hữu).
- **Lời thoại mặc định của Cô Thảo**: **Cập nhật đồng bộ sang trao Cúp Vàng** ở cả Luồng Kết Thúc vòng 15 phút (`+3 / +2 / +1` cúp vàng) và Luồng Kỷ Lục mới khi ngôi đầu Bảng Kỷ lục cúp vàng đổi chủ.

---

## 1. Tổng Quan & Mục Tiêu

- **Chức năng cốt lõi**:
  1. **Tách biệt hiệu ứng Khiên khỏi NPC đánh Zombie**: Đảm bảo mọi đòn ném quà/giả lập tấn công của NPC trong sự kiện Zombie chỉ hỗ trợ sát thương và hiệu ứng hình ảnh, không bao giờ cấp Khiên bảo vệ cho NPC ngồi trong lớp hay ngoài hàng chờ.
  2. **Chỉnh vị trí Con Heo trên bàn trong Dev**: Bổ sung bộ điều khiển dịch chuyển ngang `(X)` và dọc `(Y)` cho Con Heo trên mặt bàn học tương tự Con Mèo và Bịch Bánh.
  3. **Trao Cúp Vàng cuối vòng Kiểm tra 15 phút**: Thay thế hoàn toàn ly trà sữa ở lễ tuyên dương câu 15 bằng nghi thức phóng Cúp Vàng từ Cô Thảo tới tay Top 1, 2, 3 trên bục giảng, bật Floating Text `+3 🏆 / +2 🏆 / +1 🏆`, cầm Cúp Vàng trên tay và cập nhật lời thoại chúc mừng. *(Sự kiện đẩy lùi Zombie ở Luồng 6 vẫn giữ nguyên phần thưởng trà sữa Matcha Latte khao cả lớp).*
  4. **Hệ thống Cúp Vàng Tích Lũy & Bảng Kỷ Lục Cúp Vàng**: Lưu trữ bền vững tổng số cúp sở hữu của từng học sinh để hiển thị ngay dưới thẻ tên; đồng thời chuyển bảng kỷ lục trên HUD thành **Kỷ lục cúp vàng** chỉ thống kê số cúp giành được trong ngày/phiên hiện tại.
  5. **Chỉnh Chiều cao Thẻ Tên chuẩn xác trong Dev**: Cho phép tăng/giảm chiều cao khung thẻ tên mà không có lề đệm bên trong, giữ cố định kích thước Avatar và giữ nguyên cỡ font chữ tên.

---

## 2. Trải Nghiệm Hiển Thị & Giao Diện

### A. Luồng Tuyên Dương Cúp Vàng Cuối Vòng 15 Phút
1. Khi kết thúc câu hỏi thứ 15, Top 1, Top 2 và Top 3 bước lên bục giảng theo 3 vị trí chuẩn (`P1` cho Top 2, `P3` cho Top 1, `P5` cho Top 3).
2. Cô Thảo đọc lời tuyên dương từng bạn (Camera tự động khóa lần lượt Top 1 → Top 2 → Top 3), sau đó đọc câu trao thưởng Cúp Vàng và phát tiếng vỗ tay.
3. Đúng nhịp trao thưởng, **3 chiếc Cúp Vàng** bay theo đường vòng cung từ vị trí Cô Thảo tới tay 3 bạn với tỉ lệ kích thước danh hiệu: **Top 1 (200%)**, **Top 2 (150%)**, **Top 3 (100%)**.
4. Ngay khoảnh khắc Cúp Vàng đáp xuống tay học sinh:
   - Học sinh cầm **Cúp Vàng** lấp lánh trên tay (thay cho ly trà sữa).
   - Trên đầu mỗi bạn bật **Floating Text màu vàng kim nổi bật** hiển thị số cúp nhận được kèm icon cúp vàng: **`+3 🏆`** (Top 1), **`+2 🏆`** (Top 2), **`+1 🏆`** (Top 3).
   - Cộng ngay số cúp tương ứng vào **tổng cúp sở hữu của học sinh** và cộng vào **Bảng Kỷ lục cúp vàng** trên HUD.

### B. Bảng "Kỷ Lục Cúp Vàng" Trên HUD & Luồng Kỷ Lục
- **Tiêu đề bảng**: Đổi mặc định thành **Kỷ lục cúp vàng** (vẫn cho phép kéo thả bố cục, đổi cỡ chữ và bấm nút **Reset** thủ công).
- **Cấu trúc từng hàng Top 1 – Top 5**:
  `[Avatar]  [Tên học sinh]  ──────  [Số cúp vàng + Icon 🏆]  [Thẻ Top 1..5]`
- **Ý nghĩa chỉ số**: Chỉ hiển thị số cúp học sinh đạt được kể từ lần Reset gần nhất (số cúp trong ngày/phiên), độc lập với số cúp sở hữu lâu dài gắn dưới thẻ tên.
- **Luồng Kỷ Lục trên Bảng Lớp**: Khi vị trí Top 1 của Bảng Kỷ lục cúp vàng đổi sang một học sinh khác đang ngồi trong lớp, bảng lớp sẽ bật màn hình vinh danh **Kỷ Lục Cúp Vàng Mới** (hiển thị số cúp vàng + icon 🏆) cùng lời thoại khen ngợi của Cô Thảo.

### C. Thẻ Số Cúp Nhỏ Dưới Thẻ Tên & Cấu Trúc Thẻ Tên Mới
- **Thẻ Tên Học Sinh (Không lề trong, độc lập chiều cao)**:
  - Khi kéo thanh trượt **Chiều cao thẻ tên** trong Dev (ví dụ từ `12px` đến `36px`, mặc định `20px`):
    - Khung nền thẻ tên thay đổi đúng chiều cao pixel được chọn, **loại bỏ hoàn toàn lề đệm dọc bên trong (`py-0`, `leading-none`)**.
    - **Avatar tròn giữ nguyên kích thước gốc** (`16×16px`), căn giữa theo trục dọc và không bị phóng to hay bóp méo theo chiều cao thẻ.
    - **Chữ tên học sinh giữ nguyên cỡ font gốc** (`9.5px`), không bị kéo giãn cỡ chữ khi tăng/giảm chiều cao khung.
- **Thẻ Số Cúp Vàng Nhỏ Dưới Thẻ Tên**:
  - Gắn cố định ngay chính giữa bên dưới đáy thẻ tên cho **tất cả học sinh** (kể cả khi đang có `0` cúp).
  - Thiết kế gọn nhẹ, dễ đọc trên nền sân trường: **chữ số màu vàng sáng (`tabular-nums`) đi kèm icon Cúp Vàng nhỏ** (ví dụ: `0 🏆`, `3 🏆`, `12 🏆`).
  - Nếu học sinh đang chịu phạt đứng bảng và có thêm thẻ nhân điểm (`⚡ x3 / x6 / x9`), thẻ nhân điểm sẽ tự động dời xuống ngay bên dưới thẻ cúp vàng để hai nhãn không bao giờ chồng lên nhau.

### D. Điều Chỉnh Vị Trí Con Heo Trên Bàn & Chặn Khiên NPC Zombie
- **Trong thẻ Dev Map & Vị trí**: Khu vực chỉnh vị trí vật phẩm trên mặt bàn sẽ hiển thị đủ 3 ô điều khiển đồng bộ gồm **Con Mèo**, **Bịch Bánh** và **Con Heo trên bàn** (`Ngang X: -60px → +60px`, `Dọc Y: -60px → +60px`, kèm nút trả về `0, 0`). Độ lệch ngang tự động đối xứng gương giữa chỗ ngồi bên trái và bên phải của bàn đôi.
- **Trong sự kiện Zombie**: Khi NPC (trong lớp hoặc ngoài cửa) thực hiện giả lập tấn công Zombie bằng bất kỳ loại đạn/quà nào, hệ thống bỏ qua hoàn toàn bước cấp `hasShield`, giữ trạng thái khiên chỉ dành riêng cho người chơi thật tặng quà hợp lệ.

---

## 3. Quyết Định Sản Phẩm & Lý Do Thiết Kế

- **Tách riêng 2 bộ đếm Cúp Vàng (Cúp Sở Hữu Dài Hạn vs. Cúp Kỷ Lục Trong Ngày)**:
  - *Phương án chọn*: Lưu hai kho dữ liệu độc lập — một bảng băm bền vững lưu **tổng cúp tích lũy** gắn theo tên định danh học sinh (hiển thị dưới thẻ tên, lưu lâu dài qua các ngày như EXP), và danh sách **Kỷ lục cúp vàng** lưu số cúp đạt được trong ngày/phiên (có nút Reset riêng).
  - *Lý do*: Đúng với yêu cầu vừa tôn vinh thành tích tích lũy lâu dài của học sinh gắn bó với kênh, vừa giữ sự cạnh tranh sôi nổi mỗi buổi live trên bảng Kỷ lục cúp vàng mà khi bấm Reset bảng ngày không làm mất cúp tích lũy của học sinh.
- **Tách hiệu ứng bay Cúp Vàng khỏi hiệu ứng Trà Sữa**:
  - *Phương án chọn*: Bổ sung chế độ vật phẩm bay `trophy` cho nghi thức trao giải cuối vòng 15 phút (vẽ SVG Cúp Vàng hai quai ánh kim sắc nét kèm hào quang nhẹ), trong khi giữ nguyên chế độ `milk_tea` cho Luồng 6 của sự kiện Zombie.
  - *Lý do*: Đảm bảo câu 15 trao đúng Cúp Vàng sang trọng mà không làm ảnh hưởng tới phần thưởng trà sữa Matcha Latte của sự kiện đẩy lùi Zombie.
- **Đồng bộ khoảng cách lệch ghế đôi theo Chiều Cao Thẻ Tên mới**:
  - *Phương án chọn*: Tính độ lệch cao-thấp giữa bạn ngồi bên trái và bên phải cùng bàn dựa trên tích của `(chiều cao thẻ tên tùy chỉnh + phần thẻ cúp nhỏ) × hệ số phóng thẻ tên`.
  - *Lý do*: Ngăn chặn tình trạng khi Dev tăng chiều cao thẻ tên hoặc thêm nhãn cúp bên dưới làm thẻ của hai bạn ngồi chung bàn chạm vào nhau.

---

## 4. Kiến Trúc Kỹ Thuật & Luồng Dữ Liệu

### Sơ Đồ Kiến Trúc & Luồng Cập Nhật Trạng Thái

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        BỘ ĐIỀU KHIỂN TRUNG TÂM LỚP HỌC                      │
│                                                                             │
│  ┌──────────────────────────┐         ┌──────────────────────────────────┐  │
│  │ Luồng Kết Thúc 15 Phút   │         │ Bộ Xử Lý Quà & Đạn Sự Kiện Zombie│  │
│  │ (Top 1: +3, Top 2: +2,   │         │ - Kiểm tra cờ NPC giả lập        │  │
│  │  Top 3: +1 Cúp Vàng)     │         │ - Chặn cấp Khiên cho mọi NPC     │  │
│  └────────────┬─────────────┘         └─────────────────┬────────────────┘  │
│               │                                         │                   │
│               ▼                                         ▼                   │
│  ┌──────────────────────────────────────┐   ┌────────────────────────────┐  │
│  │ Kho Lưu Trữ Cúp Vàng Đa Tầng         │   │ Cấu Hình Giao Diện Dev     │  │
│  │ 1. Tổng Cúp Sở Hữu (RAM + Browser    │   │ - Tọa độ X/Y Con Heo bàn   │  │
│  │    Storage + Server JSON + Backup)   │   │ - Chiều cao Thẻ Tên (px)   │  │
│  │ 2. Bảng Kỷ Lục Cúp Vàng Trong Ngày   │   │   không lề, giữ cỡ Avatar  │  │
│  │    (Chỉ tăng khi trao cúp, Reset tay)│   │   & giữ nguyên cỡ Font tên │  │
│  └─────────┬──────────────────┬─────────┘   └──────┬─────────────┬───────┘  │
└────────────┼──────────────────┼────────────────────┼─────────────┼──────────┘
             │                  │                    │             │
             ▼                  ▼                    ▼             ▼
┌─────────────────────┐ ┌──────────────────┐ ┌──────────────┐ ┌───────────────┐
│ Nhân Vật Học Sinh   │ │ Bảng HUD & Bảng  │ │ Sân Khấu 2D  │ │ Mặt Bàn Học   │
│ - Tay cầm Cúp Vàng  │ │ Lớp Học          │ │ - Vật thể    │ │ Đôi           │
│ - Floating +3/2/1 🏆│ │ - Kỷ lục cúp vàng│ │   Cúp Vàng   │ │ - Con Heo lệch│
│ - Nhãn [Số 🏆] dưới │ │   (Số 🏆 + Rank) │ │   bay tới    │ │   theo X/Y    │
│   đáy Thẻ Tên       │ │ - Vinh danh Top 1│ │   bục P1,3,5 │ │   đối xứng    │
└─────────────────────┘ └──────────────────┘ └──────────────┘ └───────────────┘
```

### Mô Hình Dữ Liệu & Quản Lý Trạng Thái
1. **Dữ liệu Cúp Vàng sở hữu của học sinh**:
   - Bảng tra cứu nhanh trong bộ nhớ ánh xạ tên định danh chuẩn hóa (`lowercase`) sang tổng số cúp vàng sở hữu, đồng bộ thời gian thực sang màn hình Live/OBS, tự động lưu ngầm xuống trình duyệt, máy chủ và tệp sao lưu JSON (tương tự cơ chế lưu EXP hiện có).
   - Mỗi thực thể học sinh (trong lớp và ngoài cửa) mang thuộc tính số cúp sở hữu hiện tại và quy mô Cúp Vàng cầm trên tay khi đứng bục vinh danh.
2. **Dữ liệu Bảng Kỷ lục cúp vàng trong ngày**:
   - Tận dụng cấu trúc danh sách Top 5 kỷ lục hiện có nhưng chuyển nguồn cập nhật sang **sự kiện trao Cúp Vàng cuối vòng 15 phút** (ngừng cộng điểm Hoa Điểm 10 vào bảng này để bảng phản ánh đúng 100% số cúp vàng trong ngày).
   - Khi khởi tạo từ dữ liệu cũ (nếu từng lưu điểm số cao bất thường trước khi nâng cấp), bổ sung cờ phiên bản cấu trúc để khởi tạo sạch sẽ về bảng kỷ lục cúp vàng chuẩn xác, sau đó chỉ xóa khi người dùng bấm nút **Reset**.
3. **Cấu hình Thẻ Tên & Con Heo trên bàn**:
   - Thêm thông số `nameTagHeight` (mặc định `20px`) vào cấu hình chung: áp dụng trực tiếp lên chiều cao khung thẻ tên với `padding-top: 0; padding-bottom: 0`, tách rời khỏi kích thước cố định của khung ảnh đại diện và cỡ chữ tên.
   - Thêm cặp thông số `deskPigOffsetX` và `deskPigOffsetY` (mặc định `0`) vào cấu hình tỉ lệ & vị trí vật phẩm trên bàn, truyền xuống bộ vẽ bàn đôi kèm kiểm tra so sánh tối ưu render để kéo thanh trượt trong Dev phản hồi tức thì trên sân khấu.
