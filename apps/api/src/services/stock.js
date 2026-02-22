const { getPool } = require("../db");

class StockError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

async function withTransaction(work) {
  const conn = await getPool().getConnection();
  try {
    await conn.beginTransaction();
    const result = await work(conn);
    await conn.commit();
    return result;
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
}

async function getInboundOrderContext(conn, inboundOrderId) {
  const [rows] = await conn.query(
    `SELECT id, client_id, warehouse_id, created_by
     FROM inbound_orders
     WHERE id = ? AND deleted_at IS NULL`,
    [inboundOrderId]
  );
  return rows[0] || null;
}

async function getOutboundOrderContext(conn, outboundOrderId) {
  const [rows] = await conn.query(
    `SELECT id, client_id, warehouse_id, order_date, created_by
     FROM outbound_orders
     WHERE id = ? AND deleted_at IS NULL`,
    [outboundOrderId]
  );
  return rows[0] || null;
}

async function getReturnOrderContext(conn, returnOrderId) {
  const [rows] = await conn.query(
    `SELECT id, client_id, warehouse_id, created_by
     FROM return_orders
     WHERE id = ? AND deleted_at IS NULL`,
    [returnOrderId]
  );
  return rows[0] || null;
}

async function adjustAvailableQty(conn, key, delta) {
  const { clientId, productId, lotId, warehouseId, locationId } = key;
  const [rows] = await conn.query(
    `SELECT id, available_qty
     FROM stock_balances
     WHERE client_id = ?
       AND product_id = ?
       AND lot_id = ?
       AND warehouse_id = ?
       AND location_id <=> ?
       AND deleted_at IS NULL
     FOR UPDATE`,
    [clientId, productId, lotId, warehouseId, locationId]
  );

  if (rows.length === 0) {
    if (delta < 0) {
      throw new StockError("INSUFFICIENT_STOCK", "Insufficient stock");
    }
    await conn.query(
      `INSERT INTO stock_balances
        (client_id, product_id, lot_id, warehouse_id, location_id, available_qty, reserved_qty)
       VALUES (?, ?, ?, ?, ?, ?, 0)`,
      [clientId, productId, lotId, warehouseId, locationId, delta]
    );
    return;
  }

  const nextQty = Number(rows[0].available_qty) + Number(delta);
  if (nextQty < 0) {
    throw new StockError("INSUFFICIENT_STOCK", "Insufficient stock");
  }

  await conn.query(
    "UPDATE stock_balances SET available_qty = ? WHERE id = ?",
    [nextQty, rows[0].id]
  );
}

async function upsertStockTxn(conn, payload) {
  const {
    clientId,
    productId,
    lotId,
    warehouseId,
    locationId,
    txnType,
    qtyIn,
    qtyOut,
    refType,
    refId,
    createdBy,
    note
  } = payload;

  const [existing] = await conn.query(
    `SELECT id
     FROM stock_transactions
     WHERE txn_type = ? AND ref_type = ? AND ref_id = ?
     LIMIT 1`,
    [txnType, refType, refId]
  );

  if (existing.length === 0) {
    const [result] = await conn.query(
      `INSERT INTO stock_transactions
        (client_id, product_id, lot_id, warehouse_id, location_id, from_location_id, to_location_id, txn_type, txn_date, qty_in, qty_out, ref_type, ref_id, note, created_by)
       VALUES (?, ?, ?, ?, ?, NULL, NULL, ?, NOW(), ?, ?, ?, ?, ?, ?)`,
      [
        clientId,
        productId,
        lotId,
        warehouseId,
        locationId,
        txnType,
        qtyIn,
        qtyOut,
        refType,
        refId,
        note || null,
        createdBy
      ]
    );
    return result.insertId;
  }

  await conn.query(
    `UPDATE stock_transactions
     SET client_id = ?, product_id = ?, lot_id = ?, warehouse_id = ?, location_id = ?,
         qty_in = ?, qty_out = ?, note = ?, created_by = ?, txn_date = NOW(), deleted_at = NULL
     WHERE id = ?`,
    [
      clientId,
      productId,
      lotId,
      warehouseId,
      locationId,
      qtyIn,
      qtyOut,
      note || null,
      createdBy,
      existing[0].id
    ]
  );
  return existing[0].id;
}

async function getStockTxnId(conn, txnType, refType, refId) {
  const [rows] = await conn.query(
    `SELECT id
     FROM stock_transactions
     WHERE txn_type = ? AND ref_type = ? AND ref_id = ?
     LIMIT 1`,
    [txnType, refType, refId]
  );
  return rows.length > 0 ? rows[0].id : null;
}

async function softDeleteStockTxn(conn, txnType, refType, refId) {
  await conn.query(
    `UPDATE stock_transactions
     SET deleted_at = NOW()
     WHERE txn_type = ? AND ref_type = ? AND ref_id = ? AND deleted_at IS NULL`,
    [txnType, refType, refId]
  );
}

module.exports = {
  StockError,
  withTransaction,
  getInboundOrderContext,
  getOutboundOrderContext,
  getReturnOrderContext,
  adjustAvailableQty,
  upsertStockTxn,
  getStockTxnId,
  softDeleteStockTxn
};
