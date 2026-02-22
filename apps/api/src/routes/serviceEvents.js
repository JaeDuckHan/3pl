const express = require("express");
const { getPool } = require("../db");

const router = express.Router();

router.get("/service-events", async (req, res) => {
  const { client_id, outbound_order_id, stock_transaction_id, source_type, date_from, date_to } =
    req.query;

  try {
    let query = `SELECT id, client_id, service_id, outbound_order_id, stock_transaction_id, event_date, source_type, basis_applied, qty, box_count, unit_price, amount, currency, remark, created_at, updated_at
                 FROM service_events
                 WHERE deleted_at IS NULL`;
    const params = [];

    if (client_id) {
      query += " AND client_id = ?";
      params.push(client_id);
    }
    if (outbound_order_id) {
      query += " AND outbound_order_id = ?";
      params.push(outbound_order_id);
    }
    if (stock_transaction_id) {
      query += " AND stock_transaction_id = ?";
      params.push(stock_transaction_id);
    }
    if (source_type) {
      query += " AND source_type = ?";
      params.push(source_type);
    }
    if (date_from) {
      query += " AND event_date >= ?";
      params.push(date_from);
    }
    if (date_to) {
      query += " AND event_date < DATE_ADD(?, INTERVAL 1 DAY)";
      params.push(date_to);
    }

    query += " ORDER BY event_date DESC, id DESC";
    const [rows] = await getPool().query(query, params);
    res.json({ ok: true, data: rows });
  } catch (error) {
    res.status(500).json({ ok: false, message: error.message });
  }
});

module.exports = router;
