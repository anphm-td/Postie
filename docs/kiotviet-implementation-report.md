# Báo cáo nghiệm thu — Áp dụng tính năng KiotViet vào Postie POS

- **Ngày lập:** 27/09/2026
- **Phạm vi:** các hạng mục theo roadmap KiotViet (`docs/kiotviet-roadmap.md`) được triển khai trên Postie POS (Electron + better-sqlite3, chạy offline tại quầy).
- **Nguồn dữ liệu:** danh sách trạng thái nghiệm thu do từng phần triển khai khai báo (schema, repository, UI); đã đối chiếu trực tiếp trên code tại những điểm có mâu thuẫn hoặc được đánh dấu (*) trong báo cáo này.

---

## 1. Tóm tắt

| Trạng thái | Số lượng | Ý nghĩa |
|---|---:|---|
| **Hoàn thành** (implemented) | **58** | Đã triển khai đầy đủ phần được giao |
| **Stub — một phần** | **4** | Đã làm bước đầu/khung sườn; phần còn lại chờ tích hợp hoặc dịch vụ ngoài |
| **Bỏ qua** (skipped) | **3** | Cố ý không làm theo phạm vi/roadmap đã thống nhất |
| **Tổng** | **65** | |

Phân bổ theo mảng:

| Mảng | Hoàn thành | Stub | Bỏ qua | Tổng |
|---|---:|---:|---:|---:|
| Bán hàng | 15 | 2 | 2 | 19 |
| Kho | 19 | 1 | 1 | 21 |
| Ca & báo cáo | 9 | — | — | 9 |
| Đổi trả & khách hàng | 7 | — | — | 7 |
| Báo cáo (UI) | 8 | — | — | 8 |
| Tuân thủ (HĐĐT) | — | 1 | — | 1 |

**Kiểm định: ĐẠT.** Kiểm định cuối của đợt triển khai — typecheck 2 dự án (tsconfig.node.json + tsconfig.json) + electron-vite build + schema smoke trên DB tạm — đều xanh. Tại phiên viết báo cáo (27/09/2026) đã **tái chạy trực tiếp**:

- `npm run typecheck` (tsc 2 dự án) → **exit code 0**;
- `npm run build` (electron-vite build) → **✓ built in 5.76s**.

Phần *schema smoke trên DB tạm* **không tái chạy** trong phiên viết báo cáo (không còn harness trong tree; lệnh `db:init --fresh` tác động DB thật nên không dùng để kiểm định) — kết quả "xanh" trích nguyên trạng từ kiểm định cuối của đợt.

**Vấn đề kiểm tra code còn tồn đọng ở vòng cuối: 1 vấn đề mức medium** (báo cáo doanh thu/lợi nhuận không trừ trả hàng một phần). Đã đối chiếu code hiện tại: **đã được xử lý** — chi tiết và bằng chứng tại mục 4.1.

Các ghi chú trong bảng mục 2 giữ nguyên trạng theo từng phần triển khai; những điểm mâu thuẫn giữa các ghi chú (viết ở thời điểm khác nhau) được đánh dấu (*) và đối chiếu trực tiếp trên code ngay tại chỗ.

---

## 2. Chi tiết tính năng theo mảng

Ký hiệu trạng thái: ✅ Hoàn thành · 🟡 Stub (một phần) · ⚪ Bỏ qua (theo phạm vi).

### 2.1. Bán hàng

| Tính năng | Trạng thái | Files chính | Ghi chú |
|---|---|---|---|
| Engine khuyến mại (promotions + vouchers) | ✅ | `db/schema.sql`, `src/shared/types.ts` | Chỉ schema; engine áp dụng trong orders.create và ô nhập mã ở PaymentDialog thuộc phần khác (xem dòng "Khuyến mại & giảm giá P0.5 + P2.1"); promotions.value: type 0/2 = per-mille, type 1/3 = cents (CHECK chặn % > 10000) |
| Khuyến mại & giảm giá (P0.5 + P2.1 engine) | ✅ | `electron/db/repositories/promotions.ts`, `electron/db/repositories/orders.ts` | Engine chạy trong orders.create/hold: giảm theo dòng gộp vào order_details.discount_amount (snapshot), giảm toàn đơn (thủ công + CTKM + voucher) vào orders.discount_amount + discount_reason, chặn bởi tổng tiền; **78/78 check smoke PASS** |
| Giảm giá theo từng dòng (P0.5 bước 1) | ✅ | `src/renderer/components/pos/Cart.tsx`, `src/renderer/routes/Register.tsx` | Ô nhập giảm giá từng dòng (badge %) vào order_details.discount_amount qua pipeline orders.create; giảm giá toàn đơn giữ nguyên; tổng client khớp computeOrderParts (giảm dòng trước, giảm đơn sau) |
| Thanh toán đa kênh (split-tender P0.1) | ✅ | `src/renderer/components/pos/PaymentDialog.tsx` | Nhiều dòng CASH/CARD/QR (payment_methods list), mỗi dòng nhập số tiền riêng; tự tính còn lại/tiền thừa; thiếu tiền + có khách = ghi nợ qua customer_ledger (repo xử lý); gửi mảng payments[] cho orders.create/convertHeld — không đổi schema |
| Hotkey F2/F4/F9 + nhất quán quét mã (P0.2) | ✅ | `src/renderer/routes/Register.tsx`, `src/renderer/components/pos/sound.ts`, `ProductSearch.tsx` | F2 thêm hàng nhanh, F4 focus chọn khách, F9 mở thanh toán; quét lỗi = toast sonner + âm báo lỗi, quét đúng = âm báo thành công (WebAudio, không cần file) |
| Thêm hàng nhanh tại màn bán (P0.2 — POS đa chế độ) | ✅ | `src/renderer/components/pos/QuickAddDialog.tsx` | Mini form (tên/mã vạch/nhóm/giá/vốn/đơn vị/tồn đầu) gọi products:create; có tick thêm vào giỏ sau tạo; lỗi UNIQUE mã vạch hiển thị message gốc tiếng Việt của repo |
| Đơn treo xuống DB (orders.held_at — schema) | ✅ | `db/schema.sql`, `src/shared/types.ts` | held_at NOT NULL = đơn treo, tách khỏi status=0 (bán chịu) đúng lưu ý §6.3; HeldBills.tsx đã có trong tree sẽ dùng type HeldBill |
| Đơn treo xuống DB (P1.5 — UI) | ✅ | `src/renderer/components/pos/HeldBills.tsx`, `Register.tsx` | orders:hold/listHeld/updateHeld/convertHeld/voidOrder — hết useState, không mất khi restart; gọi lại đơn giữ nguyên snapshot giá/giảm theo dòng; thanh toán đơn treo đi qua updateHeld + convertHeld (không sinh đơn mới); hủy đơn treo qua voidOrder (repo tự nhả voucher) |
| Đặt hàng / giữ đơn (P1.5 — repo) | ✅ | `electron/db/repositories/orders.ts` | hold/updateHeld/convertHeld/listHeld dùng orders.held_at (status=0 vẫn là bán chịu — phân biệt bằng held_at đúng ghi chú schema); khuyến mại giữ nguyên tại thời điểm giữ; đặt trước có cọc (bảng deposits) bỏ theo roadmap "có thể để sau" |
| Hủy đơn orders:void (P0.3 — repo) | ✅ | `electron/db/repositories/orders.ts` | voidOrder: status=2 + trả tồn type=3 + xóa nợ bán chịu + audit_log 'VOID_ORDER' + nhả voucher; chặn hủy đơn đã trả hàng (status=3) |
| Hủy đơn (void) + in lại (P0.3 — UI) | ✅ | `src/renderer/components/pos/RecentOrdersDialog.tsx` | Dialog "Đơn gần đây" (orders:listRecent 30): xem chi tiết, in lại hóa đơn, hủy với lý do (orders:voidOrder — repo trả tồn qua stock_movements, xóa nợ, ghi audit_log); không cho hủy đơn đã hủy/đã trả hàng |
| In hóa đơn 80mm sau thanh toán (P0.3) | ✅ | `src/renderer/components/pos/receipt.ts` | Template HTML 80mm (@page size 80mm auto) in qua iframe ẩn window.print(); tự in ngay sau onPaid + nút In lại; in tên cửa hàng/địa chỉ/ĐT từ cấu hình, từng dòng thanh toán, còn nợ, tiền thối; không cần ESC/POS vì máy in 80mm cài driver hệ thống |
| Trả hàng theo hóa đơn (P1.4 — repo) | ✅ | `electron/db/repositories/returns.ts` | 1 transaction: returns + return_details + movements type=1 + status=3 khi trả đủ + hoàn nợ qua customer_ledger; tiền hoàn tính lại theo giá đã giảm (phân bổ giảm giá toàn đơn theo tỷ lệ dòng) |
| Snapshot cost_cents vào order_details (P1.1 phần orders) | ✅ | `electron/db/repositories/orders.ts` | create/hold/updateHeld chốt products.cost tại thời điểm bán; migration thêm cột cho DB cũ thuộc connection.ts — schema.sql mới đã có cột |
| QR VietQR tĩnh (P1.6 — schema) | ✅ | `db/schema.sql` | Không cần đổi schema: order_payments.reference đã có sẵn để lưu nội dung CK/mã giao dịch = invoice_no |
| QR VietQR tĩnh (P1.6 bước 1 — repo) | 🟡 | `electron/db/repositories/orders.ts` | buildVietQRPayload sinh chuỗi EMVCo chuẩn VietQR (CRC16 tự viết, không lib ngoài, verified vector CRC '123456789'→29B1); render hình QR + lưu order_payments.reference thuộc phase tích hợp; webhook đối soát (bước 2) cần dịch vụ ngoài — P2 |
| QR VietQR tĩnh (P1.6 bước 1 offline — UI) | 🟡 | `PaymentDialog.tsx`, `pos/storeConfig.ts`, `StoreConfigDialog.tsx` | Gọi orders:buildVietQRPayload (EMVCo, đã có ở repo) + thư viện qrcode vẽ hình; nội dung CK = #invoice_no (đơn treo số thật, đơn mới dự đoán max+1), lưu vào order_payments.reference; chưa tự đối soát tiền về (webhook = P2 ngoài phạm vi); BIN/STK lưu localStorage máy quầy vì preload/ipc chưa có namespace app_settings |
| Đặt hàng trước / giữ đơn có cọc (deposits) | ⚪ | — | Roadmap P1.5 ghi rõ "đơn đặt trước thật sự (khách cọc) cần thêm bảng deposits nhưng có thể để sau" — đơn treo DB đã phủ nhu cầu giữ đơn |
| QR động tự đóng đơn / webhook ngân hàng | ⚪ | — | Loại trừ theo đề bài (webhook ngân hàng = dịch vụ ngoài, xếp P2 trong roadmap) |

### 2.2. Kho

| Tính năng | Trạng thái | Files chính | Ghi chú |
|---|---|---|---|
| Phiếu nhập/đặt hàng NCC (purchase_orders) + công nợ supplier_ledger (schema) | ✅ | `db/schema.sql`, `src/shared/types.ts` | Nhận hàng = 1 tx: INSERT movements type=2 từng dòng + UPDATE products.cost từ line cost + supplier_ledger phần chưa trả; status 2=đã hủy là mở rộng có chủ đích theo nguyên tắc §6.1 (hủy phiếu dùng status) |
| Nhập hàng / đặt hàng nhập (P1.2 — repo) | ✅ | `electron/db/repositories/purchases.ts` | Nhận một phần/đủ nhiều lần trong 1 tx (movements type=2 + UPDATE products.cost khi nhập + công nợ + trả trước/cọc), tự hoàn tất phiếu khi nhận đủ, hủy qua status=2 |
| Nhập hàng — tạo/nhận phiếu từ NCC (P1.2 — UI) | ✅ | `src/renderer/routes/Purchases.tsx`, `inventory/PurchaseFormDialog.tsx`, `PurchaseDetailDialog.tsx` | Tạo phiếu với quét mã tăng SL; nhận một phần/đủ nhiều lần (mỗi lần 1 transaction trong repo: movements type=2 + UPDATE products.cost + supplier_ledger); hủy phiếu chỉ khi chưa nhận |
| Nhà cung cấp & công nợ phải trả (P1.2 — repo) | ✅ | `electron/db/repositories/suppliers.ts` | CRUD + sổ cái supplier_ledger; balance là cột dẫn xuất sync qua trg_supplier_ledger_after_insert, chặn vô hiệu hóa khi còn nợ |
| Quản lý nhà cung cấp & công nợ phải trả (P1.2 — UI) | ✅ | `inventory/SupplierSection.tsx`, `SupplierFormDialog.tsx`, `SupplierPaymentDialog.tsx`, `SupplierAdjustDialog.tsx`, `SupplierLedgerDialog.tsx` | CRUD + trả tiền + điều chỉnh công nợ + sổ cái; balance chỉ đổi qua supplier_ledger (recordPayment/adjustBalance), không UPDATE trực tiếp |
| Kiểm kho (stocktakes — schema) | ✅ | `db/schema.sql`, `src/shared/types.ts` | Movement type=3 delta âm được phép (đã test); repo cần nới guard tồn âm ở products.ts:115-146 (file khác) — *đã đối chiếu khi viết báo cáo: guard tồn âm vẫn còn ở products.ts:182-188, chưa nới — xem mục 3.3* |
| Kiểm kho (P1.3 — repo) | ✅ | `electron/db/repositories/stocktakes.ts` | book_qty snapshot lúc thêm dòng, quét lại upsert, Hoàn thành sinh movements type=3 delta=counted−book (âm được) trong 1 tx, guard tồn âm rollback cả phiếu |
| Kiểm kho — đếm thực tế → chênh lệch → điều chỉnh (P1.3 — UI) | ✅ | `src/renderer/routes/Stocktakes.tsx` | Quét mã Enter tăng số đếm (repo upsert, book_qty chốt lần đầu), sửa số đếm tay commit khi blur/Enter, tổng hợp thiếu/thừa, Hoàn thành sinh movements type=3 delta=counted−book (cho phép âm), Hủy phiếu status=2 |
| Điều chỉnh tồn kho thủ công + hao hụt — types 3/4 (repo) | ✅ | `electron/db/repositories/products.ts` | manualAdjust (bắt buộc lý do) + wastage; chỉ INSERT stock_movements, không UPDATE products.stock |
| Điều chỉnh tồn & hao hụt (P1.8 — UI) | ✅ | `inventory/StockCorrectionDialog.tsx` | Điều chỉnh signed bắt buộc lý do (products.manualAdjust type=3) + hao hụt (products.wastage type=4); UI không bao giờ UPDATE products.stock |
| Thẻ kho + cảnh báo tồn thấp + giá trị kho (P0.5/P1.9 — repo) | ✅ | `electron/db/repositories/products.ts` | listMovements (thẻ kho), listLowStock/getStockReport so sánh ngưỡng trong SQL (bỏ dự báo AI theo roadmap) |
| Thẻ kho — lịch sử biến động tồn (P1.1 — UI) | ✅ | `inventory/StockMovementsDialog.tsx` | products.listMovements(product.id, 200) hiển thị loại/delta/ghi chú/hóa đơn/nhân viên |
| Nhóm hàng (categories) — P0.7 (repo) | ✅ | `electron/db/repositories/categories.ts` | CRUD phân cấp + guard vòng lặp + soft-delete; products.list đã nhận categoryId từ trước nên chỉ thiếu repo |
| Danh mục hàng hóa & phân loại (P0.7 — UI) | ✅ | `inventory/CategoryManager.tsx`, `src/renderer/routes/Products.tsx` | CRUD nhóm phân cấp + lọc sản phẩm theo nhóm trên tab Sản phẩm; gán nhóm/NCC qua ProductAssignmentDialog vì AddProductDialog (components/pos — ngoài phạm vi phần được giao) chưa có ô chọn nhóm |
| Cảnh báo tồn thấp nổi bật (P1.9) | ✅ | `inventory/LowStockBanner.tsx`, `Products.tsx` | Banner đỏ/vàng trên đầu tab Sản phẩm với số lượng hết hàng/sắp hết từ products.getStockReport (so sánh ngưỡng trong SQL), bấm lọc nhanh danh sách tương ứng |
| In tem mã vạch 40x20mm + chọn số lượng (P1.7) | ✅ | `inventory/BarcodePrintDialog.tsx`, `Products.tsx`, `Stocktakes.tsx` | JsBarcode (đã npm install jsbarcode + @types/jsbarcode) render CODE128; @page 40mm 20mm chèn riêng trong component, không đụng index.css; in lẻ theo dòng hoặc theo lựa chọn checkbox; SP thiếu mã vạch bị bỏ qua kèm cảnh báo |
| Combo/đóng gói (products.type + combo_details — schema) | ✅ | `db/schema.sql`, `src/shared/types.ts` | orders.create phải INSERT movement delta âm cho từng thành phần (không phải dòng combo); tái dùng được làm recipe/BOM sau này — *đã đối chiếu khi viết báo cáo: orders.ts chưa có logic trừ tồn thành phần combo — xem mục 3.2* |
| Variants + đơn vị tính quy đổi (product_variants + product_units — schema) | ✅ | `db/schema.sql`, `src/shared/types.ts` | Schema đủ dùng; contract: mọi movement cho variant PHẢI kèm variant_id để giữ product.stock = Σ variant.stock; UI useCart tái cấu trúc là việc khác — *đã đối chiếu: useCart.ts chưa có xử lý variant — xem mục 3.4* |
| Hàng lô/HSD FEFO (batches + stock_movements.batch_id — schema) | ✅ | `db/schema.sql`, `src/shared/types.ts` | Trigger tự sync qty từng lô; nhận hàng INSERT delta dương theo lô, bán chọn lô hết hạn sớm nhất; index idx_batches_expiry cho cảnh báo |
| Đề xuất hàng nhập (prefill gợi ý) — P2.3 (repo) | ⚪ | `electron/db/repositories/purchases.ts` | Ngoài phạm vi được giao; tiền đề đã sẵn: purchase_orders status 0 + getReceivedLines + getStockReport (low_stock) để phase tích hợp dựng màn |
| Đề xuất nhập hàng (P2.3 — UI) | 🟡 | `inventory/LowStockBanner.tsx` | Bước 1 offline: banner + lọc hết hàng/sắp hết là đầu vào trực tiếp để lập phiếu nhập (bấm banner → lọc → chọn SP → in tem/tạo phiếu); màn "đề xuất tự điền số lượng" riêng để tương lai |

### 2.3. Ca & báo cáo (repository)

| Tính năng | Trạng thái | Files chính | Ghi chú |
|---|---|---|---|
| Kết ca đầy đủ — thu/chi trong ca (shift_cash_events — schema) | ✅ | `db/schema.sql`, `src/shared/types.ts` | Bảng + index đúng §6.2; công thức expected_cash và IPC shifts:listByUser cần cập nhật ở shifts.ts/ipc.ts (ngoài phạm vi phần schema) — *(\*) đã đối chiếu khi viết báo cáo: cả hai đã hoàn tất, xem 2 dòng dưới* |
| Kết ca đủ — thu/chi tiền trong ca (P0.4 — repo) | ✅ | `electron/db/repositories/shifts.ts` | close() đã đổi công thức: expected_cash = opening_cash + cash_sales + SUM(thu) − SUM(chi) (shift_cash_events); thu/chi chỉ ghi trên ca đang mở để không phá đối ca đã chốt (CHECK shifts) |
| Lịch sử ca theo user/thời gian (P0.4 — repo) | ✅ | `electron/db/repositories/shifts.ts` | list()/listByUser() lọc userId/from/to/status, JOIN users lấy display_name; ghi chú gốc "chờ phase tích hợp đăng ký IPC shifts:listByUser" — *(\*) đã đối chiếu: electron/ipc.ts:230-231 đã đăng ký handler shifts:listByUser* |
| Báo cáo theo ngày/ca/nhân viên/phương thức (P0.6 + P1.9 — repo) | ✅ | `electron/db/repositories/reports.ts` | revenueByDay/revenueByShift/revenueByUser/revenueByPaymentMethod; mọi hàm nhận ReportRange (from/to unix seconds inclusive, shiftId, userId); doanh thu khớp Reports.tsx:55, chỉ đếm status IN (1,4) trùng bộ lọc tiền mặt khi kết ca |
| Lợi nhuận từ cost snapshot (P1.1 — repo) | ✅ | `electron/db/repositories/reports.ts` | Ưu tiên snapshot order_details.cost_cents; khi snapshot = 0 hoặc cột chưa có (DB cũ) tự fallback products.cost hiện tại qua hasColumn/pragma_table_info (reports.ts:186-209). LƯU Ý trong ghi chú gốc: "orders.create (orders.ts:114-124) hiện CHƯA ghi cost_cents" — *(\*) đã đối chiếu: orders.create hiện đã INSERT cost_cents vào order_details (electron/db/repositories/orders.ts:150-154), lưu ý này đã lỗi thời* |
| Doanh thu theo sản phẩm/danh mục + top bán chạy + tồn kho (P1.9 — repo) | ✅ | `electron/db/repositories/reports.ts` | revenueByProduct/revenueByCategory/topProducts/stockReport; tồn kho là cột dẫn xuất chỉ ĐỌC, không UPDATE; lowOnly khớp quy ước UI (hết hàng stock<=0, tồn thấp low_stock_alert>0 && stock<=low_stock_alert) |
| Snapshot giá vốn (order_details.cost_cents) + sổ kế toán-lite (cash_transactions — schema) | ✅ | `db/schema.sql`, `src/shared/types.ts` | cost_cents là điều kiện tiên quyết cho báo cáo lợi nhuận (P1.1); cash_transactions phục vụ xuất CSV theo kỳ (P2.7) |
| Lịch sử ca + chi tiết ca (P0.4 — UI) | ✅ | `src/renderer/components/shifts/ShiftHistoryPanel.tsx`, `ShiftDetailDialog.tsx` | shifts:list với lọc trạng thái/thu ngân; chi tiết ca hiển thị thu/chi + expected/counted/difference (chỉ đọc, CHECK ràng buộc) |
| Thu/chi tiền trong ca (P0.4 — UI) | ✅ | `shifts/ShiftCashEventDialog.tsx`, `ShiftHistoryPanel.tsx`, `ShiftDetailDialog.tsx` | shifts:addCashEvent (chỉ ca đang mở, cents > 0); đã vào luồng qua tab Lịch sử ca (có ghi chú liên quan CloseShiftDialog) |

### 2.4. Đổi trả & khách hàng

| Tính năng | Trạng thái | Files chính | Ghi chú |
|---|---|---|---|
| Trả hàng theo hóa đơn (P1.4 — màn Đổi trả) | ✅ | `src/renderer/routes/Returns.tsx` | Đầy đủ tra cứu theo số hóa đơn (orders.getByInvoiceNo — preload.ts:160, orders.ts:697) / chọn từ đơn gần đây (listRecent header-only → getById nạp details) / phiếu trả gần đây (returns.listRecent); chọn dòng + SL, lý do, xác nhận qua returns.createReturn (ipc.ts:439-448 đã đăng ký đủ 4 handler); tiền hoàn chính thức lấy từ ReturnRow.total sau khi tạo |
| Công nợ khách: recordPayment/adjustBalance khớp customer_ledger + lịch sử công nợ | ✅ | `electron/db/repositories/customers.ts` | 2 hàm có sẵn ghi đúng quy ước ledger (type 1 âm, type 2 signed, trigger trg_ledger_after_insert sync balance — schema.sql:627-634) và getLedger đã tồn tại sẵn (customers.ts:200-209) nên không thêm mới; chỉ bổ sung guard requireWritableCustomer chặn ghi sổ lên khách không tồn tại/đã vô hiệu hóa (trước đây nổ lỗi FK kỹ thuật) |
| Khách hàng: danh sách / tìm kiếm / theo phone / lọc còn nợ | ✅ | `src/renderer/routes/Customers.tsx` | Search debounce 250ms truyền vào customers.list({search}) — repo LIKE cả name lẫn phone (customers.ts:41-43); summary header từ getSummary |
| Khách hàng: tạo khách | ✅ | `src/renderer/components/customers/AddCustomerDialog.tsx` | Đã tồn tại từ run trước, đối chiếu khớp API nên giữ nguyên |
| Khách hàng: lịch sử công nợ (customer_ledger) | ✅ | `customers/LedgerDialog.tsx` | getLedger newest-first, invoice_no LEFT JOIN orders (customers.ts:222-231) |
| Khách hàng: ghi nhận thanh toán khách trả (thu nợ) | ✅ | `customers/RecordPaymentDialog.tsx` | recordPayment INSERT ledger âm — tuân thủ nguyên tắc không UPDATE customers.balance trực tiếp (trigger trg_ledger_after_insert sync) |
| Khách hàng: sửa + vô hiệu hóa (soft-delete) + điều chỉnh công nợ (manager) | ✅ | `customers/EditCustomerDialog.tsx`, `AdjustDebtDialog.tsx` | Deactivate bị chặn khi còn dư nợ đúng guard repo; adjust chỉ hiện role ≤ 1, lý do bắt buộc |

### 2.5. Báo cáo (UI)

| Tính năng | Trạng thái | Files chính | Ghi chú |
|---|---|---|---|
| Tổng hợp doanh thu/lợi nhuận theo khoảng thời gian (P1.9 + P1.1) | ✅ | `src/renderer/routes/Reports.tsx`, `reports/OverviewPanel.tsx`, `DateRangePicker.tsx`, `SummaryCards.tsx` | getSalesSummary với from/to unix seconds giờ máy quầy; lợi nhuận gộp = doanh thu − thuế − giá vốn snapshot cost_cents |
| Doanh thu theo ngày + biểu đồ (P1.9) | ✅ | `reports/RevenuePanels.tsx` (DailyPanel), `DailyRevenueChart.tsx`, `DailyRevenueTable.tsx` | revenueByDay, biểu đồ cột CSS thuần không thêm dependency |
| Doanh thu theo ca (P1.9) | ✅ | `reports/ShiftRevenueTable.tsx` | revenueByShift; đơn không gắn ca gom về dòng riêng |
| Báo cáo hiệu quả nhân viên (P0.6) | ✅ | `reports/UserRevenueTable.tsx` | revenueByUser GROUP BY orders.user_id |
| Doanh thu theo sản phẩm + top bán chạy (P1.1/1.9) | ✅ | `reports/ProductRevenueTable.tsx`, `RevenuePanels.tsx` (ProductPanel) | revenueByProduct + topProducts; sort doanh thu/số lượng, Top 10/25/50/Tất cả; giá vốn theo snapshot cost_cents với fallback products.cost |
| Doanh thu theo danh mục/nhóm hàng (P1.9) | ✅ | `reports/CategoryRevenueTable.tsx` | revenueByCategory với tỷ trọng % |
| Doanh thu theo phương thức thanh toán (P1.9) | ✅ | `reports/OverviewPanel.tsx`, `BarList.tsx` | revenueByPaymentMethod JOIN order_payments (split-tender) |
| Báo cáo tồn kho + tồn thấp (P1.9) | ✅ | `reports/StockPanel.tsx`, `StockReportTable.tsx` | stockReport: giá trị kho = Σ stock×cost, badge hết hàng/tồn thấp, lọc + tìm kiếm; chỉ đọc cột dẫn xuất |

### 2.6. Tuân thủ

| Tính năng | Trạng thái | Files chính | Ghi chú |
|---|---|---|---|
| HĐĐT giai đoạn 1 + cấu hình cửa hàng (tax_code, e_invoice_no, app_settings) | 🟡 | `db/schema.sql`, `src/shared/types.ts` | Chỉ schema cấu hình + mapping số HĐĐT; giai đoạn 2 (gọi API nhà cung cấp HĐĐT) nằm ngoài phạm vi offline (loại theo yêu cầu) |

---

## 3. Những gì cần làm sau khi nhận

### 3.1. Tạo lại DB với schema mới (bắt buộc nếu muốn dùng ngay)

```bash
npm run db:init -- --fresh
```

Schema mới đã có đủ các bảng/cột của đợt này (đã kiểm tra `db/schema.sql`): `shift_cash_events`, `purchase_orders` + `purchase_order_details`, `supplier_ledger`, `stocktakes` + `stocktake_details`, `promotions`, `vouchers`, `combo_details`, `product_variants`, `product_units`, `batches`, `cash_transactions`, `app_settings`, `categories`, `suppliers`, `returns`/`return_details`; cột `orders.held_at` (schema.sql:229) và `order_details.cost_cents` (schema.sql:247). Flag `--fresh` được hỗ trợ tại `electron/main.ts:13,25,44` (xóa DB cũ trước khi init).

⚠️ **Dữ liệu cũ sẽ mất** — chỉ chạy trên máy chấp nhận reset dữ liệu, hoặc sao lưu file DB trước.

### 3.2. Stub chờ dịch vụ ngoài (không chặn nghiệm thu)

- **HĐĐT giai đoạn 2** — gọi API nhà cung cấp hóa đơn điện tử: ngoài phạm vi offline, chờ chọn NCC và tài khoản dịch vụ.
- **QR động / webhook ngân hàng đối soát tự động (P2)** — cần dịch vụ ngân hàng bên ngoài. Hiện tại bước 1 offline đã có: payload VietQR chuẩn EMVCo + hình QR trong PaymentDialog + lưu nội dung CK vào `order_payments.reference`; nhân viên đối soát tiền về thủ công.
- **Màn "đề xuất nhập hàng tự điền số lượng" (P2.3)** — để tương lai; bước đầu (banner + lọc hết hàng/sắp hết) đã dùng được làm đầu vào lập phiếu nhập.

### 3.3. Việc tích hợp còn mở (theo ghi chú nghiệm thu, đã đối chiếu code ngày 27/09/2026)

1. **Combo/đóng gói khi bán:** `orders.create` phải INSERT stock_movements delta âm cho từng thành phần combo (không phải dòng combo). Hiện `combo_details` mới chỉ có ở schema (`db/schema.sql:444-449`) và types (`src/shared/types.ts:523`) — chưa có logic bán combo trong `orders.ts`. Cần bổ sung trước khi đưa sản phẩm dạng combo vào bán.
2. **Nới guard tồn âm ở products.ts:** ghi chú kiểm kho yêu cầu nới guard để dòng điều chỉnh âm hoạt động đầy đủ. Đã đối chiếu: guard vẫn còn — `adjustStock` ném lỗi "Stock would go negative" khi tồn âm (products.ts:182-188), khiến hoàn thành phiếu kiểm kho có chênh lệch âm làm tồn âm sẽ rollback cả phiếu. Cần quyết định nghiệp vụ: cho phép tồn âm có kiểm soát hay giữ guard.
3. **Variants trong giỏ hàng:** schema `product_variants`/`product_units` đủ dùng (contract: mọi movement cho variant phải kèm variant_id để giữ product.stock = Σ variant.stock), nhưng `useCart.ts` chưa có xử lý variant (grep = 0 match) — cần tái cấu trúc giỏ hàng khi đưa hàng nhiều đơn vị vào bán.
4. **Namespace app_settings trong preload/ipc:** cấu hình cửa hàng (BIN VietQR, số tài khoản, thông tin in hóa đơn) đang lưu localStorage máy quầy vì preload/ipc chưa có namespace app_settings (grep preload.ts = 0 match). Bảng `app_settings` đã có trong schema — cần bổ sung namespace để cấu hình xuống DB, đồng bộ giữa các máy.

### 3.4. Đã đối chiếu và xác nhận KHÔNG cần làm nữa (ghi chú cũ đã lỗi thời)

- **IPC `shifts:listByUser`** — đã đăng ký tại `electron/ipc.ts:230-231`.
- **Ghi `cost_cents` vào order_details khi bán** — `orders.create` đã INSERT cột này (electron/db/repositories/orders.ts:150-154); báo cáo lợi nhuận tự dùng snapshot, đúng như ghi chú "không cần sửa reports".
- **Công thức expected_cash khi kết ca** — đã cập nhật trong `shifts.close()`: expected_cash = opening_cash + cash_sales + SUM(thu) − SUM(chi) từ shift_cash_events.

---

## 4. Hạn chế đã biết

### 4.1. Vấn đề medium từ vòng kiểm tra code cuối — ĐÃ ĐƯỢC XỬ LÝ trong code hiện tại

**Vấn đề ghi nhận:** mọi báo cáo doanh thu/lợi nhuận (`getSalesSummary`, `revenueByDay/ByShift/ByUser/ByProduct/ByCategory`) chỉ đếm đơn status IN (1,4) với toàn bộ `orders.total` và snapshot dòng hàng, không trừ phiếu trả hàng một phần (REVENUE_STATUSES ở reports.ts:174 lúc kiểm tra). Repro lúc đó: bán 200.000₫ giá vốn 80.000₫ rồi trả 1/2 hàng (hoàn 100.000₫) → `getSalesSummary` vẫn revenue=200000, cogs=80000, gross_profit=120000; `revenueByProduct` vẫn qty_sold=2 (đúng ra phải 100000/40000/60000/1) → doanh thu, giá vốn, lợi nhuận gộp và top bán chạy bị khai tăng đúng bằng giá trị trả một phần.

**Đối chiếu khi viết báo cáo (27/09/2026, bằng cách đọc code — chưa chạy lại repro hành vi):** `electron/db/repositories/reports.ts` hiện đã tính NET phần trả một phần trên toàn bộ báo cáo:

- `returnedByDetailSubquery()` — tổng số lượng đã trả theo từng dòng bán từ `return_details` (reports.ts:217-223);
- `orderFactsSubquery()` — giá vốn chỉ tính phần CHƯA trả (cost × (qty − ret_qty)) và thuế hoàn theo tỷ lệ (reports.ts:235-246);
- `refundsByOrderSubquery()` — tổng tiền đã hoàn theo đơn từ `returns.total` (reports.ts:254-260), trừ NET khỏi doanh thu trong `getSalesSummary` (reports.ts:291), `revenueByDay` (333), `revenueByShift` (364), `revenueByUser` (394);
- `revenueByProduct` và `revenueByCategory` tính theo phần chưa trả của từng dòng, giảm giá dòng phân bổ theo tỷ lệ số lượng (reports.ts:430-433, 454, 478-479, 493).

→ Doanh thu, giá vốn, lợi nhuận gộp và số lượng bán trong báo cáo không còn bị khai tăng bởi trả hàng một phần. Đây là lý do mục 1 kết luận kiểm định ĐẠT với 1 vấn đề medium đã xử lý. Khuyến nghị: chạy lại kịch bản repro (bán → trả một phần → xem báo cáo) trong lần kiểm thử chấp nhận tiếp theo để có xác nhận hành vi.

### 4.2. Các hạn chế còn lại (trích từ dữ liệu nghiệm thu)

- **VietQR chưa đối soát tự động:** chưa tự nhận biết tiền về (webhook ngân hàng = P2, dịch vụ ngoài). Nội dung chuyển khoản = #invoice_no; với đơn mới số hóa đơn được **dự đoán** max+1 (đơn treo dùng số thật). BIN/số tài khoản lưu localStorage máy quầy (chưa xuống `app_settings`) — xem mục 3.3.4.
- **HĐĐT mới chỉ giai đoạn 1:** schema cấu hình + mapping số hóa đơn; phát hành thật chờ giai đoạn 2 (API nhà cung cấp).
- **Giá vốn fallback không chính xác 100%:** dòng bán cũ (trước khi orders.create ghi snapshot, hoặc DB chưa migrate) không có `cost_cents` → báo cáo tạm lấy `products.cost` hiện tại thay vì giá vốn đúng thời điểm bán (reports.ts:199-209).
- **Đặt hàng trước có cọc (bảng deposits) chưa làm:** bỏ theo roadmap "có thể để sau" — đơn treo DB phủ nhu cầu giữ đơn nhưng chưa có nghiệp vụ cọc.
- **Đề xuất nhập hàng P2.3 chỉ có bước đầu:** banner + lọc hết hàng/sắp hết; chưa có prefill tự động số lượng đề xuất.
- **Thu/chi trong ca chỉ ghi trên ca đang mở** (do CHECK shifts) — thiết kế để không phá đối ca đã chốt; cần thao tác thu/chi trước khi kết ca.
- **Dự báo AI cho nhập hàng** đã bỏ theo roadmap; ngưỡng tồn thấp so sánh trực tiếp trong SQL.

---

*Hết báo cáo. Số liệu trạng thái (65 hạng mục) lấy nguyên trạng từ danh sách nghiệm thu của đợt; các đánh dấu (*) là kết quả đối chiếu trực tiếp trên code tại phiên viết báo cáo ngày 27/09/2026.*
