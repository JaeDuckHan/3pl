const express = require("express");
const { z } = require("zod");
const { getPool } = require("../db");
const { validate } = require("../middleware/validate");

const router = express.Router();

const outboundOrderSchema = z.object({
  outbound_no: z.string().min(1).max(80),
  client_id: z.coerce.number().int().positive(),
  warehouse_id: z.coerce.number().int().positive(),
  order_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  sales_channel: z.string().max(80).nullable().optional(),
  order_no: z.string().max(120).nullable().optional(),
  tracking_no: z.string().max(120).nullable().optional(),
  status: z
    .enum([
      "draft",
      "confirmed",
      "allocated",
      "picking",
      "packed",
      "shipped",
      "delivered",
      "cancelled"
    ])
    .default("draft"),
  packed_at: z.string().datetime().nullable().optional(),
  shipped_at: z.string().datetime().nullable().optional(),
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
      `SELECT id, outbound_no, client_id, warehouse_id, order_date, sales_channel, order_no, tracking_no, status, packed_at, shipped_at, created_by, created_at, updated_at
       FROM outbound_orders
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
      `SELECT id, outbound_no, client_id, warehouse_id, order_date, sales_channel, order_no, tracking_no, status, packed_at, shipped_at, created_by, created_at, updated_at
       FROM outbound_orders
       WHERE id = ? AND deleted_at IS NULL`,
      [req.params.id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ ok: false, message: "Outbound order not found" });
    }
    res.json({ ok: true, data: rows[0] });
  } catch (error) {
    res.status(500).json({ ok: false, message: error.message });
  }
});

router.post("/", validate(outboundOrderSchema), async (req, res) => {
  const {
    outbound_no,
    client_id,
    warehouse_id,
    order_date,
    sales_channel = null,
    order_no = null,
    tracking_no = null,
    status = "draft",
    packed_at = null,
    shipped_at = null,
    created_by
  } = req.body;

  try {
    const [result] = await getPool().query(
      `INSERT INTO outbound_orders (outbound_no, client_id, warehouse_id, order_date, sales_channel, order_no, tracking_no, status, packed_at, shipped_at, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        outbound_no,
        client_id,
        warehouse_id,
        order_date,
        sales_channel,
        order_no,
        tracking_no,
        status,
        packed_at,
        shipped_at,
        created_by
      ]
    );

    const [rows] = await getPool().query(
      `SELECT id, outbound_no, client_id, warehouse_id, order_date, sales_channel, order_no, tracking_no, status, packed_at, shipped_at, created_by, created_at, updated_at
       FROM outbound_orders
       WHERE id = ?`,
      [result.insertId]
    );
    res.status(201).json({ ok: true, data: rows[0] });
  } catch (error) {
    if (isMysqlDuplicate(error)) {
      return res.status(409).json({ ok: false, message: "Duplicate outbound_no" });
    }
    if (isMysqlForeignKey(error)) {
      return res.status(400).json({ ok: false, message: "Invalid client_id, warehouse_id or created_by" });
    }
    res.status(500).json({ ok: false, message: error.message });
  }
});

router.put("/:id", validate(outboundOrderSchema), async (req, res) => {
  const {
    outbound_no,
    client_id,
    warehouse_id,
    order_date,
    sales_channel,
    order_no,
    tracking_no,
    status,
    packed_at,
    shipped_at,
    created_by
  } = req.body;

  try {
    const [result] = await getPool().query(
      `UPDATE outbound_orders
       SET outbound_no = ?, client_id = ?, warehouse_id = ?, order_date = ?, sales_channel = ?, order_no = ?, tracking_no = ?, status = ?, packed_at = ?, shipped_at = ?, created_by = ?
       WHERE id = ? AND deleted_at IS NULL`,
      [
        outbound_no,
        client_id,
        warehouse_id,
        order_date,
        sales_channel || null,
        order_no || null,
        tracking_no || null,
        status,
        packed_at || null,
        shipped_at || null,
        created_by,
        req.params.id
      ]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ ok: false, message: "Outbound order not found" });
    }

    const [rows] = await getPool().query(
      `SELECT id, outbound_no, client_id, warehouse_id, order_date, sales_channel, order_no, tracking_no, status, packed_at, shipped_at, created_by, created_at, updated_at
       FROM outbound_orders
       WHERE id = ?`,
      [req.params.id]
    );
    res.json({ ok: true, data: rows[0] });
  } catch (error) {
    if (isMysqlDuplicate(error)) {
      return res.status(409).json({ ok: false, message: "Duplicate outbound_no" });
    }
    if (isMysqlForeignKey(error)) {
      return res.status(400).json({ ok: false, message: "Invalid client_id, warehouse_id or created_by" });
    }
    res.status(500).json({ ok: false, message: error.message });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    const [result] = await getPool().query(
      "UPDATE outbound_orders SET deleted_at = NOW() WHERE id = ? AND deleted_at IS NULL",
      [req.params.id]
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({ ok: false, message: "Outbound order not found" });
    }
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ ok: false, message: error.message });
  }
});

module.exports = router;
