SET NAMES utf8mb4;

START TRANSACTION;

INSERT INTO clients (client_code, name_kr, name_en, contact_name, phone, email, address, status)
VALUES
  ('CL-DEMO-001', 'Demo Client KR', 'Demo Client', 'Demo Owner', '010-0000-0001', 'demo.client@example.com', 'Seoul', 'active')
ON DUPLICATE KEY UPDATE
  name_kr = VALUES(name_kr),
  name_en = VALUES(name_en),
  contact_name = VALUES(contact_name),
  phone = VALUES(phone),
  email = VALUES(email),
  address = VALUES(address),
  status = VALUES(status),
  deleted_at = NULL;

INSERT INTO warehouses (code, name, country, timezone, status)
VALUES
  ('WH-DEMO-001', 'Demo Warehouse', 'TH', 'Asia/Bangkok', 'active')
ON DUPLICATE KEY UPDATE
  name = VALUES(name),
  country = VALUES(country),
  timezone = VALUES(timezone),
  status = VALUES(status),
  deleted_at = NULL;

INSERT INTO users (client_id, email, password_hash, name, role, status)
SELECT
  c.id,
  'admin.demo@example.com',
  '1234',
  'Demo Admin',
  'admin',
  'active'
FROM clients c
WHERE c.client_code = 'CL-DEMO-001'
ON DUPLICATE KEY UPDATE
  client_id = VALUES(client_id),
  name = VALUES(name),
  role = VALUES(role),
  status = VALUES(status),
  deleted_at = NULL;

INSERT INTO products (client_id, sku_code, barcode_raw, barcode_full, name_kr, name_en, volume_ml, unit, status)
SELECT
  c.id,
  'SKU-DEMO-001',
  '880000000001',
  '880000000001-TH',
  'Demo Product KR',
  'Demo Product',
  500,
  'EA',
  'active'
FROM clients c
WHERE c.client_code = 'CL-DEMO-001'
ON DUPLICATE KEY UPDATE
  sku_code = VALUES(sku_code),
  name_kr = VALUES(name_kr),
  name_en = VALUES(name_en),
  volume_ml = VALUES(volume_ml),
  unit = VALUES(unit),
  status = VALUES(status),
  deleted_at = NULL;

INSERT INTO warehouse_locations (warehouse_id, location_code, zone, status)
SELECT
  w.id,
  'A-01-01',
  'A',
  'active'
FROM warehouses w
WHERE w.code = 'WH-DEMO-001'
ON DUPLICATE KEY UPDATE
  zone = VALUES(zone),
  status = VALUES(status),
  deleted_at = NULL;

INSERT INTO product_lots (product_id, lot_no, expiry_date, mfg_date, status)
SELECT
  p.id,
  'LOT-DEMO-001',
  DATE_ADD(CURDATE(), INTERVAL 365 DAY),
  CURDATE(),
  'active'
FROM products p
JOIN clients c ON c.id = p.client_id
WHERE c.client_code = 'CL-DEMO-001'
  AND p.barcode_full = '880000000001-TH'
ON DUPLICATE KEY UPDATE
  expiry_date = VALUES(expiry_date),
  mfg_date = VALUES(mfg_date),
  status = VALUES(status),
  deleted_at = NULL;

INSERT INTO service_catalog (service_code, service_name_kr, billing_basis, default_currency, status)
VALUES
  ('OUTBOUND_SHIP', 'Outbound Shipping', 'QTY', 'THB', 'active')
ON DUPLICATE KEY UPDATE
  service_name_kr = VALUES(service_name_kr),
  billing_basis = VALUES(billing_basis),
  default_currency = VALUES(default_currency),
  status = VALUES(status),
  deleted_at = NULL;

INSERT INTO price_policies (client_id, service_id, unit_price, currency, effective_from, effective_to, status)
SELECT
  c.id,
  s.id,
  2.5000,
  'THB',
  CURDATE(),
  NULL,
  'active'
FROM clients c
JOIN service_catalog s ON s.service_code = 'OUTBOUND_SHIP'
WHERE c.client_code = 'CL-DEMO-001'
ON DUPLICATE KEY UPDATE
  unit_price = VALUES(unit_price),
  currency = VALUES(currency),
  effective_to = VALUES(effective_to),
  status = VALUES(status),
  deleted_at = NULL;

INSERT INTO exchange_rates (base_currency, quote_currency, rate, rate_date, status, entered_by, activated_by, activated_at)
VALUES
  ('THB', 'KRW', 40.000000, CURDATE(), 'active', 1004, 1004, NOW())
ON DUPLICATE KEY UPDATE
  rate = VALUES(rate),
  status = VALUES(status),
  activated_by = VALUES(activated_by),
  activated_at = VALUES(activated_at),
  deleted_at = NULL;

COMMIT;
