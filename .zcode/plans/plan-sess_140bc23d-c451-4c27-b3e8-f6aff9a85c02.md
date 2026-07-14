# Kế hoạch — 2 tính năng: Đóng ca & đối soát + Báo cáo doanh thu

(chưa làm phần công nợ/khách hàng)

## Tổng quan
Cả 2 backend gần như sẵn sàng, chỉ thêm 1 endpoint nhỏ cho báo cáo theo ca. Giữ conventions hiện có.

---

## Tính năng 1: Đóng ca & đối soát (`components/pos/CloseShiftDialog.tsx`)

Backend `shifts.close(shiftId, countedCash)` đã tự tính:
- `expected_cash` = opening_cash + tổng tiền mặt (CASH) bán được trên ca
- `difference` = counted_cash - expected_cash

**UI:**
- Nút "Đóng ca" thêm vào **sidebar** App.tsx (dưới nav, separator), chỉ hiện khi `activeShift` tồn tại.
- Dialog:
  - Hiện: nhân viên, mở lúc (`formatDateTime`), tiền đầu ca (`formatVnd(opening_cash)`).
  - Input: "Tiền mặt đếm được (₫)" — gợi ý bao gồm tiền đầu ca + doanh thu tiền mặt.
  - Submit → `api.shifts.close(activeShift.id, countedCents)`.
  - Kết quả: hiển thị tóm tắt — dự kiến (expected), đếm được (counted), chênh lệch (xanh =0 / đỏ lệch) + nút xác nhận.
  - Sau xác nhận → `refreshShift()` (activeShift → null → app tự route về ShiftOpen).
- Lấy `activeShift` + `refreshShift` từ `useAuth`.

## Tính năng 2: Màn Báo cáo doanh thu (`routes/Reports.tsx`)

### Backend thêm (tối thiểu):
- `orders.ts` repo: thêm `listByShift(shiftId, limit)` — `SELECT * FROM orders WHERE shift_id=? ORDER BY created_at DESC`.
- `ipc.ts` + `preload.ts`: expose `orders:listByShift(shiftId, limit?)`.

### Frontend `Reports.tsx`:
- **Header**: "Báo cáo doanh thu" + bộ lọc 2 lựa chọn: "Ca hiện tại" / "50 đơn gần nhất".
  - Ca hiện tại: `orders.listByShift(activeShift.id)` (nếu có ca).
  - Gần nhất: `orders.listRecent(50)`.
- **Thẻ tóm tắt** (tính client-side từ header đơn — tránh phụ thuộc payments detail):
  - Số đơn
  - Tổng doanh thu (Σ total, `formatVnd`)
  - Đã thu (Σ paid_amount)
  - Còn nợ (Σ total - paid_amount)
- **Bảng đơn**: Hóa đơn # | Giờ (`formatDateTime`) | Tổng (`formatVnd`) | Đã thu | Trạng thái (badge: đã thanh toán/đang xử lý/hủy).

## Wiring App.tsx
- Thay Placeholder reports → `<Reports />`.
- Thêm nút "Đóng ca" ở sidebar (separator dưới nav), mở `CloseShiftDialog`. Chỉ hiện khi `activeShift`.

---

## File summary
**Backend (sửa/mới):**
- Sửa: `electron/db/repositories/orders.ts` (thêm `listByShift`)
- Sửa: `electron/ipc.ts` (handler `orders:listByShift`), `electron/preload.ts` (expose)

**Frontend (mới):**
- `routes/Reports.tsx`
- `components/pos/CloseShiftDialog.tsx`

**Frontend (sửa):** `App.tsx` (wire Reports + nút đóng ca)

## Kiểm tra
1. `npm run typecheck` pass
2. `npx electron-vite build` pass
3. Dọn `out/` cũ
4. `npm run dev`: đóng ca (nhập tiền đếm → thấy chênh lệch → route về mở ca); báo cáo (xem tóm tắt + danh sách đơn theo ca)