-- ============================================================================
--  Postie POS - Database Initialization Schema (SQLite)
-- ----------------------------------------------------------------------------
--  Design goals:
--    * Minimal memory footprint:
--        - Money stored as INTEGER cents (4 B) instead of REAL (8 B) -> also
--          avoids floating-point rounding errors in accounting.
--        - Roles / booleans stored as small INTEGER codes (1 B) instead of
--          TEXT strings.
--        - Timestamps stored as INTEGER Unix-epoch seconds (4 B) instead of
--          ISO-8601 TEXT (~19 B).
--        - Row IDs use INTEGER PRIMARY KEY (rowid alias) - the cheapest key.
--    * Price snapshot in order_details so historical revenue is immutable
--      even if a product's price changes later.
--    * Tax/discount snapshot per line so past invoices are immutable.
--    * Payment split into order_payments to support split-tender.
--    * Stock is a DERIVED column: it is kept in sync with stock_movements by
--      a trigger, so the two can never diverge. Never UPDATE products.stock
--      directly — INSERT a stock_movements row instead.
--    * Customer balance (credit) is likewise DERIVED from customer_ledger
--      via a trigger, so credit sales are always auditable.
--    * Supplier balance (payable) is DERIVED from supplier_ledger the same
--      way. Variant stock (product_variants.stock) and batch qty
--      (batches.qty) are DERIVED from stock_movements rows that carry
--      variant_id / batch_id. Never UPDATE any of them directly.
--    * WAL + tuned PRAGMAs for fast offline read/write.
--
--  Requires SQLite >= 3.38 (for unixepoch()). All recent Node SQLite
--  bindings (better-sqlite3, node:sqlite) bundle a newer version.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1. Connection / runtime optimizations
--    NOTE: page_size MUST be set before any object is created; journal_mode
--    is persisted in the DB header, so it only needs setting once.
-- ----------------------------------------------------------------------------
PRAGMA page_size     = 4096;        -- 4 KB pages (good default for small OLTP)
PRAGMA journal_mode  = WAL;         -- Write-Ahead Logging: readers never block
PRAGMA synchronous   = NORMAL;      -- Safe with WAL; far faster than FULL
PRAGMA temp_store    = MEMORY;      -- Keep temp tables/B-trees in RAM
PRAGMA cache_size    = -20000;      -- ~20 MB page cache (negative value = KB)
PRAGMA mmap_size     = 268435456;   -- 256 MB memory-mapped I/O for reads
PRAGMA foreign_keys  = ON;          -- Enforce referential integrity
PRAGMA busy_timeout  = 5000;        -- Wait up to 5 s on lock contention


-- ----------------------------------------------------------------------------
-- 2. Tables
--    FK style: all foreign keys are declared INLINE (with ON DELETE actions)
--    for consistency and readability.
-- ----------------------------------------------------------------------------

-- 2.1 users ------------------------------------------------------------------
-- Cashier accounts with role-based access control.
--   role: 0 = admin, 1 = manager, 2 = cashier  (1-byte code, not TEXT)
CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY,
    username      TEXT    NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT    NOT NULL,                               -- bcrypt/argon2
    display_name  TEXT    NOT NULL,                               -- shown on receipts
    role          INTEGER NOT NULL DEFAULT 2
                          CHECK (role IN (0, 1, 2)),
    is_active     INTEGER NOT NULL DEFAULT 1
                          CHECK (is_active IN (0, 1)),
    created_at    INTEGER NOT NULL DEFAULT (unixepoch())          -- Unix seconds
);

-- 2.2 categories -------------------------------------------------------------
-- Product categories. Hierarchical via parent_id (NULL = top-level).
CREATE TABLE IF NOT EXISTS categories (
    id          INTEGER PRIMARY KEY,
    name        TEXT    NOT NULL UNIQUE COLLATE NOCASE,
    parent_id   INTEGER REFERENCES categories (id) ON DELETE SET NULL,
    sort_order  INTEGER NOT NULL DEFAULT 0,
    is_active   INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
    created_at  INTEGER NOT NULL DEFAULT (unixepoch())
);

-- 2.3 taxes ------------------------------------------------------------------
-- Tax rate definitions. rate is in per-mille (1000 = 10%).
CREATE TABLE IF NOT EXISTS taxes (
    id          INTEGER PRIMARY KEY,
    name        TEXT    NOT NULL UNIQUE,                           -- 'VAT 10%'
    rate        INTEGER NOT NULL CHECK (rate >= 0 AND rate <= 10000),
    is_active   INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
    created_at  INTEGER NOT NULL DEFAULT (unixepoch())
);

-- 2.4 customers --------------------------------------------------------------
-- Customers for credit sales. balance is a DERIVED column kept in sync with
-- customer_ledger by a trigger — never UPDATE balance directly; INSERT a
-- customer_ledger row instead. points is retained for future loyalty use
-- (no loyalty feature yet, so it is not audited).
CREATE TABLE IF NOT EXISTS customers (
    id          INTEGER PRIMARY KEY,
    name        TEXT    NOT NULL,
    phone       TEXT,                                              -- lookup key
    email       TEXT,
    address     TEXT,
    tax_code    TEXT,                                              -- MST (buyer info printed on invoices / e-invoice stage 1, P2)
    balance     INTEGER NOT NULL DEFAULT 0,                        -- cents owed (DERIVED)
    points      INTEGER NOT NULL DEFAULT 0,                        -- loyalty (future)
    is_active   INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
    created_at  INTEGER NOT NULL DEFAULT (unixepoch()),
    updated_at  INTEGER NOT NULL DEFAULT (unixepoch())
);

-- 2.5 customer_ledger --------------------------------------------------------
-- Audit trail for every customer balance change. customers.balance is kept
-- in sync by a trigger. Insert a row here to record a credit sale, payment,
-- or manual adjustment — never UPDATE customers.balance directly.
--   type: 0 = sale_credit (customer owes more, amount positive),
--         1 = payment      (customer pays down debt, amount negative),
--         2 = adjustment   (manual correction, signed)
--   amount is signed cents: positive = increases balance (more debt),
--         negative = decreases balance (less debt).
CREATE TABLE IF NOT EXISTS customer_ledger (
    id          INTEGER PRIMARY KEY,
    customer_id INTEGER NOT NULL REFERENCES customers (id) ON DELETE RESTRICT,
    type        INTEGER NOT NULL CHECK (type IN (0, 1, 2)),
    amount      INTEGER NOT NULL,                                 -- signed cents
    order_id    INTEGER REFERENCES orders (id) ON DELETE SET NULL,
    note        TEXT,
    created_at  INTEGER NOT NULL DEFAULT (unixepoch()),
    created_by  INTEGER REFERENCES users (id) ON DELETE SET NULL
);

-- 2.6 suppliers --------------------------------------------------------------
-- Vendors for purchase orders / receiving stock. balance (how much WE owe
-- the supplier) is a DERIVED column kept in sync with supplier_ledger by a
-- trigger — never UPDATE it directly; INSERT a supplier_ledger row instead.
CREATE TABLE IF NOT EXISTS suppliers (
    id          INTEGER PRIMARY KEY,
    name        TEXT    NOT NULL,
    phone       TEXT,
    email       TEXT,
    address     TEXT,
    balance     INTEGER NOT NULL DEFAULT 0,                        -- cents we owe (DERIVED from supplier_ledger)
    is_active   INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
    created_at  INTEGER NOT NULL DEFAULT (unixepoch()),
    updated_at  INTEGER NOT NULL DEFAULT (unixepoch())
);

-- 2.7 products ---------------------------------------------------------------
-- barcode is TEXT because EAN/UPC codes may have leading zeros and some
-- barcodes are non-numeric; price & cost are in cents (INTEGER).
-- barcode is OPTIONAL (NULLable): products without a barcode may leave it
-- NULL. SQLite allows multiple NULLs in a UNIQUE column, so several products
-- can omit the barcode; non-NULL values must still be unique.
-- stock is a DERIVED column kept in sync with stock_movements by a trigger;
-- never UPDATE it directly — INSERT a stock_movements row instead.
CREATE TABLE IF NOT EXISTS products (
    id              INTEGER PRIMARY KEY,
    barcode         TEXT    UNIQUE,
    name            TEXT    NOT NULL,
    type            INTEGER NOT NULL DEFAULT 0
                          CHECK (type IN (0, 1)),                  -- 0 = hàng thường, 1 = combo/đóng gói (P2; thành phần khai ở combo_details)
    category_id     INTEGER REFERENCES categories (id) ON DELETE SET NULL,
    supplier_id     INTEGER REFERENCES suppliers (id) ON DELETE SET NULL,
    price           INTEGER NOT NULL DEFAULT 0 CHECK (price >= 0),    -- selling (cents)
    cost            INTEGER NOT NULL DEFAULT 0 CHECK (cost >= 0),     -- cost (cents)
    tax_id          INTEGER REFERENCES taxes (id) ON DELETE SET NULL,
    unit            TEXT,                                             -- 'pcs','kg','box'
    stock           INTEGER NOT NULL DEFAULT 0,                        -- DERIVED from stock_movements
    low_stock_alert INTEGER NOT NULL DEFAULT 0 CHECK (low_stock_alert >= 0),
    is_active       INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
    created_at      INTEGER NOT NULL DEFAULT (unixepoch()),
    updated_at      INTEGER NOT NULL DEFAULT (unixepoch())
);

-- 2.8 shifts -----------------------------------------------------------------
-- Cashier work sessions / cash drawer reconciliation.
--   status: 0 = open, 1 = closed, 2 = reconciled
--   CHECK: when open, closed_at + expected/counted/difference must be NULL;
--          when closed/reconciled, all of them must be set.
CREATE TABLE IF NOT EXISTS shifts (
    id            INTEGER PRIMARY KEY,
    user_id       INTEGER NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
    opened_at     INTEGER NOT NULL DEFAULT (unixepoch()),
    closed_at     INTEGER,                                        -- NULL = still open
    opening_cash  INTEGER NOT NULL DEFAULT 0,                     -- cents
    expected_cash INTEGER,                                        -- computed on close
    counted_cash  INTEGER,                                        -- actually counted
    difference    INTEGER,                                        -- counted - expected
    status        INTEGER NOT NULL DEFAULT 0
                    CHECK (status IN (0, 1, 2)),
    note          TEXT,
    CHECK (
      (status = 0
         AND closed_at IS NULL
         AND expected_cash IS NULL
         AND counted_cash IS NULL
         AND difference IS NULL)
      OR
      (status IN (1, 2)
         AND closed_at IS NOT NULL
         AND expected_cash IS NOT NULL
         AND counted_cash IS NOT NULL
         AND difference IS NOT NULL)
    )
);

-- 2.9 payment_methods --------------------------------------------------------
-- Configurable tender types. code is a stable uppercase token.
CREATE TABLE IF NOT EXISTS payment_methods (
    id          INTEGER PRIMARY KEY,
    name        TEXT    NOT NULL UNIQUE,                           -- 'Cash'
    code        TEXT    NOT NULL UNIQUE,                           -- 'CASH'
    is_active   INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1))
);

-- 2.10 orders ----------------------------------------------------------------
-- Invoice header. total = subtotal_before_tax + tax_total - discount_amount.
--   status: 0 = pending, 1 = paid, 2 = voided, 3 = refunded, 4 = partial
CREATE TABLE IF NOT EXISTS orders (
    id                  INTEGER PRIMARY KEY,
    invoice_no          INTEGER NOT NULL UNIQUE,                   -- sequential counter
    user_id             INTEGER NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
    customer_id         INTEGER REFERENCES customers (id) ON DELETE SET NULL,
    shift_id            INTEGER REFERENCES shifts (id) ON DELETE SET NULL,
    subtotal_before_tax INTEGER NOT NULL DEFAULT 0 CHECK (subtotal_before_tax >= 0), -- cents
    tax_total           INTEGER NOT NULL DEFAULT 0 CHECK (tax_total >= 0),          -- cents
    discount_amount     INTEGER NOT NULL DEFAULT 0 CHECK (discount_amount >= 0),    -- cents
    total               INTEGER NOT NULL DEFAULT 0 CHECK (total >= 0),              -- cents
    paid_amount         INTEGER NOT NULL DEFAULT 0 CHECK (paid_amount >= 0),        -- cents
    status              INTEGER NOT NULL DEFAULT 1
                          CHECK (status IN (0, 1, 2, 3, 4)),
    held_at             INTEGER,                                   -- NOT NULL = đơn treo (P1). status=0 vẫn giữ nghĩa "chưa trả đủ/bán chịu" — phân biệt bằng held_at
    discount_reason     TEXT,
    note                TEXT,
    e_invoice_no        TEXT,                                      -- số hóa đơn điện tử (P2 giai đoạn 2 — stub, điền khi có NCC HĐĐT)
    created_at          INTEGER NOT NULL DEFAULT (unixepoch())
);

-- 2.11 order_details ---------------------------------------------------------
-- Per-line items. unit_price/tax_rate/tax_amount are SNAPSHOTs at sale time,
-- so past invoices/revenue are never affected by future price/tax changes.
-- product_id stays as a FK (products are soft-deleted via is_active, never
-- hard-deleted, to preserve history).
CREATE TABLE IF NOT EXISTS order_details (
    id               INTEGER PRIMARY KEY,
    order_id         INTEGER NOT NULL REFERENCES orders (id) ON DELETE CASCADE,
    product_id       INTEGER NOT NULL REFERENCES products (id) ON DELETE RESTRICT,
    variant_id       INTEGER REFERENCES product_variants (id) ON DELETE SET NULL, -- P2 variants: dòng bán theo phiên bản (NULL = bán sản phẩm gốc)
    unit_price       INTEGER NOT NULL CHECK (unit_price >= 0),     -- SNAPSHOT (cents)
    cost_cents       INTEGER NOT NULL DEFAULT 0,                   -- SNAPSHOT giá vốn tại thời điểm bán (cents, P1) — chốt lợi nhuận đúng thời điểm
    quantity         INTEGER NOT NULL CHECK (quantity > 0),
    tax_rate         INTEGER NOT NULL DEFAULT 0 CHECK (tax_rate >= 0 AND tax_rate <= 10000), -- per-mille SNAPSHOT
    tax_amount       INTEGER NOT NULL DEFAULT 0 CHECK (tax_amount >= 0),    -- SNAPSHOT (cents)
    discount_amount  INTEGER NOT NULL DEFAULT 0 CHECK (discount_amount >= 0),-- cents
    subtotal         INTEGER NOT NULL CHECK (subtotal >= 0),      -- unit_price*qty - discount (cents)
    note             TEXT
);

-- 2.12 order_payments --------------------------------------------------------
-- Payment lines for an order. Multiple rows = split-tender.
CREATE TABLE IF NOT EXISTS order_payments (
    id                INTEGER PRIMARY KEY,
    order_id          INTEGER NOT NULL REFERENCES orders (id) ON DELETE CASCADE,
    payment_method_id INTEGER NOT NULL REFERENCES payment_methods (id) ON DELETE RESTRICT,
    amount            INTEGER NOT NULL CHECK (amount >= 0),       -- cents
    reference         TEXT,                                       -- card/QR txn id
    created_at        INTEGER NOT NULL DEFAULT (unixepoch())
);

-- 2.13 stock_movements -------------------------------------------------------
-- Audit trail for every stock change. products.stock is kept in sync by a
-- trigger; never UPDATE products.stock directly — INSERT a row here.
--   type: 0 = sale, 1 = return, 2 = purchase, 3 = adjust, 4 = wastage
CREATE TABLE IF NOT EXISTS stock_movements (
    id          INTEGER PRIMARY KEY,
    product_id  INTEGER NOT NULL REFERENCES products (id) ON DELETE RESTRICT,
    type        INTEGER NOT NULL CHECK (type IN (0, 1, 2, 3, 4)),
    delta       INTEGER NOT NULL,                                 -- +/- quantity (sale = negative)
    order_id    INTEGER REFERENCES orders (id) ON DELETE SET NULL,-- set for sale/return
    variant_id  INTEGER REFERENCES product_variants (id) ON DELETE SET NULL, -- P2: movement theo phiên bản (trigger tự cộng variant stock)
    batch_id    INTEGER REFERENCES batches (id) ON DELETE SET NULL,-- P2: movement theo lô/FEFO (trigger tự cộng batch qty)
    note        TEXT,
    created_at  INTEGER NOT NULL DEFAULT (unixepoch()),
    created_by  INTEGER NOT NULL REFERENCES users (id) ON DELETE RESTRICT
);

-- 2.14 returns ---------------------------------------------------------------
-- Customer return header against an existing order.
CREATE TABLE IF NOT EXISTS returns (
    id          INTEGER PRIMARY KEY,
    order_id    INTEGER NOT NULL REFERENCES orders (id) ON DELETE RESTRICT,
    user_id     INTEGER NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
    total       INTEGER NOT NULL CHECK (total >= 0),              -- cents refunded
    reason      TEXT,
    created_at  INTEGER NOT NULL DEFAULT (unixepoch())
);

-- 2.15 return_details --------------------------------------------------------
-- Per-line returned items, referencing original order_details line.
CREATE TABLE IF NOT EXISTS return_details (
    id              INTEGER PRIMARY KEY,
    return_id       INTEGER NOT NULL REFERENCES returns (id) ON DELETE CASCADE,
    order_detail_id INTEGER NOT NULL REFERENCES order_details (id) ON DELETE RESTRICT,
    quantity        INTEGER NOT NULL CHECK (quantity > 0),
    refund_amount   INTEGER NOT NULL CHECK (refund_amount >= 0)   -- cents
);

-- 2.16 audit_log -------------------------------------------------------------
-- Generic audit trail for sensitive mutations (price changes, voids, edits).
CREATE TABLE IF NOT EXISTS audit_log (
    id          INTEGER PRIMARY KEY,
    user_id     INTEGER REFERENCES users (id) ON DELETE SET NULL,
    action      TEXT    NOT NULL,                                 -- 'UPDATE_PRICE','VOID_ORDER'...
    table_name  TEXT    NOT NULL,
    record_id   INTEGER,
    old_values  TEXT,                                             -- JSON
    new_values  TEXT,                                             -- JSON
    created_at  INTEGER NOT NULL DEFAULT (unixepoch())
);

-- 2.17 shift_cash_events -----------------------------------------------------
-- Cash paid in / out of the drawer DURING a shift (P0: full shift close).
--   type: 0 = thu (cash in), 1 = chi (cash out)
-- shiftsRepo.close computes:
--   expected_cash = opening_cash + cash_sales + SUM(thu) - SUM(chi)
-- (roadmap §6.2). Operational sibling of cash_transactions (2.29).
CREATE TABLE IF NOT EXISTS shift_cash_events (
    id         INTEGER PRIMARY KEY,
    shift_id   INTEGER NOT NULL REFERENCES shifts (id) ON DELETE RESTRICT,
    type       INTEGER NOT NULL CHECK (type IN (0, 1)),      -- 0 = thu, 1 = chi
    amount     INTEGER NOT NULL CHECK (amount > 0),          -- cents
    note       TEXT,
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    created_by INTEGER REFERENCES users (id) ON DELETE SET NULL
);

-- 2.18 purchase_orders -------------------------------------------------------
-- Purchase order header (P1: nhập hàng; P2: đặt hàng nhập with status 0).
--   status: 0 = chờ giao (awaiting delivery), 1 = đã nhập (received),
--           2 = đã hủy (cancelled — hủy phiếu dùng status, không DELETE, §6.1)
-- Receiving (status 0 -> 1) must, in ONE transaction: INSERT stock_movements
-- type=2 per line, UPDATE products.cost from the line cost, and INSERT a
-- supplier_ledger row for any unpaid remainder.
CREATE TABLE IF NOT EXISTS purchase_orders (
    id          INTEGER PRIMARY KEY,
    supplier_id INTEGER NOT NULL REFERENCES suppliers (id) ON DELETE RESTRICT,
    status      INTEGER NOT NULL DEFAULT 0 CHECK (status IN (0, 1, 2)),
    total       INTEGER NOT NULL DEFAULT 0 CHECK (total >= 0),   -- cents
    paid        INTEGER NOT NULL DEFAULT 0 CHECK (paid >= 0),    -- cents paid to supplier
    note        TEXT,
    created_at  INTEGER NOT NULL DEFAULT (unixepoch()),
    created_by  INTEGER REFERENCES users (id) ON DELETE RESTRICT
);

-- 2.19 purchase_order_details ------------------------------------------------
-- Purchase order lines. cost is the supplier unit price in cents; on receive
-- it becomes both the snapshot for stock valuation and products.cost.
CREATE TABLE IF NOT EXISTS purchase_order_details (
    id         INTEGER PRIMARY KEY,
    po_id      INTEGER NOT NULL REFERENCES purchase_orders (id) ON DELETE CASCADE,
    product_id INTEGER NOT NULL REFERENCES products (id) ON DELETE RESTRICT,
    qty        INTEGER NOT NULL CHECK (qty > 0),
    cost       INTEGER NOT NULL CHECK (cost >= 0)               -- cents, updates products.cost khi nhập
);

-- 2.20 supplier_ledger -------------------------------------------------------
-- Audit trail for every supplier balance change. suppliers.balance is kept
-- in sync by trg_supplier_ledger_after_insert (mirror of the customer one).
--   type: 0 = purchase_debt (we owe more, amount positive),
--         1 = payment      (we pay the supplier, amount negative),
--         2 = adjustment   (manual correction, signed)
--   amount is signed cents: positive = increases balance (owe more),
--         negative = decreases balance.
CREATE TABLE IF NOT EXISTS supplier_ledger (
    id          INTEGER PRIMARY KEY,
    supplier_id INTEGER NOT NULL REFERENCES suppliers (id) ON DELETE RESTRICT,
    type        INTEGER NOT NULL CHECK (type IN (0, 1, 2)),
    amount      INTEGER NOT NULL,                                -- signed cents
    po_id       INTEGER REFERENCES purchase_orders (id) ON DELETE SET NULL,
    note        TEXT,
    created_at  INTEGER NOT NULL DEFAULT (unixepoch()),
    created_by  INTEGER REFERENCES users (id) ON DELETE RESTRICT
);

-- 2.21 stocktakes ------------------------------------------------------------
-- Stock count sheet (P1 kiểm kho). status: 0 = đang kiểm, 1 = hoàn thành,
-- 2 = đã hủy (hủy phiếu dùng status, không DELETE — §6.1).
-- Nothing touches stock while the sheet is open; "Hoàn thành" inserts ONE
-- stock_movements row per detail line (type=3, delta = counted - book, may be
-- negative) inside a single transaction.
CREATE TABLE IF NOT EXISTS stocktakes (
    id         INTEGER PRIMARY KEY,
    status     INTEGER NOT NULL DEFAULT 0 CHECK (status IN (0, 1, 2)),
    note       TEXT,
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    created_by INTEGER REFERENCES users (id) ON DELETE RESTRICT
);

-- 2.22 stocktake_details -----------------------------------------------------
-- One row per counted product. book_qty is the derived products.stock value
-- snapshotted when the line is added; counted_qty is what was actually
-- counted (barcode scanning). UNIQUE per sheet — rescan upserts the line.
CREATE TABLE IF NOT EXISTS stocktake_details (
    id           INTEGER PRIMARY KEY,
    stocktake_id INTEGER NOT NULL REFERENCES stocktakes (id) ON DELETE CASCADE,
    product_id   INTEGER NOT NULL REFERENCES products (id) ON DELETE RESTRICT,
    book_qty     INTEGER NOT NULL,   -- tồn số sách tại thời điểm mở phiếu
    counted_qty  INTEGER NOT NULL,   -- số đếm thực tế (quét mã liên tục)
    UNIQUE (stocktake_id, product_id)
);

-- 2.23 promotions ------------------------------------------------------------
-- Promotion rules (P2 engine, applied in orders.create before totals).
--   type: 0 = giảm % toàn đơn, 1 = giảm số tiền cố định toàn đơn,
--         2 = giảm % theo dòng, 3 = giảm số tiền cố định theo dòng
--   value semantics depend on type: percent types (0, 2) -> per-mille
--   (0..10000, same unit as taxes.rate); amount types (1, 3) -> cents.
--   scope_json: JSON filter the engine interprets, e.g.
--   {"category_ids":[..],"product_ids":[..],"min_order_cents":N,"customer_ids":[..]}
--   NULL = áp dụng cho tất cả. NULL start_at = hiệu lực ngay, NULL end_at = không hết hạn.
CREATE TABLE IF NOT EXISTS promotions (
    id         INTEGER PRIMARY KEY,
    name       TEXT    NOT NULL,
    type       INTEGER NOT NULL CHECK (type IN (0, 1, 2, 3)),
    value      INTEGER NOT NULL CHECK (value > 0 AND (type NOT IN (0, 2) OR value <= 10000)),
    scope_json TEXT,
    start_at   INTEGER,
    end_at     INTEGER,
    is_active  INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

-- 2.24 vouchers --------------------------------------------------------------
-- Single-use discount codes entered at payment (P2). used_order_id/used_at
-- mark redemption; void/refund releases the voucher by NULLing used_order_id.
CREATE TABLE IF NOT EXISTS vouchers (
    id            INTEGER PRIMARY KEY,
    code          TEXT    NOT NULL UNIQUE COLLATE NOCASE,
    value_cents   INTEGER NOT NULL CHECK (value_cents > 0),
    expires_at    INTEGER,                       -- NULL = không hết hạn
    used_order_id INTEGER REFERENCES orders (id) ON DELETE SET NULL,
    used_at       INTEGER,
    is_active     INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
    created_at    INTEGER NOT NULL DEFAULT (unixepoch())
);

-- 2.25 combo_details ---------------------------------------------------------
-- Components of a combo/bundle product (products.type = 1, P2). When selling
-- a combo, orders.create must INSERT one stock_movements row PER COMPONENT
-- (negative delta) instead of for the combo line itself; combo cost =
-- SUM(component.cost * qty). Reusable later as the recipe/BOM structure.
CREATE TABLE IF NOT EXISTS combo_details (
    id                   INTEGER PRIMARY KEY,
    combo_product_id     INTEGER NOT NULL REFERENCES products (id) ON DELETE CASCADE,
    component_product_id INTEGER NOT NULL REFERENCES products (id) ON DELETE RESTRICT,
    qty                  INTEGER NOT NULL CHECK (qty > 0),
    UNIQUE (combo_product_id, component_product_id)
);

-- 2.26 product_variants ------------------------------------------------------
-- Variant SKUs (color/size..., P2 — kích hoạt khi bán thời trang/giày dép).
-- stock is a DERIVED column kept in sync with stock_movements rows that
-- carry variant_id (trg_variant_stock_after_insert) — never UPDATE directly.
-- A movement carrying variant_id updates BOTH the variant stock and the
-- parent products.stock (product total = SUM of its variants), provided all
-- variant sales/receives always pass variant_id. barcode is UNIQUE so
-- scanning resolves straight to the variant; multiple NULLs allowed.
CREATE TABLE IF NOT EXISTS product_variants (
    id              INTEGER PRIMARY KEY,
    product_id      INTEGER NOT NULL REFERENCES products (id) ON DELETE CASCADE,
    attributes_json TEXT    NOT NULL DEFAULT '{}',               -- {"color":"Đỏ","size":"M"}
    price_cents     INTEGER NOT NULL DEFAULT 0 CHECK (price_cents >= 0),
    cost_cents      INTEGER NOT NULL DEFAULT 0 CHECK (cost_cents >= 0),
    barcode         TEXT    UNIQUE,
    stock           INTEGER NOT NULL DEFAULT 0,                  -- DERIVED (see trigger)
    is_active       INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
    created_at      INTEGER NOT NULL DEFAULT (unixepoch()),
    updated_at      INTEGER NOT NULL DEFAULT (unixepoch())
);

-- 2.27 product_units ---------------------------------------------------------
-- Alternate units of measure with conversion to the product base unit
-- (P2: 1 lốc = 4 chai -> factor 4, 1 thùng = 20 lốc -> factor 20). Buy/sell
-- in the bigger unit, stock stays in the base unit.
CREATE TABLE IF NOT EXISTS product_units (
    id         INTEGER PRIMARY KEY,
    product_id INTEGER NOT NULL REFERENCES products (id) ON DELETE CASCADE,
    name       TEXT    NOT NULL,                                -- 'lốc', 'thùng'
    factor     INTEGER NOT NULL CHECK (factor > 0),
    UNIQUE (product_id, name)
);

-- 2.28 batches ---------------------------------------------------------------
-- Lot / expiry-date tracking (P2 FEFO — tạp hóa, nhà thuốc). qty is a
-- DERIVED column kept in sync with stock_movements rows that carry batch_id
-- (trg_batch_stock_after_insert) — never UPDATE directly. expiry_date is
-- unix seconds at 00:00 of the expiry day; NULL = lô không theo dõi hạn.
CREATE TABLE IF NOT EXISTS batches (
    id          INTEGER PRIMARY KEY,
    product_id  INTEGER NOT NULL REFERENCES products (id) ON DELETE CASCADE,
    lot_no      TEXT    NOT NULL,
    expiry_date INTEGER,
    qty         INTEGER NOT NULL DEFAULT 0,                      -- DERIVED (see trigger)
    cost_cents  INTEGER NOT NULL DEFAULT 0 CHECK (cost_cents >= 0),
    is_active   INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
    created_at  INTEGER NOT NULL DEFAULT (unixepoch()),
    UNIQUE (product_id, lot_no)
);

-- 2.29 cash_transactions -----------------------------------------------------
-- Generic cash in/out for the TT152-lite accounting export (P2). Unlike
-- shift_cash_events (operational, feeds expected_cash), rows here carry a
-- `category` for the revenue-vs-expense CSV export; the UI may write both in
-- one action. shift_id NULL = giao dịch ngoài ca.
--   type: 0 = thu, 1 = chi
CREATE TABLE IF NOT EXISTS cash_transactions (
    id           INTEGER PRIMARY KEY,
    shift_id     INTEGER REFERENCES shifts (id) ON DELETE SET NULL,
    type         INTEGER NOT NULL CHECK (type IN (0, 1)),
    amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
    category     TEXT,                     -- 'purchase','salary','rent','other',...
    note         TEXT,
    created_at   INTEGER NOT NULL DEFAULT (unixepoch()),
    created_by   INTEGER REFERENCES users (id) ON DELETE SET NULL
);

-- 2.30 app_settings ----------------------------------------------------------
-- Key-value store for store-level configuration that has no table of its
-- own: header info printed on 80mm receipts (P0) and the household-business
-- name / MST / address for e-invoice stage 1 (P2), plus print template
-- options. Values are TEXT (JSON where structured).
CREATE TABLE IF NOT EXISTS app_settings (
    key        TEXT    PRIMARY KEY,
    value      TEXT    NOT NULL,
    updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);


-- ----------------------------------------------------------------------------
-- 3. Indexes
--    (barcode, invoice_no, categories.name, taxes.name, payment_methods.code
--     are already auto-indexed by UNIQUE constraints)
-- ----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_categories_parent       ON categories      (parent_id);
CREATE INDEX IF NOT EXISTS idx_products_category       ON products        (category_id);
CREATE INDEX IF NOT EXISTS idx_products_supplier       ON products        (supplier_id);
CREATE INDEX IF NOT EXISTS idx_products_tax            ON products        (tax_id);
CREATE INDEX IF NOT EXISTS idx_products_name           ON products        (name);
CREATE INDEX IF NOT EXISTS idx_orders_user             ON orders          (user_id);
CREATE INDEX IF NOT EXISTS idx_orders_customer         ON orders          (customer_id);
CREATE INDEX IF NOT EXISTS idx_orders_shift            ON orders          (shift_id);
CREATE INDEX IF NOT EXISTS idx_orders_status           ON orders          (status);
CREATE INDEX IF NOT EXISTS idx_orders_created          ON orders          (created_at);
-- Composite for "recent orders" listings: ORDER BY created_at DESC, id DESC
-- becomes an ordered index scan instead of a sort.
CREATE INDEX IF NOT EXISTS idx_orders_created_id       ON orders          (created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_order_details_order     ON order_details   (order_id);
CREATE INDEX IF NOT EXISTS idx_order_details_product   ON order_details   (product_id);
CREATE INDEX IF NOT EXISTS idx_order_payments_order    ON order_payments  (order_id);
CREATE INDEX IF NOT EXISTS idx_order_payments_method   ON order_payments  (payment_method_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_product ON stock_movements (product_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_order   ON stock_movements (order_id);
-- Composite for per-customer ledger listing (newest first) and per-product
-- stock history. Mirrored in connection.ts migration v1 for existing DBs.
CREATE INDEX IF NOT EXISTS idx_stock_movements_prod_time ON stock_movements (product_id, created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_customer_ledger_customer ON customer_ledger (customer_id);
CREATE INDEX IF NOT EXISTS idx_customer_ledger_order    ON customer_ledger (order_id);
CREATE INDEX IF NOT EXISTS idx_customer_ledger_cust_time ON customer_ledger (customer_id, created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_returns_order           ON returns         (order_id);
CREATE INDEX IF NOT EXISTS idx_return_details_return   ON return_details  (return_id);
CREATE INDEX IF NOT EXISTS idx_customers_phone         ON customers       (phone);
CREATE INDEX IF NOT EXISTS idx_audit_log_user          ON audit_log       (user_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_table         ON audit_log       (table_name, record_id);
CREATE INDEX IF NOT EXISTS idx_shifts_user             ON shifts          (user_id);
CREATE INDEX IF NOT EXISTS idx_shifts_status           ON shifts          (status);

-- Indexes for the P0/P1/P2 additions (roadmap §6).
-- NOTE: deliberately NO index on orders.held_at here — it would break
-- re-running this file over an existing DB whose orders table predates the
-- held_at column (dev `--init-db` without --fresh re-executes this file).
-- That index belongs to the connection.ts migration that adds held_at
-- (CREATE INDEX ... ON orders (held_at) WHERE held_at IS NOT NULL), since
-- migrations run on BOTH fresh and existing installs.
CREATE INDEX IF NOT EXISTS idx_shift_cash_events_shift  ON shift_cash_events      (shift_id);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_supplier ON purchase_orders        (supplier_id);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_status   ON purchase_orders        (status);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_created  ON purchase_orders        (created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_po_details_po            ON purchase_order_details (po_id);
CREATE INDEX IF NOT EXISTS idx_po_details_product       ON purchase_order_details (product_id);
CREATE INDEX IF NOT EXISTS idx_supplier_ledger_supplier   ON supplier_ledger      (supplier_id);
CREATE INDEX IF NOT EXISTS idx_supplier_ledger_po         ON supplier_ledger      (po_id);
CREATE INDEX IF NOT EXISTS idx_supplier_ledger_supp_time  ON supplier_ledger      (supplier_id, created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_stocktakes_status        ON stocktakes             (status);
CREATE INDEX IF NOT EXISTS idx_stocktake_details_st     ON stocktake_details      (stocktake_id);
CREATE INDEX IF NOT EXISTS idx_stocktake_details_prod   ON stocktake_details      (product_id);
CREATE INDEX IF NOT EXISTS idx_promotions_active        ON promotions             (is_active, start_at, end_at);
CREATE INDEX IF NOT EXISTS idx_vouchers_used_order      ON vouchers               (used_order_id);
CREATE INDEX IF NOT EXISTS idx_combo_details_combo      ON combo_details          (combo_product_id);
CREATE INDEX IF NOT EXISTS idx_combo_details_component  ON combo_details          (component_product_id);
CREATE INDEX IF NOT EXISTS idx_product_variants_product ON product_variants       (product_id);
CREATE INDEX IF NOT EXISTS idx_product_units_product    ON product_units          (product_id);
CREATE INDEX IF NOT EXISTS idx_batches_product          ON batches                (product_id);
CREATE INDEX IF NOT EXISTS idx_batches_expiry           ON batches                (expiry_date);
CREATE INDEX IF NOT EXISTS idx_cash_transactions_shift  ON cash_transactions      (shift_id);
CREATE INDEX IF NOT EXISTS idx_cash_transactions_created ON cash_transactions    (created_at);
-- NOTE: same rule as idx_orders_held above — the variant/batch lookup indexes
-- on stock_movements (variant_id, batch_id) are created by the connection.ts
-- migration that adds those columns, NOT here, so this file can still be
-- re-executed over an existing older DB (dev `--init-db` without --fresh).


-- ----------------------------------------------------------------------------
-- 4. Triggers — keep derived columns in sync
-- ----------------------------------------------------------------------------
-- 4.1 products.stock  ←  stock_movements
--     Any INSERT into stock_movements adjusts products.stock automatically,
--     so the two can never diverge. The application never UPDATEs stock.
CREATE TRIGGER IF NOT EXISTS trg_stock_after_insert
AFTER INSERT ON stock_movements
BEGIN
  UPDATE products
     SET stock = stock + NEW.delta,
         updated_at = unixepoch()
   WHERE id = NEW.product_id;
END;

-- 4.2 customers.balance  ←  customer_ledger
--     Any INSERT into customer_ledger adjusts customers.balance, and bumps
--     updated_at. The application never UPDATEs balance directly.
CREATE TRIGGER IF NOT EXISTS trg_ledger_after_insert
AFTER INSERT ON customer_ledger
BEGIN
  UPDATE customers
     SET balance = balance + NEW.amount,
         updated_at = unixepoch()
   WHERE id = NEW.customer_id;
END;

-- 4.3 suppliers.balance  ←  supplier_ledger
--     Mirror of 4.2: payable to the supplier is always auditable; the
--     application never UPDATEs suppliers.balance directly.
CREATE TRIGGER IF NOT EXISTS trg_supplier_ledger_after_insert
AFTER INSERT ON supplier_ledger
BEGIN
  UPDATE suppliers
     SET balance = balance + NEW.amount,
         updated_at = unixepoch()
   WHERE id = NEW.supplier_id;
END;

-- 4.4 product_variants.stock  ←  stock_movements (rows carrying variant_id)
--     Fires in ADDITION to 4.1, so one movement with variant_id updates both
--     the variant stock and the parent products.stock total. The application
--     never UPDATEs product_variants.stock directly.
CREATE TRIGGER IF NOT EXISTS trg_variant_stock_after_insert
AFTER INSERT ON stock_movements
WHEN NEW.variant_id IS NOT NULL
BEGIN
  UPDATE product_variants
     SET stock = stock + NEW.delta,
         updated_at = unixepoch()
   WHERE id = NEW.variant_id;
END;

-- 4.5 batches.qty  ←  stock_movements (rows carrying batch_id)
--     Lot-level qty stays in sync the same way; the application never
--     UPDATEs batches.qty directly. Receives INSERT a positive-delta row per
--     lot; sales pick the FEFO lot and INSERT a negative-delta row per lot.
CREATE TRIGGER IF NOT EXISTS trg_batch_stock_after_insert
AFTER INSERT ON stock_movements
WHEN NEW.batch_id IS NOT NULL
BEGIN
  UPDATE batches
     SET qty = qty + NEW.delta
   WHERE id = NEW.batch_id;
END;


-- ----------------------------------------------------------------------------
-- 5. Seed data
-- ----------------------------------------------------------------------------

-- 5.1 Default admin
--     NOTE: The admin user is NOT seeded here because a placeholder bcrypt
--     hash cannot be used to log in. It is created at init time by
--     `db/init.ts`, which prompts for a real password and stores a proper
--     bcrypt hash. See the header of `db/init.ts` for details.

-- 5.2 Default payment methods
INSERT OR IGNORE INTO payment_methods (name, code) VALUES ('Cash', 'CASH');
INSERT OR IGNORE INTO payment_methods (name, code) VALUES ('Card', 'CARD');
INSERT OR IGNORE INTO payment_methods (name, code) VALUES ('QR Code', 'QR');

-- 5.3 Default tax rates (Vietnam VAT)
INSERT OR IGNORE INTO taxes (name, rate) VALUES ('VAT 10%', 1000);
INSERT OR IGNORE INTO taxes (name, rate) VALUES ('VAT 8%',  800);
INSERT OR IGNORE INTO taxes (name, rate) VALUES ('No Tax',   0);
