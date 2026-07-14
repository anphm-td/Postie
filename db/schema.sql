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
-- Vendors for purchase orders / receiving stock.
CREATE TABLE IF NOT EXISTS suppliers (
    id          INTEGER PRIMARY KEY,
    name        TEXT    NOT NULL,
    phone       TEXT,
    email       TEXT,
    address     TEXT,
    is_active   INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
    created_at  INTEGER NOT NULL DEFAULT (unixepoch())
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
    discount_reason     TEXT,
    note                TEXT,
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
    unit_price       INTEGER NOT NULL CHECK (unit_price >= 0),     -- SNAPSHOT (cents)
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
CREATE INDEX IF NOT EXISTS idx_order_details_order     ON order_details   (order_id);
CREATE INDEX IF NOT EXISTS idx_order_details_product   ON order_details   (product_id);
CREATE INDEX IF NOT EXISTS idx_order_payments_order    ON order_payments  (order_id);
CREATE INDEX IF NOT EXISTS idx_order_payments_method   ON order_payments  (payment_method_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_product ON stock_movements (product_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_order   ON stock_movements (order_id);
CREATE INDEX IF NOT EXISTS idx_customer_ledger_customer ON customer_ledger (customer_id);
CREATE INDEX IF NOT EXISTS idx_customer_ledger_order    ON customer_ledger (order_id);
CREATE INDEX IF NOT EXISTS idx_returns_order           ON returns         (order_id);
CREATE INDEX IF NOT EXISTS idx_return_details_return   ON return_details  (return_id);
CREATE INDEX IF NOT EXISTS idx_customers_phone         ON customers       (phone);
CREATE INDEX IF NOT EXISTS idx_audit_log_user          ON audit_log       (user_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_table         ON audit_log       (table_name, record_id);
CREATE INDEX IF NOT EXISTS idx_shifts_user             ON shifts          (user_id);
CREATE INDEX IF NOT EXISTS idx_shifts_status           ON shifts          (status);


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
