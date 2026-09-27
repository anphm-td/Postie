# Postie POS

Phần mềm bán hàng (POS) offline dành cho cửa hàng / quán nhỏ tại Việt Nam. Chạy hoàn toàn cục bộ — không cần internet, dữ liệu nằm trong SQLite trên máy.

**Postie POS** là desktop app built trên **Electron + React**, làm việc tốt cả khi mạng chập chờn: bán hàng tại quầy, in hóa đơn 80mm, quản lý kho, công nợ khách và nhà cung cấp, báo cáo doanh thu — tất cả trong một.

## Tính năng

| Nhóm | Mô tả |
|---|---|
| **Bán hàng** | Lưới sản phẩm + tìm theo tên, quét mã vạch (kể cả gõ tay), giỏ hàng, giảm giá, khuyến mãi tự động + voucher, thanh toán tiền mặt / QR (có VietQR payload), bán chịu cho khách, treo đơn |
| **Hóa đơn** | Xem / tìm / lọc theo trạng thái & thời gian, xem chi tiết, in lại, hủy đơn (void) với phân quyền — hoàn tồn kho + ghi audit log |
| **Đổi trả** | Trả hàng theo hóa đơn, phân bổ giảm giá theo dòng, hoàn tồn kho + hoàn tiền vào ca |
| **Kho hàng** | Sản phẩm / biến thể / danh mục / nhà cung cấp, nhập hàng loạt từ Excel (.xlsx/.csv) có xem trước, in tem mã vạch, cảnh báo tồn thấp |
| **Nhập hàng** | Đặt hàng NCC, nhận hàng một phần nhiều lần, cập nhật giá vốn, công nợ phải trả |
| **Kiểm kê** | Phiếu kiểm kho, so sánh tồn sổ − tồn thực, chênh lệch ghi movement |
| **Khách hàng & công nợ** | Hồ sơ khách, sổ cái công nợ, thu nợ, điều chỉnh thủ công (quản lý trở lên) |
| **Báo cáo** | Doanh thu theo ngày / ca / nhân viên / sản phẩm / nhóm hàng / phương thức thanh toán, lợi nhuận, tồn kho |
| **Ca làm việc** | Mở ca — tiền đầu ca, thu/chi tiền mặt trong ca, đóng ca đối soát (dự kiến vs đếm được) |
| **Tài khoản** | Đăng nhập bằng mật khẩu (bcrypt), ghi nhớ phiên, vai trò admin / quản lý / thu ngân, thiết lập lần đầu ngay trên app |

## Công nghệ

- **Electron 33** + **electron-vite** (3 process: main / preload / renderer)
- **React 18** + TypeScript + Tailwind CSS + shadcn/ui + Radix
- **SQLite** qua `better-sqlite3` (WAL, prepared-statement cache, migration theo `PRAGMA user_version`)
- **SheetJS (xlsx)** nhập Excel, `jsbarcode` + `qrcode` in tem & QR
- Đóng gói: `electron-builder` (NSIS installer cho Windows)

## Kiến trúc thư mục

```
src/
├── backend/            # Main process — toàn bộ logic dữ liệu
│   ├── index.ts        # Entry: cửa sổ, vòng đời app, CLI modes
│   ├── ipc/            # Handlers IPC, tách theo domain (1 file/domain)
│   │   ├── index.ts    #   registerIpc() gọi tất cả
│   │   └── products.ts #   ... orders.ts, customers.ts, ...
│   ├── db/
│   │   ├── connection.ts     # Kết nối SQLite + PRAGMA + migration
│   │   └── repositories/     # 13 module, 1 module/domain
│   └── services/             # Nghiệp vụ phụ (excel.ts: nhập Excel)
├── preload/
│   └── index.ts        # contextBridge — API `window.postieAPI` có type
├── renderer/           # Frontend React (không đụng Node/DB trực tiếp)
│   ├── routes/         # 1 file/màn hình (Register, Invoices, Products, ...)
│   ├── components/     # ui/ (shadcn) + pos/ + customers/ + reports/ ...
│   ├── context/        # AuthContext
│   ├── hooks/          # useCart, useShiftGuard, useSetupGuard
│   └── lib/            # api wrapper, format helpers (formatVnd...), utils
└── shared/
    └── types.ts        # Hợp đồng type dùng chung backend ↔ frontend

db/schema.sql           # Schema SQLite — nguồn sự thật duy nhất
```

**Luồng dữ liệu:** `renderer` → `window.postieAPI` (preload, type `PostieAPI`) → `ipcMain.handle` (backend/ipc) → `repositories` → SQLite. Frontend không bao giờ đụng DB trực tiếp.

**Quy ước dữ liệu:** tiền lưu **integer cents** (hiển thị bằng `formatVnd`), timestamp là **Unix giây**, tồn kho & công nợ là **cột derived** — chỉ thay đổi qua `stock_movements` / `customer_ledger` (trigger tự đồng bộ, không UPDATE trực tiếp).

## Chạy dự án

```bash
npm install          # cài dependencies
npm run dev          # chạy môi trường dev (Vite HMR + Electron)
```

Lần chạy đầu trên máy mới: app tự mở màn **Thiết lập lần đầu** — đặt mật khẩu admin là dùng được (không cần lệnh CLI).

### Scripts

| Lệnh | Ý nghĩa |
|---|---|
| `npm run dev` | Dev với HMR |
| `npm run build` | Build 3 process ra `out/` |
| `npm run dist` | Build + đóng gói NSIS installer vào `release/` |
| `npm run typecheck` | Kiểm tra TypeScript (backend + renderer) |
| `npm run db:init` | (dev) Tạo/quản lý DB qua CLI: `npm run db:init -- --fresh --password <pw>` |
| `npm run rebuild:electron` | Build lại `better-sqlite3` theo ABI Electron |

### Biến môi trường (tùy chọn)

Xem `.env.example` — không bắt buộc, đều có mặc định:

- `POSTIE_DB_PATH` — đường dẫn file SQLite (dev mặc định `./postie.db`, packaged `<userData>/postie.db`)
- `BCRYPT_ROUNDS` — chi phí bcrypt (mặc định 10)

## Tài liệu kỹ thuật

- [`docs/kiotviet-roadmap.md`](docs/kiotviet-roadmap.md) — lộ trình đối sánh tính năng KiotViet (P0/P1/P2)
- [`docs/kiotviet-implementation-report.md`](docs/kiotviet-implementation-report.md) — báo cáo triển khai

## License

MIT
