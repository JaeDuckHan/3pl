const express = require("express");
const { getPool } = require("../db");

const router = express.Router();

router.get("/", async (req, res) => {
  const { product_id, client_id, status } = req.query;

  try {
    let query = `SELECT pl.id, pl.product_id, pl.lot_no, pl.expiry_date, pl.mfg_date, pl.status, pl.created_at, pl.updated_at
                 FROM product_lots pl
                 JOIN products p ON p.id = pl.product_id
                 WHERE pl.deleted_at IS NULL
                   AND p.deleted_at IS NULL`;
    const params = [];

    if (product_id) {
      query += " AND pl.product_id = ?";
      params.push(product_id);
    }
    if (client_id) {
      query += " AND p.client_id = ?";
      params.push(client_id);
    }
    if (status) {
      query += " AND pl.status = ?";
      params.push(status);
    }

    query += " ORDER BY pl.id DESC";

    const [rows] = await getPool().query(query, params);
    return res.json({ ok: true, data: rows });
  } catch (error) {
    return res.status(500).json({ ok: false, message: error.message });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const [rows] = await getPool().query(
      `SELECT pl.id, pl.product_id, pl.lot_no, pl.expiry_date, pl.mfg_date, pl.status, pl.created_at, pl.updated_at
       FROM product_lots pl
       JOIN products p ON p.id = pl.product_id
       WHERE pl.id = ? AND pl.deleted_at IS NULL AND p.deleted_at IS NULL`,
      [req.params.id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ ok: false, message: "Product lot not found" });
    }
    return res.json({ ok: true, data: rows[0] });
  } catch (error) {
    return res.status(500).json({ ok: false, message: error.message });
  }
});

module.exports = router;
