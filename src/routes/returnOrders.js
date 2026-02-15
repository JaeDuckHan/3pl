const express = require("express");
const { z } = require("zod");
const { getPool } = require("../db");
const { validate } = require("../middleware/validate");

const router = express.Router();

const returnOrderSchema = z.object({
  return_no: z.string().min(1).max(80),
  client_id: z.coerce.number().int().positive(),
  warehouse_id: z.coerce.number().int().positive(),
  related_outbound_order_id: z.coerce.number().int().positive().nullable().optional(),
  return_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  status: z
    .enum(["draft", "received", "inspected", "restocked", "disposed", "closed", "cancelled"])
    .default("draft"),
  reason: z.string().max(1000).nullable().optional(),
  created_by: z.coerce.number().int().positive()
});

function isMysqlDuplicate(error) {
  return error && error.code === "ER_DUP_ENTRY";
}

function isMysqlForeignKey(error) {
  return error && error.code === "ER_NO_REFERENCED_ROW_2";
}

router.get("/", async (_req, res) => {
  try {
    const [rows] = await getPool().query(
      `SELECT id, return_no, client_id, warehouse_id, related_outbound_order_id, return_date, status, reason, created_by, created_at, updated_at
       FROM return_orders
       WHERE deleted_at IS NULL
       ORDER BY id DESC`
    );
    res.json({ ok: true, data: rows });
  } catch (error) {
    res.status(500).json({ ok: false, message: error.message });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const [rows] = await getPool().query(
      `SELECT id, return_no, client_id, warehouse_id, related_outbound_order_id, return_date, status, reason, created_by, created_at, updated_at
       FROM return_orders
       WHERE id = ? AND deleted_at IS NULL`,
      [req.params.id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ ok: false, message: "Return order not found" });
    }
    res.json({ ok: true, data: rows[0] });
  } catch (error) {
    res.status(500).json({ ok: false, message: error.message });
  }
});

router.post("/", validate(returnOrderSchema), async (req, res) => {
  const {
    return_no,
    client_id,
    warehouse_id,
    related_outbound_order_id = null,
    return_date,
    status = "draft",
    reason = null,
    created_by
  } = req.body;

  try {
    const [result] = await getPool().query(
      `INSERT INTO return_orders (return_no, client_id, warehouse_id, related_outbound_order_id, return_date, status, reason, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [return_no, client_id, warehouse_id, related_outbound_order_id, return_date, status, reason, created_by]
    );
    const [rows] = await getPool().query(
      `SELECT id, return_no, client_id, warehouse_id, related_outbound_order_id, return_date, status, reason, created_by, created_at, updated_at
       FROM return_orders
       WHERE id = ?`,
      [result.insertId]
    );
    res.status(201).json({ ok: true, data: rows[0] });
  } catch (error) {
    if (isMysqlDuplicate(error)) {
      return res.status(409).json({ ok: false, message: "Duplicate return_no" });
    }
    if (isMysqlForeignKey(error)) {
      return res.status(400).json({
        ok: false,
        message: "Invalid client_id, warehouse_id, related_outbound_order_id or created_by"
      });
    }
    res.status(500).json({ ok: false, message: error.message });
  }
});

router.put("/:id", validate(returnOrderSchema), async (req, res) => {
  const {
    return_no,
    client_id,
    warehouse_id,
    related_outbound_order_id,
    return_date,
    status,
    reason,
    created_by
  } = req.body;

  try {
    const [result] = await getPool().query(
      `UPDATE return_orders
       SET return_no = ?, client_id = ?, warehouse_id = ?, related_outbound_order_id = ?, return_date = ?, status = ?, reason = ?, created_by = ?
       WHERE id = ? AND deleted_at IS NULL`,
      [
        return_no,
        client_id,
        warehouse_id,
        related_outbound_order_id || null,
        return_date,
        status,
        reason || null,
        created_by,
        req.params.id
      ]
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({ ok: false, message: "Return order not found" });
    }
    const [rows] = await getPool().query(
      `SELECT id, return_no, client_id, warehouse_id, related_outbound_order_id, return_date, status, reason, created_by, created_at, updated_at
       FROM return_orders
       WHERE id = ?`,
      [req.params.id]
    );
    res.json({ ok: true, data: rows[0] });
  } catch (error) {
    if (isMysqlDuplicate(error)) {
      return res.status(409).json({ ok: false, message: "Duplicate return_no" });
    }
    if (isMysqlForeignKey(error)) {
      return res.status(400).json({
        ok: false,
        message: "Invalid client_id, warehouse_id, related_outbound_order_id or created_by"
      });
    }
    res.status(500).json({ ok: false, message: error.message });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    const [result] = await getPool().query(
      "UPDATE return_orders SET deleted_at = NOW() WHERE id = ? AND deleted_at IS NULL",
      [req.params.id]
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({ ok: false, message: "Return order not found" });
    }
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ ok: false, message: error.message });
  }
});

module.exports = router;
