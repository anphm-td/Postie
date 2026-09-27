# Lộ trình tính năng Postie POS — đối chiếu với KiotViet

> Ngày lập: 2026-09-27 · Đối tượng: Postie POS (Electron + SQLite offline) · Đối chiếu: KiotViet Retail
>
> **Nguồn dữ liệu & phương pháp:**
> - Nội dung 43 tính năng KiotViet (mô tả + URL nguồn gốc) và các xếp hạng Trạng thái / Công sức / Giá trị ở mục 4–5 là dữ liệu nghiên cứu & phân tích khoảng cách được cung cấp sẵn cho tài liệu này; phần viết lại không tự phát minh lại các xếp hạng đó.
> - Toàn bộ **bằng chứng code đã được xác minh trực tiếp trong repo ngày 2026-09-27**: đọc trọn vẹn `db/schema.sql`, `electron/db/connection.ts`, `electron/ipc.ts`, `electron/db/repositories/{orders,shifts,products}.ts`, `src/renderer/routes/{Register,Products,Reports}.tsx`, `src/renderer/components/pos/{PaymentDialog,Cart,ProductSearch,StockAdjustDialog}.tsx`, `src/shared/types.ts`, `App.tsx`, `idea.txt`. Không còn mốc nào chỉ trích theo phân tích cũ.
> - Kiểm tra đã chạy: `grep -rniE "thermal|escpos|window\.print|node-thermal" src electron` → **0 kết quả** (exit 1); `grep -rniE "print|receipt|escpos|thermal" src electron` → chỉ 3 dòng đều là comment/CSS (`index.css:68,70`, `Register.tsx:382`); `grep -rniE "categories|supplier|returns" electron --include=*.ts` → chỉ cột `category_id`/`supplier_id` trong `products.ts` và vài dòng comment, **không có repository nào** cho categories/suppliers/returns (khớp `ipc.ts:10-15` chỉ đăng ký 6 repo: users/products/orders/shifts/customers/payment_methods).
> - Hai lỗi dữ liệu của bản phân tích cũ đã được sửa khi xác minh: bố cục 2 panel là `Register.tsx:206-339` (không phải `App.tsx` — file chỉ có 127 dòng), và mã type 3=adjust/4=wastage nằm ở `types.ts:11`.
> - Lỗi xuất bản của bản trước đã được sửa: (1) **thiếu** — bảng 3.3 thiếu dòng "Bán online đa kênh (omnichannel)" khiến mục 3 chỉ có 42/43 tính năng dù bảng mục 4 đủ 43 dòng; dòng này đã được bổ sung theo đúng bản ghi tương ứng trong bảng khoảng cách (mục 4) và nguồn KiotViet Online, mức "Cốt lõi" căn theo tính năng đồng bộ sàn TMĐT cùng nguồn; (2) **sai định dạng** — một dòng bảng ở mục 4 có 7 cột thay vì 6 (ký tự `|` không escape trong ô "Thanh toán đa kênh") và một ký tự CJK lỗi lẫn trong tiếng Việt ở ô "In hóa đơn sau thanh toán" (đã thay bằng "sao chép").

---

## 1. Tóm tắt điều hành

- **Postie đã có nền offline-native vững**: SQLite local (`<userData>/postie.db` — `connection.ts:100-104`, WAL + PRAGMA tối ưu — `schema.sql:34-41`), bán hàng không cần internet. Trong 43 tính năng KiotViet đối chiếu, **quét mã vạch là mục duy nhất Postie đã có trọn vẹn**.
- **Tỷ lệ khoảng cách**: 1 đã có · 15 có một phần · 27 còn thiếu. Nhưng **cả 13 mục giá trị thấp đều thuộc nhóm thiếu** (đa chi nhánh, sàn TMĐT, app mobile, Serial/IMEI…) — phần "thiếu" chủ yếu là tính năng Postie *không cần vội*, không phải lỗ hổng.
- **11/43 mục giá trị cao, trong đó 10 mục công sức S hoặc M** — phần lớn chỉ là thiếu lớp UI/IPC trên dữ liệu đã có sẵn trong schema (ví dụ: `order_payments` hỗ trợ split-tender từ đầu — `schema.sql:241-250` — nhưng UI chỉ cho 1 phương thức/đơn).
- **5 khoảng cách đau nhất tại quầy hằng ngày**: (1) chỉ 1 phương thức thanh toán/đơn; (2) không in được hóa đơn (0 dòng code in trong toàn repo — đã xác minh bằng grep); (3) chưa có quy trình nhập–kiểm–trả hàng; (4) đơn treo chỉ nằm trong `useState` (Register.tsx:49,128-153), mất khi restart app; (5) báo cáo không có lợi nhuận vì `order_details` không snapshot giá vốn (`schema.sql:228-239`).
- **Nhiều thứ "thiếu" thực ra chỉ thiếu 1 IPC + 1 màn hình**: thẻ kho (`stock_movements` ghi đủ mọi thay đổi + index `idx_stock_movements_prod_time` — `schema.sql:328`), báo cáo theo nhân viên (`orders.user_id` + `idx_orders_user` — `schema.sql:208,312`), NCC (bảng `suppliers` có sẵn — `schema.sql:126-134`), trả hàng (bảng `returns`/`return_details` — `schema.sql:267-286` — có sẵn nhưng chưa repo/UI nào dùng).
- **P0 — hoàn tất quầy bán** (thanh toán đa dòng, in hóa đơn 80mm + hủy đơn, hotkey F2/F4/F9, kết ca đủ, giảm giá theo dòng, nhóm hàng, báo cáo theo nhân viên): toàn bộ công sức S/M, giá trị cao.
- **P1 — kho đúng & con số thật**: snapshot `cost_cents` → báo cáo lợi nhuận; phiếu nhập hàng + NCC; kiểm kho; trả hàng; đơn treo xuống DB; QR VietQR tĩnh; in tem mã vạch; import CSV; backup tự động khi đóng ca.
- **P2 — tăng trưởng & tuân thủ, theo nhu cầu khách thực tế**: engine khuyến mại, variants/đơn vị quy đổi, combo, HĐĐT (khi đạt ngưỡng 1 tỷ/năm theo NĐ 70/2025), QR webhook ngân hàng, sổ kế toán TT152-lite. **Không đưa vào lộ trình ngắn hạn**: đa kho, chuyển kho, omnichannel, app mobile, Serial/IMEI, vận chuyển — công sức L nhưng giá trị low với shop 1 quầy.

---

## 2. Tổng quan KiotViet

KiotViet là nền tảng quản lý bán hàng đa kênh chạy trên nền tảng cloud cho Retail và FNB, bao trùm trọn vòng đời cửa hàng: bán hàng tại quầy (POS đa chế độ, quét mã vạch, thanh toán đa kênh kèm QR đối soát ngân hàng), vận hành kho (nhập hàng, kiểm kho, chuyển hàng, lô–hạn sử dụng, combo, Serial/IMEI), báo cáo phân tích đa chiều, kết nối sàn TMĐT/Fanpage/đơn vị vận chuyển, và tầng tuân thủ (hóa đơn điện tử khởi tạo từ máy tính tiền theo Nghị định 70/2025/NĐ-CP, chữ ký số RMS, sổ kế toán hộ kinh doanh theo Thông tư 152). Điểm mạnh nổi bật là hệ sinh thái khép kín: thiết bị phần cứng (máy in tem, máy POS) + app nhân viên/chủ shop + tự đồng bộ tồn kho–giá–đơn giữa các kênh theo thời gian thực, đồng thời vẫn bán được khi mất mạng.

**Danh mục nguồn (đúng URL từ dữ liệu nghiên cứu):**

| Nguồn | URL |
|---|---|
| Hướng dẫn bán hàng | https://www.kiotviet.vn/huong-dan-su-dung-kiotviet/retail-ban-hang/ban-hang |
| Hướng dẫn thanh toán | https://www.kiotviet.vn/huong-dan-su-dung-kiotviet/retail-thanh-toan/thanh-toan |
| KiotViet Finance — thanh toán QR | https://finance.kiotviet.vn/thanh-toan.html |
| Hướng dẫn FNB — Kết ca | https://www.kiotviet.vn/huong-dan-su-dung-kiotviet/fnb-ket-ca/ket-ca/ |
| Hướng dẫn máy in tem nhãn | https://www.kiotviet.vn/huong-dan-su-dung-kiotviet/retail-thiet-bi-phan-cung/may-in-tem-nhan |
| Hướng dẫn khuyến mại | https://www.kiotviet.vn/huong-dan-su-dung-kiotviet/retail-khuyen-mai/khuyen-mai |
| Hóa đơn điện tử KiotViet | https://hoadondientu.kiotviet.vn/ |
| KiotViet Online (omnichannel) | https://banhangonline.kiotviet.vn/ |
| Hướng dẫn danh sách hàng hóa | https://www.kiotviet.vn/huong-dan-su-dung-kiotviet/retail-hang-hoa/danh-sach-hang-hoa/ |
| Hướng dẫn kiểm kho | https://www.kiotviet.vn/huong-dan-su-dung-kiotviet/retail-hang-hoa/kiem-kho/ |
| Hướng dẫn nhập hàng | https://www.kiotviet.vn/huong-dan-su-dung-kiotviet/retail-giao-dich/nhap-hang/ |
| Hướng dẫn nhà cung cấp | https://www.kiotviet.vn/huong-dan-su-dung-kiotviet/retail-nha-cung-cap/nha-cung-cap/ |
| Hướng dẫn hàng hóa thường | https://www.kiotviet.vn/huong-dan-su-dung-kiotviet/retail-hang-hoa/hang-hoa-thuong/ |
| Hướng dẫn quản lý kho hàng | https://www.kiotviet.vn/huong-dan-su-dung-kiotviet/retail-thiet-lap/quan-ly-kho-hang/ |
| Hướng dẫn chuyển hàng | https://www.kiotviet.vn/huong-dan-su-dung-kiotviet/retail-hang-hoa/chuyen-hang/ |
| Hướng dẫn đặt hàng nhập | https://www.kiotviet.vn/huong-dan-su-dung-kiotviet/retail-giao-dich/dat-hang-nhap/ |
| Hướng dẫn hàng Combo – đóng gói | https://www.kiotviet.vn/huong-dan-su-dung-kiotviet/retail-hang-hoa/hang-combo-dong-goi/ |
| Hướng dẫn hàng Lô – Hạn sử dụng | https://www.kiotviet.vn/huong-dan-su-dung-kiotviet/retail-hang-hoa/hang-hoa-lo-han-su-dung/ |
| Hướng dẫn hàng Serial/IMEI | https://www.kiotviet.vn/huong-dan-su-dung-kiotviet/retail-hang-hoa/hang-hoa-serial-imei/ |
| Phân tích kinh doanh thông minh | https://www.kiotviet.vn/phan-tich-kinh-doanh-thong-minh-tren-phan-mem-quan-ly-ban-hang |
| Hướng dẫn báo cáo | https://www.kiotviet.vn/huong-dan-su-dung-kiotviet/retail-bao-cao/bao-cao |
| Hướng dẫn báo cáo hàng hóa | https://www.kiotviet.vn/huong-dan-su-dung-kiotviet/huong-dan-bao-cao/bao-cao-hang-hoa |
| Hướng dẫn báo cáo nhân viên | https://www.kiotviet.vn/huong-dan-su-dung-kiotviet/huong-dan-bao-cao/bao-cao-nhan-vien |
| KiotViet Employee (chấm công/lương) | https://employee.kiotviet.vn/ |
| KiotViet trang chủ (app mobile) | https://kiotviet.vn/ |
| KiotViet kho hàng | https://www.kiotviet.vn/kho-hang/ |
| Sổ kế toán hộ kinh doanh | https://www.kiotviet.vn/huong-dan-su-dung-kiotviet/retail-ke-toan-hkd-so-ke-toan/so-ke-toan |
| Giải pháp giao hàng | https://www.kiotviet.vn/giai-phap-giao-hang-ngay-tren-kiotviet/ |
| Công nghệ (cloud) | https://www.kiotviet.vn/cong-nghe/ |

---

## 3. Tính năng KiotViet theo 3 mảng

> 43 tính năng, chia 3 mảng: **Bán hàng POS** (10), **Quản lý kho & hàng hóa** (17), **Báo cáo, tuân thủ & kết nối** (16). Mức quan trọng giữ nguyên theo dữ liệu: `core` (cốt lõi) / `useful` (hữu ích) / `advanced` (nâng cao).

### 3.1 Bán hàng POS

| Tên | Mô tả | Mức quan trọng | Nguồn |
|---|---|---|---|
| Bán hàng tại quầy (POS) đa chế độ | Màn hình Bán hàng có 3 chế độ: "Bán nhanh" (tối ưu nhập liệu bằng bàn phím và máy quét mã vạch), "Bán thường" (chọn sản phẩm theo hình ảnh, lọc theo nhóm hàng/thuộc tính màu–size) và "Bán giao hàng". Nhân viên tìm hàng theo mã/tên, thêm hàng mới ngay tại màn hình bán, tìm khách bằng F4, nhấn Thanh toán (F9) để kết thúc và in hóa đơn. | Cốt lõi (core) | [Hướng dẫn bán hàng](https://www.kiotviet.vn/huong-dan-su-dung-kiotviet/retail-ban-hang/ban-hang) |
| Quét mã vạch khi bán | Màn hình bán hàng hỗ trợ "Sử dụng máy quét mã vạch để thêm sản phẩm tự động" — quét mã là hàng hóa được đưa thẳng vào hóa đơn với đúng số lượng và giá. Chế độ Bán nhanh được thiết kế riêng cho việc quét liên tục tại quầy, giúp tăng tốc độ thanh toán. | Cốt lõi (core) | [Hướng dẫn bán hàng](https://www.kiotviet.vn/huong-dan-su-dung-kiotviet/retail-ban-hang/ban-hang) |
| Thanh toán đa kênh | Một hóa đơn thanh toán được bằng "Tiền mặt, Thẻ, VietQR, Ví điện tử, Điểm tích lũy, Voucher", có thể kết hợp nhiều phương thức trong cùng một đơn (nhập số tiền cho từng hình thức). Hệ thống tự tính tiền thừa, gợi ý tiền khách trả, kèm phím tắt cho thu ngân. | Cốt lõi (core) | [Hướng dẫn thanh toán](https://www.kiotviet.vn/huong-dan-su-dung-kiotviet/retail-thanh-toan/thanh-toan) |
| Thanh toán QR thông báo tiền về | Khi khách quét QR, KiotViet "thông báo chính xác số tiền nhận được... trên màn hình thu ngân" ngay khi giao dịch thành công — thu ngân không cần chụp ảnh chuyển khoản để đối soát. Hỗ trợ QR động chứa số tiền + nội dung chuyển khoản, tự động hoàn thành đơn khi quét QR thành công, khớp giao dịch QR với đơn tạm, miễn phí kích hoạt và có báo cáo doanh thu QR. | Hữu ích (useful) | [KiotViet Finance](https://finance.kiotviet.vn/thanh-toan.html) |
| Kết ca — ca làm việc và két tiền | Tính năng Kết ca của KiotViet (cho ngành FNB) giúp giám sát thu chi tiền mặt theo từng ca: mở ca khai báo tiền mặt đầu ca, đóng ca đối chiếu tiền bàn giao thực tế với số liệu hệ thống, in phiếu bàn giao và xem lịch sử ca để tránh thất thoát. | Cốt lõi (core) | [Hướng dẫn Kết ca](https://www.kiotviet.vn/huong-dan-su-dung-kiotviet/fnb-ket-ca/ket-ca/) |
| In hóa đơn sau thanh toán | Sau khi nhấn Thanh toán, hệ thống kết thúc giao dịch và in hóa đơn cho khách; thu ngân có thể sửa/hủy/sao chép hóa đơn từ mục Đơn hàng → Hóa đơn. KiotViet còn có mục Quản lý Mẫu in để thiết lập các mẫu in hóa đơn/tem theo nhu cầu cửa hàng. | Cốt lõi (core) | [Hướng dẫn bán hàng](https://www.kiotviet.vn/huong-dan-su-dung-kiotviet/retail-ban-hang/ban-hang) |
| Khuyến mại và giảm giá | Các hình thức khuyến mại: "Giảm giá hóa đơn, Tặng hàng, Giảm giá hàng, Tặng điểm, Tặng voucher, Mua hàng giảm giá hàng, Mua hàng tặng hàng, Mua hàng tặng điểm, Giá bán theo số lượng mua, Mua hàng tặng voucher" — thiết lập hiệu lực theo thời gian (kể cả "giờ vàng"), phạm vi chi nhánh/nhóm khách và áp dụng tự động qua biểu tượng Hộp quà khi bán. Ngoài ra thu ngân giảm giá thủ công theo từng sản phẩm hoặc toàn hóa đơn, nhập Coupon/Voucher ở bước thanh toán. | Cốt lõi (core) | [Hướng dẫn khuyến mại](https://www.kiotviet.vn/huong-dan-su-dung-kiotviet/retail-khuyen-mai/khuyen-mai) |
| Đặt hàng / giữ đơn | Có thể tạo trước phiếu đặt hàng trên màn hình Đặt hàng riêng rồi liên kết với hóa đơn khi khách đến nhận hàng; đơn đặt hàng giữ nguyên khuyến mại tại thời điểm đặt. Hóa đơn gắn với phiếu đặt hàng sẽ khóa thông tin khách hàng để tránh sai lệch. | Hữu ích (useful) | [Hướng dẫn bán hàng](https://www.kiotviet.vn/huong-dan-su-dung-kiotviet/retail-ban-hang/ban-hang) |
| Trả hàng theo hóa đơn | Khách trả hàng được xử lý theo hóa đơn gốc, áp dụng cho hóa đơn ở trạng thái "Hoàn thành"; khi trả hàng, giá trị được tính lại theo giá đã giảm (khuyến mại) và lịch sử thanh toán của hóa đơn xem được ngay trong chi tiết hóa đơn. | Hữu ích (useful) | [Hướng dẫn bán hàng](https://www.kiotviet.vn/huong-dan-su-dung-kiotviet/retail-ban-hang/ban-hang) |
| Bán hàng trên điện thoại và máy POS | Quy trình bán được tối ưu cho điện thoại và máy POS cảm ứng: chạm nút Thanh toán, chọn nhanh phương thức, QR động hiển thị ngay trên màn hình máy POS với nút phóng to mã. KiotViet còn cung cấp dòng máy POS Android làm quầy bán di động (thấy trong mục Thiết bị phần cứng của hướng dẫn sử dụng). | Hữu ích (useful) | [Hướng dẫn thanh toán](https://www.kiotviet.vn/huong-dan-su-dung-kiotviet/retail-thanh-toan/thanh-toan) |

### 3.2 Quản lý kho & hàng hóa

| Tên | Mô tả | Mức quan trọng | Nguồn |
|---|---|---|---|
| In tem mã vạch cho hàng hóa | Từ danh mục hàng hóa, tích chọn sản phẩm và nhấn "In tem mã" để in tem giá/mã vạch (chọn nội dung: Mã hàng, Bảng giá, Đơn vị tiền tệ, Đơn vị tính, Tên cửa hàng; khổ tem như 72x22mm), hoặc in tem ngay từ phiếu nhập/chuyển hàng cho cả lô hàng mới. Hướng dẫn kết nối các máy in nhiệt KiotViet cung cấp (Xprinter XP-365B/XP-350B, HPRT-LPQ80) qua USB, LAN hoặc điện thoại/máy POS; tem mã vạch giúp "Tăng tốc độ thanh toán" khi thu ngân quét tại quầy. | Cốt lõi (core) | [Máy in tem nhãn](https://www.kiotviet.vn/huong-dan-su-dung-kiotviet/retail-thiet-bi-phan-cung/may-in-tem-nhan) |
| Danh mục hàng hóa & phân loại | Khởi tạo và quản lý tập trung toàn bộ sản phẩm: nhóm hàng cha/con (VD "Áo Sơ Mi Nam" trong "Áo Sơ Mi"), thương hiệu, vị trí kệ/tủ trưng bày, tự sinh mã hàng, và hỗ trợ 4 loại hàng: hàng hóa, dịch vụ, Combo – đóng gói, hàng sản xuất. Thêm/sửa hàng loạt bằng import file Excel, sao chép sản phẩm, ngừng kinh doanh hàng loạt. | Cốt lõi (core) | [Danh sách hàng hóa](https://www.kiotviet.vn/huong-dan-su-dung-kiotviet/retail-hang-hoa/danh-sach-hang-hoa/) |
| Theo dõi tồn kho theo chi nhánh & thẻ kho | Tab Tồn kho hiển thị số lượng tồn hiện tại của từng sản phẩm ở từng chi nhánh; tab Thẻ kho ghi lại toàn bộ lịch sử thay đổi số lượng qua từng giao dịch (nhập hàng, bán hàng, kiểm kho...). Bộ lọc còn có tiêu chí Tồn kho, Dự kiến hết hàng để chủ cửa hàng chủ động nhập hàng. | Cốt lõi (core) | [Danh sách hàng hóa](https://www.kiotviet.vn/huong-dan-su-dung-kiotviet/retail-hang-hoa/danh-sach-hang-hoa/) |
| Kiểm kho (kiểm kê) | Tạo phiếu kiểm kho để đối chiếu số sách với tồn thực tế: thêm hàng bằng tìm kiếm, quét mã vạch, chọn theo nhóm hàng hoặc import Excel; điền số thực tế và hệ thống tự tính chênh lệch; nhấn Hoàn thành là kho được cân bằng về số thực tế chỉ với một cú nhấp. Hỗ trợ lưu tạm, gộp nhiều phiếu kiểm của nhiều nhân viên, hủy phiếu để khôi phục tồn, và làm trực tiếp trên app điện thoại. | Cốt lõi (core) | [Kiểm kho](https://www.kiotviet.vn/huong-dan-su-dung-kiotviet/retail-hang-hoa/kiem-kho/) |
| Nhập hàng (nhận hàng từ NCC) | Phiếu nhập hàng ghi nhận từng lần nhập và cập nhật tồn kho tức thì: quét mã vạch, nhập nhanh tăng số lượng mỗi lần quét, import Excel, thêm nhiều mức giá khuyến mãi của NCC và sửa giá bán ngay trên phiếu. Ghi nhận thanh toán/công nợ tự động khi chưa trả đủ, hỗ trợ quản lý chi phí nhập hàng (vận chuyển, bốc dỡ) phân bổ vào giá vốn, và in tem mã vạch ngay sau khi nhập. | Cốt lõi (core) | [Nhập hàng](https://www.kiotviet.vn/huong-dan-su-dung-kiotviet/retail-giao-dich/nhap-hang/) |
| Quản lý nhà cung cấp & công nợ phải trả | Lưu trữ, phân loại toàn bộ nhà cung cấp tại một nơi; có thể thêm nhanh NCC ngay khi tạo phiếu nhập/đặt hàng/trả hàng. Theo dõi lịch sử nhập/trả hàng theo từng NCC, ghi nhận và thanh toán công nợ, import/export danh sách ra Excel. | Cốt lõi (core) | [Nhà cung cấp](https://www.kiotviet.vn/huong-dan-su-dung-kiotviet/retail-nha-cung-cap/nha-cung-cap/) |
| Thuộc tính phiên bản & đơn vị tính quy đổi | Bật tính năng "Quản lý theo đơn vị tính và thuộc tính" để tạo sản phẩm nhiều phiên bản (áo nhiều màu, nhiều size) với thuộc tính như hương vị, dung tích, màu sắc, đồng thời thiết lập nhiều đơn vị tính (chai, lốc, thùng) kèm công thức quy đổi (1 lốc = 4 chai, 1 thùng = 20 lốc) để tính nhanh giá và tồn kho. | Cốt lõi (core) | [Hàng hóa thường](https://www.kiotviet.vn/huong-dan-su-dung-kiotviet/retail-hang-hoa/hang-hoa-thuong/) |
| In tem nhãn mã vạch | Tích chọn sản phẩm trong Danh sách hàng hóa rồi nhấn In tem mã, chọn số lượng tem, thông tin hiển thị trên tem (tên sản phẩm, giá bán, mã vạch) và mẫu giấy in; tem in ra dùng cho việc bán hàng và kiểm kho bằng máy quét. Thao tác được trên cả web và app điện thoại với máy in tem. | Cốt lõi (core) | [Hàng hóa thường](https://www.kiotviet.vn/huong-dan-su-dung-kiotviet/retail-hang-hoa/hang-hoa-thuong/) |
| Quản lý đa kho trong một chi nhánh | Phân chia hàng hóa theo nhiều kho riêng biệt trong cùng chi nhánh (kho bán lẻ, kho bán buôn, kho online...), mỗi kho theo dõi tồn riêng nhưng dùng chung danh mục giá bán/giá vốn; khi bán hàng chọn kho làm việc và hệ thống tự trừ tồn đúng kho đã chọn. Số kho được phép thêm phụ thuộc gói dịch vụ (thêm kho tốn 150.000đ/kho/tháng). | Hữu ích (useful) | [Quản lý kho hàng](https://www.kiotviet.vn/huong-dan-su-dung-kiotviet/retail-thiet-lap/quan-ly-kho-hang/) |
| Chuyển hàng giữa chi nhánh/kho | Tạo phiếu chuyển hàng để luân chuyển hàng nội bộ giữa các kho cùng chi nhánh hoặc giữa các chi nhánh (thêm hàng bằng tìm kiếm, quét mã vạch hoặc Excel, hỗ trợ cả hàng lô và Serial/IMEI). Phiếu ở trạng thái "Đang chuyển", chi nhánh nhận nhập số thực nhận và ghi chú chênh lệch, sau đó tồn kho hai đầu được tự động cập nhật. | Hữu ích (useful) | [Chuyển hàng](https://www.kiotviet.vn/huong-dan-su-dung-kiotviet/retail-hang-hoa/chuyen-hang/) |
| Đặt hàng nhập & đề xuất hàng nhập | Lập phiếu đặt hàng nhập gửi nhà cung cấp, theo dõi xác nhận và tiến độ giao hàng, khi nhập về thì chuyển thành phiếu nhập kho. Tính năng Đề xuất hàng nhập tự gợi ý mặt hàng cần nhập theo bộ lọc (dưới định mức tồn, hết hàng, bán trong 30 ngày qua, theo NCC/nhóm hàng) và tự điền số lượng; trên phiếu hiển thị đồng thời Tồn kho, Đặt NCC và KH đặt để quyết định chính xác. | Hữu ích (useful) | [Đặt hàng nhập](https://www.kiotviet.vn/huong-dan-su-dung-kiotviet/retail-giao-dich/dat-hang-nhap/) |
| Hàng Combo – đóng gói | Gộp nhiều mặt hàng bán riêng lẻ thành một combo/giỏ quà (VD giỏ quà Tết gồm bánh, trà, rượu). Khi bán combo, hệ thống tự động trừ tồn kho của từng hàng thành phần, còn giá vốn combo được tính bằng tổng giá vốn các thành phần. | Hữu ích (useful) | [Hàng Combo – đóng gói](https://www.kiotviet.vn/huong-dan-su-dung-kiotviet/retail-hang-hoa/hang-combo-dong-goi/) |
| Hàng hóa Lô – Hạn sử dụng (FEFO) | Quản lý tồn kho và giá vốn đến từng lô hàng; mọi nhập, xuất, chuyển, hủy đều ghi nhận theo lô. Hệ thống tự gợi ý xuất bán theo nguyên tắc FEFO (hết hạn trước – xuất trước), cảnh báo bằng màu sắc trên màn hình bán hàng và có báo cáo lô sắp hết hạn/đã hết hạn để chủ động xả hàng. | Hữu ích (useful) | [Hàng Lô – Hạn sử dụng](https://www.kiotviet.vn/huong-dan-su-dung-kiotviet/retail-hang-hoa/hang-hoa-lo-han-su-dung/) |
| Tự động gợi ý thông tin hàng hóa theo mã vạch | Khi thêm mới hàng hóa, quét mã vạch và KiotViet gợi ý sản phẩm từ dữ liệu mẫu kèm tự động điền tên, mã vạch, hình ảnh, mô tả để giảm thời gian nhập liệu. Áp dụng 8 ngành hàng (tạp hóa, điện máy, sách VPP, mỹ phẩm, mẹ và bé, nông sản, vật liệu xây dựng, nhà thuốc) trên 4 màn hình: Danh sách hàng hóa, Nhập hàng, Kiểm kho và Bán hàng. | Hữu ích (useful) | [Danh sách hàng hóa](https://www.kiotviet.vn/huong-dan-su-dung-kiotviet/retail-hang-hoa/danh-sach-hang-hoa/) |
| Hàng hóa Serial/IMEI | Mỗi sản phẩm được quản lý bằng một mã Serial/IMEI duy nhất xuyên suốt từ nhập kho đến khi bán, bao gồm cả phiếu chuyển hàng. Giúp tra cứu bảo hành, xử lý khiếu nại nhanh và phát hiện tráo đổi hàng/sai lệch tồn kho. | Nâng cao (advanced) | [Serial/IMEI](https://www.kiotviet.vn/huong-dan-su-dung-kiotviet/retail-hang-hoa/hang-hoa-serial-imei/) |
| Hàng sản xuất từ nguyên vật liệu | Tạo sản phẩm hoàn toàn mới qua chế biến, lắp ráp từ các nguyên vật liệu đầu vào (VD bánh làm từ bột, trứng, đường); giá vốn thành phẩm được tính bằng tổng giá vốn các nguyên vật liệu cấu thành. | Nâng cao (advanced) | [Danh sách hàng hóa](https://www.kiotviet.vn/huong-dan-su-dung-kiotviet/retail-hang-hoa/danh-sach-hang-hoa/) |
| Chuyển kho liên chi nhánh | Chuyển hàng giữa các cửa hàng/chi nhánh khi nơi này thiếu nơi kia tồn đọng, thông tin điều chỉnh tồn kho cập nhật trên hệ thống mà không ảnh hưởng số liệu kinh doanh của từng cửa hàng; kết hợp bộ lọc báo cáo theo chi nhánh để quản lý chuỗi. | Nâng cao (advanced) | [Kho hàng](https://www.kiotviet.vn/kho-hang/) |

### 3.3 Báo cáo, tuân thủ & kết nối

| Tên | Mô tả | Mức quan trọng | Nguồn |
|---|---|---|---|
| Phân tích kinh doanh thông minh | Tổng hợp tự động 4 nhóm phân tích (bán hàng, hàng hóa, khách hàng, tài chính) với biểu đồ trực quan thay thế sổ sách và Excel: hóa đơn, doanh thu, doanh thu thuần, giá vốn, lợi nhuận gộp/thuần, có lọc theo thời gian, chi nhánh và kênh bán. | Cốt lõi (core) | [Phân tích kinh doanh](https://www.kiotviet.vn/phan-tich-kinh-doanh-thong-minh-tren-phan-mem-quan-ly-ban-hang) |
| Bộ báo cáo đa chiều theo kênh và chi nhánh | 7 nhóm báo cáo (cuối ngày, bán hàng, hàng hóa, khách hàng, nhà cung cấp, kênh bán hàng, tài chính) xem được trên máy tính, điện thoại và máy POS, lọc theo thời gian, chi nhánh, kênh bán, phương thức thanh toán và nhân viên; hạch toán doanh thu, giá vốn, chi phí (voucher, lương, điểm thưởng) và lợi nhuận. | Cốt lõi (core) | [Hướng dẫn báo cáo](https://www.kiotviet.vn/huong-dan-su-dung-kiotviet/retail-bao-cao/bao-cao) |
| Báo cáo tồn kho và dự báo hàng hóa | Báo cáo hàng hóa gồm xuất nhập tồn chi tiết theo mã hàng, giá trị kho, hạn sử dụng, kèm dự báo hết hàng và dự đoán bán chậm dựa trên số liệu bán và tồn kho thực tế. | Cốt lõi (core) | [Báo cáo hàng hóa](https://www.kiotviet.vn/huong-dan-su-dung-kiotviet/huong-dan-bao-cao/bao-cao-hang-hoa) |
| Hóa đơn điện tử khởi tạo từ máy tính tiền | Xuất hóa đơn điện tử trực tiếp từ POS/máy tính tiền KiotViet, kết nối, truyền và lưu trữ dữ liệu với Cơ quan Thuế, đáp ứng Nghị định 70/2025/NĐ-CP (bắt buộc với hộ kinh doanh doanh thu từ 1 tỷ/năm); miễn phí cho khách hàng KiotViet. | Cốt lõi (core) | [HĐĐT KiotViet](https://hoadondientu.kiotviet.vn/) |
| Đồng bộ sàn TMĐT (Shopee, Lazada, TikTok Shop) | Kết nối Shopee, Lazada, TikTok Shop, Tiki: đồng bộ tồn kho và giá theo thời gian thực, quản lý đơn hàng tập trung (xác nhận, đóng gói, giao hàng) trên một giao diện, đẩy thông báo đơn mới tức thời và báo cáo doanh thu từng sàn để so sánh hiệu quả. | Cốt lõi (core) | [KiotViet Online](https://banhangonline.kiotviet.vn/) |
| Bán online đa kênh (omnichannel) | Bán hàng đồng thời trên nhiều kênh (website bán hàng online, sàn TMĐT, mạng xã hội) trên một hệ thống quản lý tập trung: tồn kho, giá và đơn hàng được đồng bộ giữa các kênh, đơn từ mọi kênh xử lý trên cùng một giao diện. | Cốt lõi (core) | [KiotViet Online](https://banhangonline.kiotviet.vn/) |
| Thanh toán QR kết nối ngân hàng, đối soát tự động | Khách quét mã QR trên màn hình thu ngân, hệ thống xác nhận giao dịch ngay khi tiền về (tránh dán đè mã QR và thất thoát); kết nối không giới hạn số tài khoản ngân hàng/ví, doanh thu QR tự chạy vào Báo cáo cuối ngày và Báo cáo bán hàng nên không cần đối soát thủ công. | Cốt lõi (core) | [KiotViet Finance](https://finance.kiotviet.vn/thanh-toan.html) |
| Vận hành đám mây — bán hàng khi mất mạng | Dữ liệu xử lý hoàn toàn trên nền tảng cloud nên vẫn bán hàng được khi mất kết nối internet và tự đồng bộ lại khi có mạng; chủ cửa hàng truy cập dữ liệu mọi lúc qua điện thoại, máy tính bảng, laptop để cập nhật giá, xác nhận đơn, tạo khuyến mại từ xa. | Cốt lõi (core) | [Công nghệ](https://www.kiotviet.vn/cong-nghe/) |
| Hóa đơn điện tử miễn phí | KiotViet tặng miễn phí bộ công cụ Hóa đơn điện tử và Chữ ký số RMS (ký mọi lúc mọi nơi, không cần thiết bị) cho toàn bộ khách hàng, "kết nối nhận, truyền, lưu trữ dữ liệu trực tiếp với Cơ quan Thuế", đáp ứng quy định hộ kinh doanh từ 1 tỷ/năm phải dùng hóa đơn khởi tạo từ máy tính tiền (Nghị định 70/2025/NĐ-CP). | Hữu ích (useful) | [HĐĐT KiotViet](https://hoadondientu.kiotviet.vn/) |
| Chữ ký số RMS (ký từ xa) | Cung cấp chữ ký số loại Remote Signing miễn phí, đạt chuẩn pháp luật: không cần thiết bị cứng, ký mọi lúc mọi nơi trên mọi thiết bị, bảo mật HSM và xác thực qua OTP hoặc app ký số. | Hữu ích (useful) | [HĐĐT KiotViet](https://hoadondientu.kiotviet.vn/) |
| Báo cáo hiệu quả nhân viên | Báo cáo lợi nhuận theo nhân viên: thống kê tên nhân viên, tổng tiền hàng, giảm giá, doanh thu; trên POS còn lọc theo người tạo đơn để đánh giá đóng góp từng người bán. | Hữu ích (useful) | [Báo cáo nhân viên](https://www.kiotviet.vn/huong-dan-su-dung-kiotviet/huong-dan-bao-cao/bao-cao-nhan-vien) |
| Chấm công, tính lương và hoa hồng tự động | Nhân viên chấm công qua app (ghi nhận giờ vào/ra theo thời gian thực, phân loại đúng giờ/đi muộn/thiếu ca), hệ thống tự tính 100% lương theo ngày công/ca/giờ/cố định và hoa hồng theo từng giao dịch, tự động tổng hợp vào bảng lương cuối tháng. | Hữu ích (useful) | [KiotViet Employee](https://employee.kiotviet.vn/) |
| Bán hàng qua Facebook Fanpage và livestream | Tư vấn và lên đơn ngay trong màn hình chat Fanpage, chốt đơn livestream tự động bằng cách lọc bình luận đúng cú pháp, phân công nhân viên trả lời kèm auto-reply và thống kê like/bình luận/đơn chốt dạng biểu đồ. | Hữu ích (useful) | [KiotViet Online](https://banhangonline.kiotviet.vn/) |
| Kết nối hãng vận chuyển và đối soát giao hàng | Liên kết nhiều đơn vị vận chuyển: so sánh phí ship theo kích thước/cân nặng/quãng đường, tạo vận đơn ngay trên màn hình quản lý bán hàng, theo dõi mọi trạng thái giao hàng tập trung và đối soát phí ship cùng tiền COD qua một đầu mối. | Hữu ích (useful) | [Giải pháp giao hàng](https://www.kiotviet.vn/giai-phap-giao-hang-ngay-tren-kiotviet/) |
| Ứng dụng di động iOS/Android | Bộ app trên Google Play và App Store (KiotViet, KiotViet Online, Nhân viên nhà hàng, K-note...) giúp chủ cửa hàng theo dõi doanh thu, hiệu quả kinh doanh và quản lý đa Fanpage ngay trên smartphone. | Hữu ích (useful) | [KiotViet](https://kiotviet.vn/) |
| Sổ kế toán hộ kinh doanh theo Thông tư 152 | Tự động ghi sổ kế toán đúng Thông tư 152/2025/TT-BTC với bộ sổ S1a–S3a-HKD: tổng doanh thu/chi phí lũy kế, thuế GTGT/TNCN phải nộp, sổ tiền mặt và tiền gửi ngân hàng (tách từ phiếu thu/chi), hỗ trợ khóa sổ theo kỳ và tải file Excel. | Hữu ích (useful) | [Sổ kế toán HKD](https://www.kiotviet.vn/huong-dan-su-dung-kiotviet/retail-ke-toan-hkd-so-ke-toan/so-ke-toan) |

---

## 4. Khoảng cách với Postie

> Trạng thái: **Đã có** · **Một phần** · **Thiếu**. Công sức: **S** nhỏ / **M** trung bình / **L** lớn. Giá trị: **high / medium / low** — xếp hạng giữ nguyên theo phân tích khoảng cách cung cấp; toàn bộ cột "Bằng chứng trong code" đã được xác minh trực tiếp trên repo ngày 2026-09-27.

| Tính năng | Trạng thái | Công sức | Giá trị | Bằng chứng trong code | Gợi ý |
|---|---|---|---|---|---|
| Bán hàng tại quầy (POS) đa chế độ | Một phần | M | high | `Register.tsx:34-411` (1 chế độ duy nhất: tìm kiếm + grid + giỏ + thanh toán), `orders.ts:38-168`; ProductGrid không có ảnh sản phẩm (grep "img" = 0 kết quả); không có thêm hàng mới tại màn bán (chỉ qua `Products.tsx`); chưa có phím tắt F4/F9 (chỉ Enter quét mã ở `ProductSearch.tsx:47-73`) | Thêm hotkey F2 thêm hàng nhanh / F4 chọn khách / F9 thanh toán trong Register.tsx, kèm AddProductDialog dạng mini có thể mở từ màn bán. Chế độ 'Bán nhanh/Bán thường' có thể làm toggle ẩn-hiện grid ảnh sau; tra khách bằng F4 đã có nền ở Register.tsx:77-89 |
| Quét mã vạch khi bán | **Đã có** | S | high | `Register.tsx:92-125` (keydown buffer ≥8 ký tự, reset 50ms → cart.add), `ProductSearch.tsx:47-73` (Enter → products:getByBarcode → vào giỏ), `products.ts:50-52`, `ipc.ts:67-69` | Chỉ cần tinh chỉnh: thay alert() bằng toast sonner (Register.tsx:112) + âm báo lỗi, và cho phép quét khi focus đang ở ô tìm kiếm (buffer hiện bị bỏ qua khi target là input — Register.tsx:95; ProductSearch đã xử lý Enter nên chỉ cần nhất quán hành vi) |
| Thanh toán đa kênh | Một phần | M | high | `schema.sql:241-250` (order_payments hỗ trợ split-tender), `orders.ts:126-133` (insert nhiều dòng); nhưng UI chỉ 1 phương thức/đơn: `Register.tsx:43` payMethod kiểu 'CASH' hoặc 'QR', `PaymentDialog.tsx:104-116` gửi đúng 1 payment line (mảng 1 phần tử ở dòng 113-116); seed CARD có sẵn (schema.sql:381) nhưng không có nút Thẻ; không có điểm tích lũy/voucher | Nâng PaymentDialog.tsx thành danh sách dòng thanh toán (thêm CASH + CARD + QR, mỗi dòng nhập số tiền, tự tính còn lại/tiền thừa) — repo orders.create đã chấp nhận mảng payments nên không cần đổi schema. Điểm tích lũy: tận dụng cột customers.points (schema.sql:98) khi làm loyalty |
| Thanh toán QR thông báo tiền về | Thiếu | L | medium | — (PaymentDialog.tsx:175-180 chỉ hiển thị text hướng dẫn 'khách quét... sau đó nhấn xác nhận' — xác nhận thủ công, không có QR động chứa số tiền, không webhook ngân hàng, không auto-complete) | Bước 1: sinh QR VietQR tĩnh chứa số tiền + nội dung CK = invoice_no (thư viện vietqr miễn phí) hiển thị trong PaymentDialog; cột order_payments.reference (schema.sql:248) đã có để lưu mã giao dịch. Bước 2 (cần dịch vụ ngoài): webhook ngân hàng đối soát và tự đóng đơn — làm sau khi đã có QR tĩnh |
| Kết ca — ca làm việc và két tiền | Một phần | S | high | `schema.sql:166-191` (shifts + CHECK ràng buộc đối ca), `shifts.ts:27-58` (close tính expected = tiền đầu ca + cash sales từ order_payments, difference), `ShiftOpen.tsx:37`, `CloseShiftDialog.tsx:57-108`; thiếu: thu/chi tiền trong ca (không chỉ doanh thu), lịch sử ca (ipc.ts:111-122 chỉ có open/close/getActive/getById, không có shifts:list), in phiếu bàn giao | Thêm IPC shifts:listByUser + dialog lịch sử ca (dùng CloseShiftDialog làm template hiển thị), và bảng shift_cash_events (shift_id, type thu/chi, amount, note) cộng vào expected_cash ở shifts.ts:43. In phiếu bàn giao gộp với tính năng in hóa đơn |
| In hóa đơn sau thanh toán | Thiếu | M | high | — (grep `print/receipt/escpos/thermal` toàn `src` + `electron` chỉ trả về comment/CSS: index.css:68,70 và Register.tsx:382; màn thanh toán thành công chỉ hiện Card số hóa đơn, Register.tsx:383-408; không có IPC hủy/sửa/sao chép đơn — ipc.ts:97-108 chỉ create/getById/listRecent/listByShift dù orders.status=2 voided có sẵn schema.sql:204) | Thêm template hóa đơn 80mm (HTML + window.print() của Electron, hoặc node-thermal-printer cho ESC/POS) gọi sau onPaid trong Register.tsx (handlePaid — Register.tsx:163-172). Đồng thời thêm IPC orders:void (UPDATE status=2 + stock_movements trả tồn + ghi audit_log) vì dữ liệu đã đủ |
| In tem mã vạch cho hàng hóa | Thiếu | M | medium | — (barcode chỉ hiển thị dạng text ở Products.tsx:127; không có code render/in tem nào) | Dùng thư viện JsBarcode render canvas + window.print() với @page size khổ tem (40x20/72x22mm), nút 'In tem' chọn số lượng trên hàng trong routes/Products.tsx. In được tem là tiền đề để quét khi bán — luồng quét đã có sẵn |
| Khuyến mại và giảm giá | Một phần | L | high | Chỉ giảm giá thủ công theo hóa đơn: `Register.tsx:20-24,156-157` (discountDong → discount_amount), `schema.sql:213`; giảm giá theo dòng đã hỗ trợ ở `schema.sql:236` (order_details.discount_amount) và `types.ts:146` nhưng UI không có ô nhập (Cart.tsx chỉ có 1 ô giảm giá toàn đơn — Cart.tsx:123-133); không có bảng promotions/voucher/coupon, không theo nhóm khách, không giá theo số lượng | Bước 1 rẻ: thêm ô giảm giá từng dòng trong components/pos/Cart.tsx (pipeline orders.create — orders.ts:63-83 — đã tính lineDiscount ở dòng 65). Bước 2: bảng promotions (type, scope, time, customer_group) + engine áp dụng trong orders.ts:create, voucher = bảng vouchers + nhập mã ở PaymentDialog |
| Đặt hàng / giữ đơn | Một phần | M | medium | `Register.tsx:26-32` (interface HeldBill), `Register.tsx:128-153` (holdCurrentBill/restoreBill) — hóa đơn treo chỉ nằm trong useState (Register.tsx:49), mất khi restart app, không lưu DB, không gắn khách hàng, không liên kết hóa đơn sau này | Lưu đơn treo xuống bảng orders với status=0 pending đã có sẵn (schema.sql:204,216-217; orders.ts:88 đã map) + cột loại 'held', thêm IPC orders:listPending/update; đơn đặt trước thật sự (khách cọc, giữ khuyến mãi) cần thêm bảng deposits nhưng có thể để sau |
| Trả hàng theo hóa đơn | Một phần | M | medium | `schema.sql:267-286` (returns + return_details theo order_detail_id), stock_movements type=1 return (schema.sql:255), orders.status=3 refunded (schema.sql:204) — nhưng grep 'returns' trong electron/ và src/ không thấy bất kỳ repository/IPC/UI nào dùng (chỉ comment products.ts:110) | Viết electron/db/repositories/returns.ts: 1 transaction INSERT returns + return_details + stock_movements (type=1, delta dương) + UPDATE orders.status=3, hoàn tiền qua customer_ledger nếu bán chịu. UI: màn 'Đổi trả' tìm hóa đơn theo invoice_no (orders:listRecent đã có), chọn dòng cần trả |
| Bán hàng trên điện thoại và máy POS | Thiếu | L | low | — (toàn bộ stack là Electron desktop: package.json electron-only, bố cục 2 panel cố định Register.tsx:206-339; App.tsx chỉ 127 dòng, không có layout mobile) | Không ưu tiên cho POS 1 quầy: chạy chính Electron trên máy POS Windows là đủ. Nếu cần bán di động, cân nhắc web-PWA đọc cùng DB qua server nhỏ — chi phí lớn hơn giá trị ở giai đoạn này |
| Hóa đơn điện tử miễn phí | Thiếu | L | medium | — (không có code liên quan HĐĐT/cơ quan thuế; taxes chỉ là bảng rate schema.sql:78-84 và thậm chí chưa được chọn trong UI sản phẩm — PaymentDialog.tsx:111 hardcode tax_rate: 0) | Chỉ cần khi doanh thu ≥ 1 tỷ/năm (NĐ 70/2025): tích hợp API nhà cung cấp HĐĐT (Viettel/VNPT/MISA) — cần thêm thông tin MST/địa chỉ xuất hóa đơn vào customers và mapping invoice-no ↔ số HĐĐT trên orders. Đặt sau tính năng in hóa đơn giấy |
| Bán online đa kênh (omnichannel) | Thiếu | L | low | — (không có bất kỳ code kết nối ngoài nào; app chạy 100% offline local SQLite — connection.ts:100-104) | Ngoài phạm vi hợp lý cho POS offline nhỏ; nếu khách bán song song Shopee, nhập đơn tay qua màn Đặt hàng (đơn treo có khách) rẻ hơn nhiều so với xây sync |
| Danh mục hàng hóa & phân loại | Một phần | M | high | CRUD sản phẩm đủ: `products.ts:16-103`, barcode UNIQUE (schema.sql:146), ngừng KD hàng loạt có deactivate (products.ts:101-103); NHƯNG categories phân cấp (schema.sql:67-74) không có repository/IPC/UI (grep 'categories' trong electron/ + routes/ = 0), AddProductDialog không có ô chọn nhóm (grep "categor" = 0 kết quả), không có thương hiệu/vị trí kệ, không import Excel/CSV, không sao chép SP | Viết categories repo + IPC CRUD và lọc nhóm hàng trên ProductGrid (products.list đã nhận categoryId — products.ts:27-30 — chỉ thiếu UI). Import CSV từ nhà cung cấp đã ghi ý định trong idea.txt:30-31 — thêm products:importCsv là lợi thế lớn khi khai trương |
| Theo dõi tồn kho theo chi nhánh & thẻ kho | Một phần | M | high | Dữ liệu thẻ kho đầy đủ: stock_movements ghi mọi thay đổi (schema.sql:252-265, products.ts:115-146, trigger schema.sql:347-354), tồn là cột dẫn xuất; NHƯNG không có IPC/UI xem lịch sử (ipc.ts:79-94 chỉ adjustStock, không có products:listMovements); không có chiều chi nhánh (products.stock cột đơn — schema.sql:154) | Thêm IPC products:listMovements(productId) + dialog 'Thẻ kho' từ màn Kho hàng (idx_stock_movements_prod_time — schema.sql:328 — đã tối ưu). Đa chi nhánh: thêm cột branch_id vào stock_movements/products — chỉ làm khi thật sự có 2 điểm bán |
| Kiểm kho (kiểm kê) | Một phần | M | high | products.ts:115-146 chấp nhận mọi StockMovementType (types.ts:11 có 3=adjust, 4=wastage) nhưng StockAdjustDialog.tsx:66-72 hardcode type=2 (chỉ nhập thêm hàng — dòng 69); không có phiếu kiểm (đối chiếu số sách vs thực tế, tính chênh lệch), không quét mã khi kiểm, không gộp nhiều phiếu | Bảng stocktakes + stocktake_details (book_qty, counted_qty) — màn kiểm kho cho quét mã liên tục, 'Hoàn thành' sinh stock_movements type=3 delta=counted−book trong 1 transaction (products.ts:115-146 đã có guard tồn âm, cần cho phép delta âm khi thiếu) |
| Nhập hàng (nhận hàng từ NCC) | Một phần | M | high | StockAdjustDialog.tsx:37-132 — nhập từng sản phẩm rời rạc (qty + note, type=2), không chọn NCC, không cập nhật cost khi nhập (form chỉ có qty + note), không có phiếu nhập nhiều dòng, không quét tăng SL, không ghi thanh toán/công nợ nhập, không chi phí phân bổ, không in tem sau nhập | Bảng purchase_orders + purchase_order_details (qty, cost, supplier_id) + repository trong 1 tx (INSERT movements type=2 + UPDATE products.cost). UI phiếu nhập nhiều dòng có ô quét mã và chọn NCC — suppliers table đã có sẵn (schema.sql:126-134) |
| Quản lý nhà cung cấp & công nợ phải trả | Một phần | M | medium | Chỉ có schema: suppliers (schema.sql:126-134) + products.supplier_id (schema.sql:149); grep không thấy suppliers repository/IPC/UI (ipc.ts:10-15 chỉ đăng ký 6 repo: users/products/orders/shifts/customers/payment_methods); không có công nợ phải trả, không lịch sử nhập/trả theo NCC, không import/export | Sao chép pattern customers.ts: suppliers repo (CRUD) + supplier_ledger mirror customer_ledger (trigger tương tự schema.sql:359-366) + màn 'Nhà cung cấp' đơn giản; ghép nợ nhập vào phiếu nhập ở mục Nhập hàng |
| Thuộc tính phiên bản & đơn vị tính quy đổi | Thiếu | L | medium | products.unit là TEXT duy nhất tự do (schema.sql:153); không có variants/attributes/UOM conversion ở bất kỳ đâu (grep không thấy) | Nếu bán thời trang/giày dép: bảng product_variants (product_id, màu/size, price, barcode riêng, stock riêng) — cần tái cấu trúc useCart + order_details trỏ variant_id. Đơn vị quy đổi (lốc/thùng): bảng product_units(product_id, name, factor) và cho nhập/bán theo đơn vị lớn |
| In tem nhãn mã vạch | Thiếu | M | medium | — (trùng hướng với 'In tem mã vạch cho hàng hóa'; không có code in tem nào — Products.tsx:127 chỉ hiển thị chuỗi barcode) | Cùng một cơ chế với In tem mã vạch: JsBarcode + cửa sổ in khổ tem từ routes/Products.tsx và từ phiếu nhập (sau khi có purchase_orders). Chọn nội dung tem (tên, giá, mã) và số lượng |
| Quản lý đa kho trong một chi nhánh | Thiếu | L | low | — (products.stock là cột đơn — schema.sql:154; stock_movements không có warehouse_id, không khái niệm kho) | Bảng warehouses + warehouse_id trên stock_movements, tồn = SUM theo kho. Chỉ đáng làm khi shop thực sự tách kho bán lẻ/kho online — với 1 kho hiện tại là đủ |
| Chuyển hàng giữa chi nhánh/kho | Thiếu | L | low | — (không có chi nhánh/kho nào trong schema nên không thể chuyển; không có bảng transfer) | Chỉ có nghĩa sau khi có đa kho: bảng transfers (from_warehouse, to_warehouse, status) + 2 stock_movements đối ứng mỗi dòng. Ưu tiên rất thấp cho 1 cửa hàng |
| Đặt hàng nhập & đề xuất hàng nhập | Thiếu | M | medium | — (không có phiếu đặt NCC; low_stock_alert — schema.sql:155 — đã có và Products.tsx:121-137 hiển thị badge 'còn {stock}'/'Hết hàng' nhưng không có màn đề xuất tự điền số lượng) | Màn 'Đề xuất nhập' gộp: sản phẩm có stock ≤ low_stock_alert hoặc đã bán trong 30 ngày (SUM từ stock_movements type=0) — prefill số lượng = định mức − tồn. Phiếu đặt hàng nhập có thể dùng luôn purchase_orders với status 'chờ giao' |
| Hàng Combo – đóng gói | Thiếu | M | medium | — (products không có loại hàng; orders.ts:136-145 chỉ trừ tồn theo đúng dòng bán, không có cơ chế trừ tồn thành phần) | product.type + bảng combo_details(combo_product_id, component_product_id, qty); trong orders.ts:create, khi gặp combo thì INSERT stock_movements cho từng thành phần (delta âm) thay vì dòng combo. Giá vốn combo = SUM cost thành phần (products.cost đã có) |
| Hàng hóa Lô – Hạn sử dụng (FEFO) | Thiếu | L | medium | — (stock_movements không có batch_id/expiry_date; products không theo dõi hạn) | Bảng batches(product_id, lot_no, expiry_date, qty, cost) + stock_movements.batch_id; gợi ý xuất FEFO khi thêm vào giỏ (sắp các lô còn hạn sớm nhất trước), cảnh báo đỏ trên Cart khi hạn < X ngày. Chỉ ưu tiên nếu khách bán tạp hóa/nhà thuốc |
| Tự động gợi ý thông tin hàng hóa theo mã vạch | Thiếu | L | low | — (AddProductDialog không tra dữ liệu mẫu theo mã vạch; idea.txt ghi ý định OCR hóa đơn nhập + model local + import CSV (idea.txt:30-31) nhưng chưa hiện thực gì) | Gợi ý phụ thuộc DB ngoài (GS1) khó tự chủ; thực tế hơn cho Postie: import CSV/Excel danh mục của NCC (idea.txt đã ghi) trước — đó là cách rẻ nhất để giảm nhập liệu hàng loạt |
| Hàng hóa Serial/IMEI | Thiếu | L | low | — (không có bảng serial/IMEI; order_details không ghi serial xuất bán) | Chỉ cần cho điện máy: bảng product_serials(product_id, serial, status) gắn vào phiếu nhập và order_details. Để sau — hầu hết shop bán lẻ nhỏ không quản lý IMEI |
| Hàng sản xuất từ nguyên vật liệu | Thiếu | L | low | — (không có BOM/recipe; chỉ có combo concept thiếu như trên) | Nếu có nhu cầu (quầy bánh): bảng recipe(product_id, material_id, qty) trừ tồn NVL khi bán thành phẩm, giá vốn = SUM cost. Nhóm chung với combo_details — có thể dùng chung một bảng cấu trúc 'đóng gói' |
| Phân tích kinh doanh thông minh | Một phần | M | high | Reports.tsx:63-66 chỉ 4 thẻ (số đơn, doanh thu, đã thu, còn nợ) cộng client-side từ 50 đơn gần nhất hoặc ca hiện tại (Reports.tsx:43-54); không có lợi nhuận (order_details — schema.sql:228-239 — không snapshot cost, chỉ products.cost hiện tại nên không tính được giá vốn đúng thời điểm bán), không biểu đồ, không lọc thời gian | Thêm cột cost_cents snapshot vào order_details (migration trong connection.ts:60-90), rồi ordersRepo.report(from,to) GROUP BY ngày/sản phẩm — hiện doanh thu, giá vốn, lợi nhuận gộp + 1 biểu đồ cột (recharts). Dữ liệu đầu vào đã sạch (cents INTEGER, snapshot giá) |
| Bộ báo cáo đa chiều theo kênh và chi nhánh | Một phần | M | medium | Reports.tsx:39-61 chỉ 2 filter 'Ca hiện tại'/'50 đơn gần nhất'; không lọc khoảng thời gian tùy chọn, không lọc nhân viên/phương thức thanh toán (dữ liệu order_payments + orders.user_id đều có sẵn); không có chi nhánh/kênh (không tồn tại trong schema) | Thay filter bằng chọn khoảng ngày + tab 'theo phương thức' (JOIN order_payments GROUP BY payment_method_id) và 'theo nhân viên' (GROUP BY user_id) — thuần SQL trên orders, không đổi schema. Chi nhánh bỏ qua cho tới khi có đa chi nhánh |
| Báo cáo tồn kho và dự báo hàng hóa | Một phần | M | medium | Products.tsx:121-137 badge 'Hết hàng'/'còn {stock}' dựa low_stock_alert — nhưng chỉ trên trang hiện tại đang render (list pageSize 200, Products.tsx:47-55); không có báo cáo XNT chi tiết, giá trị kho, không dự báo hết hàng/bán chậm | IPC products:stockReport: giá trị kho = SUM(stock*cost), danh sách dưới định mức từ cột low_stock_alert (so sánh ở SQL chứ không phải UI), tốc độ bán 30 ngày từ stock_movements — hiển thị 1 tab 'Tồn kho' trong Reports. Bỏ qua dự báo AI, cảnh báo ngưỡng là đủ cho shop nhỏ |
| Báo cáo hiệu quả nhân viên | Thiếu | S | medium | Dữ liệu sẵn nhưng chưa có: orders.user_id NOT NULL (schema.sql:208) + idx_orders_user (schema.sql:312), users:list IPC có (ipc.ts:57) — Reports.tsx không có cột/bộ lọc nhân viên nào | Thêm GROUP BY user_id vào report query và 1 bảng 'Theo nhân viên' (số đơn, doanh thu, giảm giá — orders.discount_amount có sẵn) trong Reports.tsx. Rẻ nhất trong các báo cáo còn thiếu |
| Chấm công, tính lương và hoa hồng tự động | Thiếu | L | low | — (shifts chỉ là ca két tiền của thu ngân, không ghi giờ công/đi muộn; không có bảng lương/hoa hồng) | Với 1-3 nhân viên, bảng công đơn giản đủ dùng: shifts.opened_at/closed_at đã là giờ vào/ra — có thể xuất tổng giờ công theo tháng + hoa hồng nếu có % theo đơn (report theo nhân viên ở trên). Chỉ xây khi có nhu cầu lương thật |
| Hóa đơn điện tử khởi tạo từ máy tính tiền | Thiếu | L | medium | — (trùng hướng 'Hóa đơn điện tử miễn phí'; không có code kết nối cơ quan thuế, không có cấu hình MST cửa hàng) | Giai đoạn 1: cấu hình thông tin hộ KD (tên, MST, địa chỉ) in lên hóa đơn giấy. Giai đoạn 2: gọi API nhà cung cấp HĐĐT ngay sau orders:create thành công, lưu số HĐĐT vào orders (cột mới e_invoice_no). Chỉ ưu tiên khi khách đạt ngưỡng 1 tỷ/năm |
| Chữ ký số RMS (ký từ xa) | Thiếu | M | low | — (không có bất kỳ code ký số/HSM nào) | Không tự xây: RMS là dịch vụ của nhà cung cấp HĐĐT (đi kèm gói HĐĐT ở mục trên) — Postie chỉ cần pass token qua API. Không có hạng mục riêng trong roadmap |
| Đồng bộ sàn TMĐT (Shopee, Lazada, TikTok Shop) | Thiếu | L | medium | — (không có code gọi API ngoài nào; kiến trúc offline-first local SQLite — connection.ts:100-104) | Cần một thành phần online (server nhỏ hoặc chạy trên máy có mạng) gọi Open API các sàn và ghi đơn vào orders với nguồn kênh riêng. Đắt tiền về vận hành — chỉ làm nếu khách hàng mục tiêu bán đa kênh thực sự |
| Bán hàng qua Facebook Fanpage và livestream | Thiếu | L | low | — (không có code tích hợp Facebook/Messenger) | Ngoài tầm với của POS desktop offline hiện tại; nếu cần, đây là module web riêng dùng Graph API — không trộn vào electron/main |
| Thanh toán QR kết nối ngân hàng, đối soát tự động | Thiếu | L | medium | — (cùng họ với 'Thanh toán QR thông báo tiền về': PaymentDialog.tsx:175-180 chỉ hướng dẫn khách quét rồi xác nhận tay, không kết nối ngân hàng, doanh thu QR không tách riêng trong Reports — chỉ có tổng 'Đã thu' Reports.tsx:65) | Bắt đầu từ QR tĩnh chứa invoice_no (đã đề xuất ở mục QR thông báo tiền về): nhờ đó đối soát được bằng cách so sánh nội dung CK — sau đó thêm báo cáo doanh thu theo phương thức từ order_payments (dữ liệu đã ghi đủ, chỉ thiếu truy vấn) |
| Kết nối hãng vận chuyển và đối soát giao hàng | Thiếu | L | low | — (không có khái niệm vận đơn/trạng thái giao hàng trong schema; đơn hàng chỉ paid/voided/refunded — schema.sql:204) | Chỉ cần khi bán online: bảng shipments(order_id, carrier, tracking_no, status, fee). POS quầy thuần (khách mua tại chỗ) không dùng — xếp sau omnichannel |
| Vận hành đám mây — bán hàng khi mất mạng | Một phần | L | medium | Postie offline-native hơn cả KiotViet: DB SQLite local tại `<userData>/postie.db` (connection.ts:100-104), WAL + PRAGMA tối ưu (schema.sql:34-41) — bán hàng không phụ thuộc internet; NHƯNG không có cloud sync/truy cập số liệu từ xa/đa thiết bị (mọi thứ nằm trong 1 file db) | Với 1 quầy, thay 'cloud' bằng backup tự động: sao chép postie.db (WAL-safe qua VACUUM INTO) lên Google Drive/USB mỗi ngày đóng ca (hook vào shiftsRepo.close). Đồng bộ đa thiết bị chỉ làm khi có ≥2 máy bán |
| Ứng dụng di động iOS/Android | Thiếu | L | low | — (Electron desktop-only; không có server/API để app mobile kết nối) | Không ưu tiên; chủ shop xem báo cáo ngay trên máy quầy là đủ ở quy mô nhỏ. Nếu cần, React Native đọc qua REST server sẽ là dự án riêng |
| Chuyển kho liên chi nhánh | Thiếu | L | low | — (không có chi nhánh trong schema; chỉ 1 DB local 1 cửa hàng) | Tiền điều kiện là đa chi nhánh + sync dữ liệu giữa các máy — chi phí lớn hơn nhiều so với giá trị với shop 1 điểm. Bỏ khỏi roadmap ngắn hạn |
| Sổ kế toán hộ kinh doanh theo Thông tư 152 | Thiếu | L | medium | — (có nền: customer_ledger — schema.sql:113-122, audit_log — schema.sql:290-299, shifts tiền mặt — nhưng không có phiếu thu/chi tổng quát, không sổ S1a-S3a, không xuất Excel) | Bảng cash_transactions(type thu/chi, amount, category, note) ghi trong ca (gắn shift_id) + xuất CSV/Excel tổng doanh thu - chi phí theo kỳ cho kế toán; sổ S1a đầy đủ có thể để kế toán làm trên phần mềm thuế — Postie chỉ cần cung cấp dữ liệu đúng |

---

## 5. Lộ trình ưu tiên P0 / P1 / P2

> Nguyên tắc xếp hạng: (1) giá trị high trước; (2) ưu tiên mục mà **dữ liệu/schema đã có sẵn, chỉ thiếu UI/IPC** — chi phí thật thấp hơn con số công sức; (3) gì phải đi trước (cost snapshot trước báo cáo lợi nhuận; phiếu nhập trước tem mã; QR tĩnh trước webhook).

### P0 — Hoàn tất quầy bán (giá trị cao, công sức S/M, chạm tới hằng ngày)

**Lý do chọn:** đây là các mục value=high + effort S/M mà thu ngân/chủ shop gặp mỗi ngày. Postie hiện "bán được" nhưng "không khép được vòng" — không in hóa đơn, không nhận thẻ, không trừ được lỗi tại quầy. Cả cụm này không đụng vào kiến trúc, phần lớn chỉ thêm UI/IPC trên dữ liệu có sẵn.

**Thứ tự làm:**
1. **Thanh toán đa phương thức (split-tender)** — M/high. Vào trước vì schema (`order_payments`, `schema.sql:241-250`) và repo (`orders.create` nhận mảng payments — `orders.ts:87,126-133`) đã hỗ trợ 100%; chỉ nâng `PaymentDialog.tsx` thành danh sách dòng (CASH + CARD + QR, mỗi dòng nhập số tiền, tự tính còn lại/tiền thừa). Seed CARD có sẵn (`schema.sql:381`).
2. **Hotkey F2/F4/F9 + nhất quán quét mã** — quét mã: S/high; POS đa chế độ: M/high. Quét mã đã "have" — chỉ cần toast sonner + âm báo lỗi thay `alert()` (Register.tsx:112) và cho quét khi focus ô tìm kiếm (Register.tsx:95). Hotkey F9 thanh toán là bước đệm cho PaymentDialog ở mục 1; chế độ "Bán nhanh/Bán thường" để sau dưới dạng toggle ẩn/hiện grid ảnh.
3. **In hóa đơn 80mm + IPC orders:void** — M/high. Cần ngay sau mục 1 để khép vòng giao dịch (in sau `handlePaid` — Register.tsx:163-172). Xác minh: không có bất kỳ code in nào trong repo (grep 0 kết quả). Void dùng `orders.status=2` có sẵn (`schema.sql:204`) + trả tồn qua `stock_movements` + `audit_log`.
4. **Kết ca đủ: lịch sử ca + thu/chi trong ca** — S/high. Bảng `shifts` với CHECK ràng buộc đối ca đã chặt (`schema.sql:166-191`); thiếu mỗi `shifts:listByUser` + bảng `shift_cash_events` cộng vào `expected_cash` (`shifts.ts:43`).
5. **Giảm giá theo từng dòng** — bước 1 của khuyến mại (L/high nhưng bước 1 rẻ): ô nhập trong Cart; pipeline `orders.create` đã tính `lineDiscount` (`orders.ts:65`) và `order_details.discount_amount` có sẵn (`schema.sql:236`).
6. **Báo cáo theo nhân viên** — S/medium, rẻ nhất trong các báo cáo còn thiếu (`orders.user_id` + `idx_orders_user` có sẵn — `schema.sql:208,312`).
7. **Nhóm hàng (categories)** — M/high: bảng `categories` phân cấp đã có (`schema.sql:67-74`), `products.list` đã nhận `categoryId` (`products.ts:27-30`) — chỉ viết repo + IPC + ô chọn nhóm trong AddProductDialog + lọc trên ProductGrid.

### P1 — Kho đúng & con số thật (mở khóa lợi nhuận, quy trình nhập–kiểm–trả)

**Lý do chọn:** sau khi quầy khép vòng, vấn đề lớn nhất là *số liệu*: chưa tính được lợi nhuận đúng thời điểm bán (thiếu snapshot giá vốn), chưa có quy trình nhập/kiểm/trả, và đối soát QR còn thủ công. Các mục này biến Postie từ "máy bán tiền" thành hệ thống quản lý.

**Thứ tự làm:**
1. **Snapshot `cost_cents` vào `order_details` + `ordersRepo.report(from,to)` + biểu đồ** — M/high. Phải đi trước mọi báo cáo lợi nhuận (hiện chỉ có `products.cost` hiện tại nên giá vốn sai theo thời gian). Migration theo cơ chế `PRAGMA user_version` có sẵn (`connection.ts:60-90`).
2. **Phiếu nhập hàng `purchase_orders` + suppliers repo/UI** — M/high. Đi trước kiểm kho/tem vì: cập nhật `products.cost` khi nhập, sinh `stock_movements` type=2 trong 1 transaction, ghi công nợ NCC qua `supplier_ledger` (trigger mirror `trg_ledger_after_insert`, `schema.sql:359-366`).
3. **Kiểm kho `stocktakes`** — M/high: quét mã liên tục, "Hoàn thành" sinh `stock_movements` type=3 với delta = counted − book trong 1 transaction; cần cho phép delta âm qua guard tồn âm trong `products.ts:115-146`.
4. **Trả hàng (repo `returns.ts` + màn Đổi trả)** — M/medium: bảng `returns`/`return_details` đã có sẵn (`schema.sql:267-286`) nhưng chưa ai dùng (đã xác minh bằng grep) — 1 transaction INSERT + movements type=1 + `orders.status=3` + hoàn tiền qua `customer_ledger`.
5. **Đơn treo xuống DB** — M/medium: hiện chỉ nằm trong `useState` (Register.tsx:49,128-153), mất khi restart. Dùng `orders.status=0` + cột phân loại `held_at` (lưu ý: `status=0` hiện được map cho đơn chưa trả đủ — `orders.ts:88` — nên cần cột riêng để không đụng nghĩa bán chịu).
6. **QR VietQR tĩnh trong PaymentDialog** — bước 1 của QR (L/medium): QR chứa số tiền + nội dung CK = `invoice_no`, lưu `order_payments.reference` (`schema.sql:248`). Webhook ngân hàng (bước 2) để P2 vì cần dịch vụ ngoài.
7. **In tem mã vạch (JsBarcode, khổ 40x20/72x22mm)** — M/medium: làm sau phiếu nhập để in tem ngay sau nhập; luồng quét khi bán đã có sẵn nên tem in ra dùng được ngay.
8. **Import CSV danh mục NCC (`products:importCsv`)** — ý định đã ghi trong `idea.txt:30-31`; cách rẻ nhất để giảm nhập liệu hàng loạt khi khai trương (thay cho "gợi ý mã vạch GS1" của KiotViet).
9. **Nâng cấp Reports: lọc khoảng ngày + tab "theo phương thức" + tab "Tồn kho"** — M/medium: thuần SQL trên `order_payments` (`idx_order_payments_method`, `schema.sql:323`) và `stock_movements` (`idx_stock_movements_prod_time`, `schema.sql:328`); giá trị kho = SUM(stock×cost), cảnh báo ngưỡng từ `low_stock_alert` (so sánh trong SQL, bỏ dự báo AI).
10. **Backup tự động `postie.db` khi đóng ca** — phần "thay thế cloud" rẻ của mục Vận hành đám mây (L/medium): `VACUUM INTO` ra file ngày, chép Google Drive/USB, hook vào `shiftsRepo.close` (`shifts.ts:27-58`). Đa thiết bị/cloud sync chỉ làm khi ≥2 máy bán.

### P2 — Tăng trưởng & tuân thủ (theo nhu cầu khách thực tế, có điều kiện kích hoạt)

**Lý do chọn:** các mục này effort L hoặc chỉ phát huy giá trị khi shop có đặc thù cụ thể (bán thời trang, tạp hóa, doanh thu ≥ 1 tỷ/năm, bán đa kênh). Không nên xây trước khi có khách thật cần.

**Thứ tự làm:**
1. **Engine khuyến mại `promotions` + `vouchers`** — L/high: làm sau khi giảm giá thủ công theo dòng (P0) đủ dùng; engine áp dụng trong `orders.ts:create`, voucher nhập mã ở PaymentDialog.
2. **Combo – đóng gói** — M/medium: `product.type` + `combo_details`; trừ tồn từng thành phần trong `orders.create`; giá vốn = SUM cost thành phần.
3. **Đề xuất nhập + đặt hàng NCC** — M/medium: dùng luôn `purchase_orders` với status "chờ giao"; prefill từ `low_stock_alert` + tốc độ bán 30 ngày.
4. **Variants + đơn vị tính quy đổi** — L/medium: chỉ kích hoạt khi bán thời trang/giày dép (cần tái cấu trúc `useCart` + `order_details` trỏ `variant_id`).
5. **QR webhook ngân hàng, đối soát tự động** — L/medium: sau QR tĩnh (P1); cần dịch vụ ngoài.
6. **Hóa đơn điện tử** — L/medium: giai đoạn 1 cấu hình thông tin hộ KD (tên, MST, địa chỉ) in lên hóa đơn giấy (chỉ cần khi đã có in hóa đơn — P0); giai đoạn 2 gọi API nhà cung cấp HĐĐT khi đạt ngưỡng 1 tỷ/năm (NĐ 70/2025), lưu `orders.e_invoice_no`. **RMS không có hạng mục riêng** — là dịch vụ đi kèm nhà cung cấp HĐĐT.
7. **Sổ kế toán TT152-lite** — L/medium: `cash_transactions` (thu/chi gắn `shift_id`) + xuất CSV/Excel doanh thu − chi phí theo kỳ; sổ S1a đầy đủ để kế toán làm trên phần mềm thuế.
8. **Hàng Lô – HSD (FEFO)** — L/medium: chỉ khi khách bán tạp hóa/nhà thuốc.
9. **Chấm công-lite** — L/low: `shifts.opened_at/closed_at` đã là giờ vào/ra; chỉ xây khi có nhu cầu lương thật.

### Không đưa vào lộ trình ngắn hạn (theo dõi nhu cầu)

13 mục giá trị low trong dữ liệu đều rơi vào nhóm này: **bán trên điện thoại/máy POS di động, omnichannel đa kênh, đa kho trong chi nhánh, chuyển hàng giữa kho, gợi ý hàng theo mã vạch GS1, Serial/IMEI, hàng sản xuất/BOM, chấm công–lương, Facebook Fanpage/livestream, kết nối vận chuyển, app iOS/Android, chuyển kho liên chi nhánh, chữ ký số RMS**. Lý do chung: công sức L + giá trị low cho POS 1 quầy offline; chi phí vận hành lớn hơn giá trị. Tự xem xét lại khi: có ≥2 điểm bán (đa kho/chi nhánh), khách bán đa kênh thật (omnichannel), hoặc ngành hàng đặc thù (Serial/IMEI, FEFO).

---

## 6. Gợi ý hiện thực cụ thể

### 6.1 Nguyên tắc kiến trúc giữ nguyên (đã xác minh trong code)

| Nguyên tắc | Bằng chứng hiện tại | Áp dụng cho hạng mục mới |
|---|---|---|
| **INTEGER cents** cho mọi tiền | `schema.sql:6-7` ("Money stored as INTEGER cents... avoids floating-point rounding errors"); mọi cột tiền đều `CHECK (>= 0)` | Bảng/cột mới (`shift_cash_events.amount`, `purchase_orders.total`, `stocktake_details`...) đều dùng INTEGER cents + CHECK |
| **Snapshot giá tại thời điểm giao dịch** | `schema.sql:13-15, 224-237` — `order_details.unit_price/tax_rate/tax_amount` là SNAPSHOT để "past invoices/revenue are never affected by future price/tax changes" | Thêm `cost_cents` snapshot vào `order_details` cùng nguyên tắc — chốt giá vốn đúng thời điểm bán |
| **Cột dẫn xuất + trigger đồng bộ** | `products.stock` ← `stock_movements` (`schema.sql:344-354`), `customers.balance` ← `customer_ledger` (`schema.sql:356-366`); quy tắc "never UPDATE products.stock directly — INSERT a stock_movements row instead" (`schema.sql:17-19`) | Bất kỳ tính năng nào đổi tồn kho (kiểm kho, nhập, trả, void, combo) đều INSERT `stock_movements`, không UPDATE `stock`. Ledger mới (`supplier_ledger`) phải có trigger mirror |
| **Soft-delete, không xóa cứng** | `products/customers/suppliers/users` dùng `is_active`; `schema.sql:226-227`: "products are soft-deleted via is_active, never hard-deleted, to preserve history"; đơn dùng `status` (0–4), không DELETE | Phiếu kiểm/hủy phiếu dùng `status`, không DELETE; hủy đơn = `status=2` + `audit_log` |
| **Luồng tiền/hàng gói trong 1 transaction** | `ordersRepo.create` — `orders.ts:44-167`: header + details + payments + movements + ledger trong 1 tx | `returns.ts`, `purchases.ts`, `stocktakes.ts` làm đúng pattern này |
| **Migration có kiểm soát bằng `PRAGMA user_version`** | `connection.ts:60-90` — `MIGRATIONS[]` chạy tuần tự trong transaction; `schema.sql` là nguồn chân lý cho cài mới (`connection.ts:55-59`) | Mỗi thay đổi schema ghi cả 2 nơi: `schema.sql` (cài mới) + migration v2, v3... (DB cũ) |

### 6.2 P0 — schema / repository / UI

**Schema mới (1 bảng + 1 migration nhẹ):**

```sql
-- Thu/chi tiền mặt trong ca (kết ca đầy đủ)
CREATE TABLE IF NOT EXISTS shift_cash_events (
    id         INTEGER PRIMARY KEY,
    shift_id   INTEGER NOT NULL REFERENCES shifts (id) ON DELETE RESTRICT,
    type       INTEGER NOT NULL CHECK (type IN (0, 1)),      -- 0 = thu, 1 = chi
    amount     INTEGER NOT NULL CHECK (amount > 0),          -- cents
    note       TEXT,
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    created_by INTEGER REFERENCES users (id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_shift_cash_events_shift ON shift_cash_events (shift_id);

-- Migration v2: hủy đơn trả tồn không cần đổi schema; chỉ cần IPC orders:void
```

**Repository / IPC:**

| Hạng mục | Chi tiết |
|---|---|
| `shift_cash_events` | Repository nhỏ: `add(shiftId, type, amount, note, userId)`, `listByShift(shiftId)`; `shiftsRepo.close` (`shifts.ts:27-58`) đổi công thức: `expected = opening_cash + cash_sales + SUM(thu) − SUM(chi)` (điểm cộng vào `shifts.ts:43`) |
| `shifts:listByUser` | IPC mới (`ipc.ts:111-122` hiện chỉ có open/close/getActive/getById); index `idx_shifts_user` có sẵn (`schema.sql:337`) |
| `orders:void` | 1 transaction: `UPDATE orders SET status=2` + `INSERT stock_movements` (delta dương trả tồn, gắn `order_id`) + `INSERT audit_log` action='VOID_ORDER' (bảng `audit_log` sẵn — `schema.sql:290-299`) |
| Categories repo | CRUD + tree từ bảng có sẵn (`schema.sql:67-74`); `products.list` đã nhận `categoryId` (`products.ts:27-30`) nên chỉ cần IPC `categories:*` |

**UI:**

| Màn | Nguồn dữ liệu |
|---|---|
| `PaymentDialog` đa dòng: mỗi dòng = phương thức + số tiền; còn lại = total − Σ dòng; tiền thừa tự tính cho CASH; nút thêm CARD (seed sẵn `schema.sql:381`) | `orders.create` đã nhận mảng payments — không đổi schema/repo |
| Hotkey trong `Register.tsx`: F2 thêm hàng nhanh (mini AddProductDialog), F4 chọn khách (đã có tra khách tại Register.tsx:77-89), F9 thanh toán; toast sonner + âm báo thay `alert()` khi quét lỗi | Buffer quét mã đã có tại Register.tsx:92-125 |
| In hóa đơn 80mm: template HTML + `window.print()` (Electron), gọi sau `handlePaid` (Register.tsx:163-172); dữ liệu từ `orders:getById` (có sẵn). Tùy chọn `node-thermal-printer` cho ESC/POS | Không có code in nào hiện tại (đã xác minh bằng grep) |
| `ShiftHistoryDialog` + ghi thu/chi trong ca — dùng `CloseShiftDialog` làm template | `shifts:listByUser` + `shift_cash_events` |
| Ô giảm giá từng dòng trong `Cart.tsx` | `order_details.discount_amount` (`schema.sql:236`) + `lineDiscount` (`orders.ts:65`) |
| Bảng "Theo nhân viên" trong `Reports.tsx` | `SELECT user_id, COUNT(*), SUM(total), SUM(discount_amount) FROM orders WHERE status IN (1,4) AND created_at BETWEEN ? AND ? GROUP BY user_id` — `idx_orders_user` có sẵn |
| Ô chọn nhóm hàng trong `AddProductDialog` + lọc nhóm trên `ProductGrid` | Bảng + index có sẵn (`idx_products_category`, `schema.sql:308`) |

### 6.3 P1 — schema / repository / UI

**Schema mới:**

```sql
-- 1) Migration v2: snapshot giá vốn theo dòng bán (nguyên tắc snapshot hiện có)
ALTER TABLE order_details ADD COLUMN cost_cents INTEGER NOT NULL DEFAULT 0;
-- orders.create: khi INSERT order_details, lấy products.cost tại thời điểm bán.

-- 2) Phiếu nhập hàng
CREATE TABLE IF NOT EXISTS purchase_orders (
    id             INTEGER PRIMARY KEY,
    supplier_id    INTEGER NOT NULL REFERENCES suppliers (id) ON DELETE RESTRICT,
    status         INTEGER NOT NULL DEFAULT 0 CHECK (status IN (0, 1)), -- 0 = chờ giao, 1 = đã nhập
    total          INTEGER NOT NULL DEFAULT 0 CHECK (total >= 0),       -- cents
    paid           INTEGER NOT NULL DEFAULT 0 CHECK (paid >= 0),        -- cents đã trả NCC
    note           TEXT,
    created_at     INTEGER NOT NULL DEFAULT (unixepoch()),
    created_by     INTEGER REFERENCES users (id) ON DELETE RESTRICT
);
CREATE TABLE IF NOT EXISTS purchase_order_details (
    id         INTEGER PRIMARY KEY,
    po_id      INTEGER NOT NULL REFERENCES purchase_orders (id) ON DELETE CASCADE,
    product_id INTEGER NOT NULL REFERENCES products (id) ON DELETE RESTRICT,
    qty        INTEGER NOT NULL CHECK (qty > 0),
    cost       INTEGER NOT NULL CHECK (cost >= 0)                            -- cents, cập nhật products.cost khi nhập
);

-- 3) Công nợ phải trả NCC — mirror customer_ledger (schema.sql:113-122)
CREATE TABLE IF NOT EXISTS supplier_ledger (
    id          INTEGER PRIMARY KEY,
    supplier_id INTEGER NOT NULL REFERENCES suppliers (id) ON DELETE RESTRICT,
    type        INTEGER NOT NULL CHECK (type IN (0, 1, 2)),   -- 0 = nợ nhập, 1 = trả NCC, 2 = điều chỉnh
    amount      INTEGER NOT NULL,                             -- signed cents
    po_id       INTEGER REFERENCES purchase_orders (id) ON DELETE SET NULL,
    note        TEXT,
    created_at  INTEGER NOT NULL DEFAULT (unixepoch()),
    created_by  INTEGER REFERENCES users (id) ON DELETE RESTRICT
);
-- Trigger trg_supplier_ledger_after_insert: mirror trg_ledger_after_insert (schema.sql:359-366)

-- 4) Kiểm kho
CREATE TABLE IF NOT EXISTS stocktakes (
    id         INTEGER PRIMARY KEY,
    status     INTEGER NOT NULL DEFAULT 0 CHECK (status IN (0, 1)),  -- 0 = đang kiểm, 1 = hoàn thành
    note       TEXT,
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    created_by INTEGER REFERENCES users (id) ON DELETE RESTRICT
);
CREATE TABLE IF NOT EXISTS stocktake_details (
    id           INTEGER PRIMARY KEY,
    stocktake_id INTEGER NOT NULL REFERENCES stocktakes (id) ON DELETE CASCADE,
    product_id   INTEGER NOT NULL REFERENCES products (id) ON DELETE RESTRICT,
    book_qty     INTEGER NOT NULL,   -- tồn số sách tại thời điểm mở phiếu
    counted_qty  INTEGER NOT NULL    -- số đếm thực tế (quét mã liên tục)
);
-- "Hoàn thành": 1 transaction sinh stock_movements type=3, delta = counted_qty - book_qty
-- (cần cho phép delta âm qua guard tồn âm trong products.ts:115-146)

-- 5) Đơn treo: không tạo bảng mới — dùng orders + cột phân loại
ALTER TABLE orders ADD COLUMN held_at INTEGER;  -- NOT NULL = đơn treo
-- Lưu ý: orders.ts:88 map status=0 cho đơn chưa trả đủ (bán chịu) nên phải dùng
-- held_at để phân biệt, tránh đụng nghĩa. IPC mới: orders:listPending / orders:update
```

**Repository / IPC:** `purchases.ts` (create/receive — receive là 1 tx: UPDATE `products.cost` + INSERT `stock_movements` type=2 + `supplier_ledger` nếu chưa trả đủ), `suppliers.ts` (sao chép pattern `customers.ts` — CRUD + ledger), `stocktakes.ts` (open/addLine/complete), `returns.ts` (createReturn: 1 tx INSERT `returns` + `return_details` theo `order_detail_id` + `stock_movements` type=1 delta dương + `orders.status=3` + hoàn tiền qua `customer_ledger`), `products:listMovements(productId)` (thẻ kho — index `idx_stock_movements_prod_time` sẵn, `schema.sql:328`), `products:stockReport` (giá trị kho = SUM(stock×cost), dưới định mức, tốc độ bán 30 ngày), `products:importCsv`, `orders:report(from,to)` + GROUP BY ngày/sản phẩm/phương thức/nhân viên.

**UI:** màn **Nhập hàng** (nhiều dòng, ô quét mã, chọn NCC, sau lưu cho in tem), **Kiểm kho** (quét liên tục, chênh lệch tự tính, nút Hoàn thành), **Đổi trả** (tìm hóa đơn theo `invoice_no` qua `orders:listRecent`, chọn dòng cần trả), **Nhà cung cấp** (CRUD đơn giản + công nợ), **Thẻ kho** (dialog từ Kho hàng), QR VietQR tĩnh trong `PaymentDialog` (nội dung CK = `invoice_no`, lưu `order_payments.reference`), **In tem** (JsBarcode canvas + `@page` khổ 40x20/72x22mm, chọn nội dung + số lượng, từ Products và phiếu nhập), tab **Tồn kho** + filter khoảng ngày + tab "theo phương thức" trong Reports, **backup tự động** hook vào `shiftsRepo.close` — `VACUUM INTO` file ngày → Google Drive/USB.

### 6.4 P2 — schema khi kích hoạt (mô tả ngắn, chỉ làm khi có nhu cầu thật)

| Bảng | Dành cho | Ghi chú thiết kế |
|---|---|---|
| `promotions(id, name, type, scope_json, start_at, end_at, active)` + `vouchers(code, value_cents, expires_at, used_order_id)` | Khuyến mại engine | Engine áp dụng trong `orders.ts:create` trước khi tính tổng; `scope_json` chứa phạm vi nhóm khách/sản phẩm |
| `combo_details(combo_product_id, component_product_id, qty)` | Combo – đóng gói (và tái dùng cho hàng sản xuất/recipe) | `orders.create`: khi gặp combo, INSERT `stock_movements` cho từng thành phần (delta âm); giá vốn combo = SUM cost thành phần |
| `product_variants(product_id, attributes_json, price_cents, barcode UNIQUE, stock)` + `product_units(product_id, name, factor)` | Variants & đơn vị quy đổi | `order_details` thêm `variant_id` nullable; tái cấu trúc `useCart` — effort lớn, chỉ khi bán thời trang |
| `batches(product_id, lot_no, expiry_date, qty, cost_cents)` + cột `stock_movements.batch_id` | Lô – HSD (FEFO) | Gợi ý xuất lô hết hạn trước; cảnh báo đỏ trên Cart khi hạn < X ngày |
| `cash_transactions(shift_id, type, amount_cents, category, note)` | Sổ kế toán TT152-lite | Thu/chi tổng quát gắn ca; xuất CSV/Excel doanh thu − chi phí theo kỳ |
| Cột `orders.e_invoice_no` + trường MST/địa chỉ cho `customers` | Hóa đơn điện tử | Giai đoạn 1: in thông tin hộ KD lên hóa đơn giấy; giai đoạn 2: API nhà cung cấp HĐĐT khi ≥ 1 tỷ/năm (NĐ 70/2025) |

---

## Phụ lục: đối chiếu số liệu

- Tổng: **43 tính năng** KiotViet được đối chiếu → **1** đã có, **15** một phần, **27** thiếu.
- Theo giá trị: **11** high · **19** medium · **13** low. Cả 13 mục low đều đang ở trạng thái "thiếu" — tức khoảng cách lớn nhất nằm ở nơi Postie *không cần theo*.
- Theo công sức các mục high: **10/11** chỉ tốn S hoặc M (duy nhất khuyến mại là L, và đã được tách bước 1 rẻ vào P0).
- P0: 7 hạng mục · P1: 10 hạng mục · P2: 9 hạng mục · ngoài lộ trình: 13 hạng mục.
