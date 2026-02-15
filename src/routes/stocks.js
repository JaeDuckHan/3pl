const express = require("express");
const { getPool } = require("../db");

const router = express.Router();

router.get("/stock-balances", async (req, res) => {
  const { client_id, product_id, lot_id, warehouse_id, location_id } = req.query;

  try {
    let query = `SELECT id, client_id, product_id, lot_id, warehouse_id, location_id, available_qty, reserved_qty, created_at, updated_at
                 FROM stock_balances
                 WHERE deleted_at IS NULL`;
    const params = [];

    if (client_id) {
      query += " AND client_id = ?";
      params.push(client_id);
    }
    if (product_id) {
      query += " AND product_id = ?";
      params.push(product_id);
    }
    if (lot_id) {
      query += " AND lot_id = ?";
      params.push(lot_id);
    }
    if (warehouse_id) {
      query += " AND warehouse_id = ?";
      params.push(warehouse_id);
    }
    if (location_id) {
      query += " AND location_id = ?";
      params.push(location_id);
    }

    query += " ORDER BY id DESC";
    const [rows] = await getPool().query(query, params);
    res.json({ ok: true, data: rows });
  } catch (error) {
    res.status(500).json({ ok: false, message: error.message });
  }
});

router.get("/stock-transactions", async (req, res) => {
  const { client_id, product_id, lot_id, ref_type, ref_id, txn_type, date_from, date_to } = req.query;

  try {
    let query = `SELECT id, client_id, product_id, lot_id, warehouse_id, location_id, txn_type, txn_date, qty_in, qty_out, ref_type, ref_id, note, created_by, created_at, updated_at
                 FROM stock_transactions
                 WHERE deleted_at IS NULL`;
    const params = [];

    if (client_id) {
      query += " AND client_id = ?";
      params.push(client_id);
    }
    if (product_id) {
      query += " AND product_id = ?";
      params.push(product_id);
    }
    if (lot_id) {
      query += " AND lot_id = ?";
      params.push(lot_id);
    }
    if (ref_type) {
      query += " AND ref_type = ?";
      params.push(ref_type);
    }
    if (ref_id) {
      query += " AND ref_id = ?";
      params.push(ref_id);
    }
    if (txn_type) {
      query += " AND txn_type = ?";
      params.push(txn_type);
    }
    if (date_from) {
      query += " AND txn_date >= ?";
      params.push(date_from);
    }
    if (date_to) {
      query += " AND txn_date < DATE_ADD(?, INTERVAL 1 DAY)";
      params.push(date_to);
    }

    query += " ORDER BY txn_date DESC, id DESC";
    const [rows] = await getPool().query(query, params);
    res.json({ ok: true, data: rows });
  } catch (error) {
    res.status(500).json({ ok: false, message: error.message });
  }
});

module.exports = router;
