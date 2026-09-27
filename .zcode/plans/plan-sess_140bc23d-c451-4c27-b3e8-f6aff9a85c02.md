# Kế hoạch — Tách kiến trúc Backend / Frontend

## Cấu trúc đích (được bạn chọn)
```
src/
├── backend/                  ← electron/ (git mv, giữ lịch sử git)
│   ├── index.ts              ← main.ts
│   ├── ipc/                  ← ipc.ts (~800 dòng) TÁCH THEO DOMAIN
│   │   ├── index.ts            registerIpc() gọi tất cả
│   │   ├── system.ts           db:needsSetup / initialize / isReady
│   │   ├── users.ts  products.ts (gồm import Excel)  orders.ts
│   │   ├── shifts.ts  customers.ts  payment-methods.ts
│   │   ├── promotions.ts (KM + voucher)  returns.ts
│   │   └── categories.ts  suppliers.ts  purchases.ts
│   │       stocktakes.ts  reports.ts
│   ├── db/                   ← nguyên vẹn (connection.ts + 13 repositories)
│   └── services/
│       └── excel.ts          ← import/excel.ts
├── preload/
│   └── index.ts              ← preload.ts
├── renderer/                 ← NGUYÊN VẸN (alias @renderer giữ nguyên, 0 đụng file frontend)
└── shared/
    └── types.ts              ← nguyên vẹn (single source of truth)

db/schema.sql  ← giữ ở gốc (resolveSchemaPath + extraResources không đổi)
```
Build output KHÔNG đổi: `out/main/index.js`, `out/preload/index.cjs` (entry đặt tên `index.ts` trùng `[name]` cũ) → `package.json`, đường dẫn preload trong window, `npm run dev/dist/db:init` đều không phải sửa.

## Thay đổi import (cơ giới hóa, ~20 file backend)
1. **15 import chéo** `'../../../src/shared/types.js'` (depth 3), `'../src/shared/types.js'` (depth 1), `'../../src/shared/types.js'` (depth 2) → đổi hết thành alias **`@shared/types`** (thêm alias vào `tsconfig.node.json` paths + `resolve.alias` của main & preload trong electron.vite.config)
2. **preload/index.ts**: types từ `@shared/types`; types repo (`ListCustomersOptions` từ customers, `CreateOrderWithPromotionsInput`... từ orders) → `../backend/db/repositories/*.js`
3. **backend/index.ts**: `./ipc.js` → `./ipc/index.js`
4. **renderer** (2 file, import type-only): `lib/api.ts` + `components/reports/reportTypes.ts` trỏ `'electron/preload'` → `'../../preload/index'` / `'../../../preload/index'` (relative giữ nguyên cơ chế như hiện nay)
5. **Xóa** alias chết `@electron`, `@db` (grep xác nhận không dùng)

## Config sửa
- **electron.vite.config.ts**: main.input → `src/backend/index.ts`; preload.input → `src/preload/index.ts`; thêm `@shared` alias cho main+preload; renderer giữ nguyên
- **tsconfig.node.json**: include `src/backend/**` + `src/preload/**` (bỏ `electron/**`); paths `@shared/*`; bỏ @electron/@db
- **tsconfig.json** (renderer): include thu về `src/renderer` + `src/shared` (tránh typecheck nhầm src/backend với DOM lib)
- **package.json**: không đổi (main/build/scripts/extraResources giữ nguyên)

## Tách ipc/ (theo domain)
Mỗi module: `export function registerXxxIpc(): void` chứa đúng khối handlers cũ (cut-paste nguyên vẹn, không đổi logic) + imports riêng. `ipc/index.ts` export `registerIpc()` gọi cả 13 module. Sao lưu không cần — git giữ history qua `git mv`.

## Dọn dẹp
- Xóa thư mục `electron/` rỗng sau move; xóa file rác `electron/import/NUL` (artifact Windows) nếu xóa được
- `docs/`, `idea.txt`, `db/`, `release/` giữ nguyên

## Kiểm chứng
1. `npm run typecheck` (cả 2 config) pass
2. `npx electron-vite build` pass → xác nhận `out/main/index.js` + `out/preload/index.cjs` + `out/renderer/` đúng vị trí cũ
3. Smoke test backend: `npx electron . --migrate` (mở DB thật qua connection mới, áp migration đã có, exit) — xác nhận toàn chuỗi index→ipc→db hoạt động
4. Dọn `out/`; bạn chạy `npm run dev` xác nhận UI + dữ liệu nguyên vẹn