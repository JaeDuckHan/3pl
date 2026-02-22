SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS=0;

-- 1) clients (id=101)
INSERT INTO clients (id, client_code, name_kr, status, created_at, updated_at, deleted_at)
VALUES (101, 'C101', 'Client 101', 'active', NOW(), NOW(), NULL)
ON DUPLICATE KEY UPDATE name_kr=VALUES(name_kr), status='active', deleted_at=NULL, updated_at=NOW();

-- 2) warehouses (id=201)  *주의: name 컬럼 필수
INSERT INTO warehouses (id, code, name, country, timezone, status, created_at, updated_at, deleted_at)
VALUES (201, 'WH201', 'Warehouse 201', 'TH', 'Asia/Bangkok', 'active', NOW(), NOW(), NULL)
ON DUPLICATE KEY UPDATE name=VALUES(name), status='active', deleted_at=NULL, updated_at=NOW();

-- 3) warehouse_locations (id=301, warehouse_id=201)
INSERT INTO warehouse_locations (id, warehouse_id, location_code, zone, status, created_at, updated_at, deleted_at)
VALUES (301, 201, 'LOC-301', 'Z1', 'active', NOW(), NOW(), NULL)
ON DUPLICATE KEY UPDATE warehouse_id=VALUES(warehouse_id), status='active', deleted_at=NULL, updated_at=NOW();

-- 4) users (1002,1003)
INSERT INTO users (id, client_id, email, password_hash, name, role, status, created_at, updated_at, deleted_at)
VALUES
 (1002, 101, 'manager101@example.com', 'x', 'Manager101', 'manager', 'active', NOW(), NOW(), NULL),
 (1003, NULL, 'admin@example.com', 'x', 'Admin', 'admin', 'active', NOW(), NOW(), NULL)
ON DUPLICATE KEY UPDATE name=VALUES(name), status='active', deleted_at=NULL, updated_at=NOW();

-- 5) products (401) *주의: barcode_raw, barcode_full NOT NULL
INSERT INTO products (id, client_id, sku_code, barcode_raw, barcode_full, name_kr, status, created_at, updated_at, deleted_at)
VALUES (401, 101, 'SKU-401', 'RAW401', 'FULL401', 'Product 401', 'active', NOW(), NOW(), NULL)
ON DUPLICATE KEY UPDATE name_kr=VALUES(name_kr), status='active', deleted_at=NULL, updated_at=NOW();

-- 6) product_lots (501)
INSERT INTO product_lots (id, product_id, lot_no, expiry_date, status, created_at, updated_at, deleted_at)
VALUES (501, 401, 'LOT-501', '2027-12-31', 'active', NOW(), NOW(), NULL)
ON DUPLICATE KEY UPDATE expiry_date=VALUES(expiry_date), status='active', deleted_at=NULL, updated_at=NOW();

-- 7) exchange_rates (id=801) : settlement_batches가 참조함
-- tc_008_setup에서 8008(2026-02-14)을 넣으니, 801은 날짜를 다르게 해서 유니크 충돌 방지
INSERT INTO exchange_rates (id, base_currency, quote_currency, rate, rate_date, status, entered_by, created_at, updated_at, deleted_at)
VALUES (801, 'THB', 'KRW', 38.500000, '2026-02-01', 'draft', 1003, NOW(), NOW(), NULL)
ON DUPLICATE KEY UPDATE rate=VALUES(rate), status='draft', deleted_at=NULL, updated_at=NOW();

-- 8) files (9008) : uploaded_by=1003
INSERT INTO files (id, file_key, file_name, mime_type, size_bytes, uploaded_by, created_at, updated_at, deleted_at)
VALUES (9008, 'fx/20260214.png', 'fx_20260214.png', 'image/png', 12345, 1003, NOW(), NOW(), NULL)
ON DUPLICATE KEY UPDATE file_name=VALUES(file_name), deleted_at=NULL, updated_at=NOW();

SET FOREIGN_KEY_CHECKS=1;
