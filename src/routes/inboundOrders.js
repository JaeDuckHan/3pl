const express = require("express");
const { z } = require("zod");
const { getPool } = require("../db");
const { validate } = require("../middleware/validate");

const router = express.Router();

const inboundOrderCreateSchema = z.object({
  inbound_no: z.string().min(1).max(80),
  client_id: z.coerce.number().int().positive(),
  warehouse_id: z.coerce.number().int().positive(),
  inbound_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  status: z.enum(["draft", "submitted", "arrived", "qc_hold", "received", "cancelled"]).default("draft"),
  memo: z.string().max(1000).nullable().optional(),
  created_by: z.coerce.number().int().positive(),
  received_at: z.string().datetime().nullable().optional()
});

const inboundOrderUpdateSchema = inboundOrderCreateSchema.extend({
  status: z.enum(["draft", "submitted", "arrived", "qc_hold", "received", "cancelled"])
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
      `SELECT id, inbound_no, client_id, warehouse_id, inbound_date, status, memo, created_by, received_at, created_at, updated_at
       FROM inbound_orders
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
      `SELECT id, inbound_no, client_id, warehouse_id, inbound_date, status, memo, created_by, received_at, created_at, updated_at
       FROM inbound_orders
       WHERE id = ? AND deleted_at IS NULL`,
      [req.params.id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ ok: false, message: "Inbound order not found" });
    }
    res.json({ ok: true, data: rows[0] });
  } catch (error) {
    res.status(500).json({ ok: false, message: error.message });
  }
});

router.post("/", validate(inboundOrderCreateSchema), async (req, res) => {
  const {
    inbound_no,
    client_id,
    warehouse_id,
    inbound_date,
    status = "draft",
    memo = null,
    created_by,
    received_at = null
  } = req.body;

  if (!inbound_no || !client_id || !warehouse_id || !inbound_date || !created_by) {
    return res.status(400).json({
      ok: false,
      message: "inbound_no, client_id, warehouse_id, inbound_date, created_by are required"
    });
  }

  try {
    const [result] = await getPool().query(
      `INSERT INTO inbound_orders (inbound_no, client_id, warehouse_id, inbound_date, status, memo, created_by, received_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [inbound_no, client_id, warehouse_id, inbound_date, status, memo, created_by, received_at]
    );

    const [rows] = await getPool().query(
      `SELECT id, inbound_no, client_id, warehouse_id, inbound_date, status, memo, created_by, received_at, created_at, updated_at
       FROM inbound_orders
       WHERE id = ?`,
      [result.insertId]
    );
    res.status(201).json({ ok: true, data: rows[0] });
  } catch (error) {
    if (isMysqlDuplicate(error)) {
      return res.status(409).json({ ok: false, message: "Duplicate inbound_no" });
    }
    if (isMysqlForeignKey(error)) {
      return res.status(400).json({ ok: false, message: "Invalid client_id, warehouse_id or created_by" });
    }
    res.status(500).json({ ok: false, message: error.message });
  }
});

router.put("/:id", validate(inboundOrderUpdateSchema), async (req, res) => {
  const {
    inbound_no,
    client_id,
    warehouse_id,
    inbound_date,
    status,
    memo,
    created_by,
    received_at
  } = req.body;

  if (!inbound_no || !client_id || !warehouse_id || !inbound_date || !status || !created_by) {
    return res.status(400).json({
      ok: false,
      message: "inbound_no, client_id, warehouse_id, inbound_date, status, created_by are required"
    });
  }

  try {
    const [result] = await getPool().query(
      `UPDATE inbound_orders
       SET inbound_no = ?, client_id = ?, warehouse_id = ?, inbound_date = ?, status = ?, memo = ?, created_by = ?, received_at = ?
       WHERE id = ? AND deleted_at IS NULL`,
      [
        inbound_no,
        client_id,
        warehouse_id,
        inbound_date,
        status,
        memo || null,
        created_by,
        received_at || null,
        req.params.id
      ]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ ok: false, message: "Inbound order not found" });
    }

    const [rows] = await getPool().query(
      `SELECT id, inbound_no, client_id, warehouse_id, inbound_date, status, memo, created_by, received_at, created_at, updated_at
       FROM inbound_orders
       WHERE id = ?`,
      [req.params.id]
    );
    res.json({ ok: true, data: rows[0] });
  } catch (error) {
    if (isMysqlDuplicate(error)) {
      return res.status(409).json({ ok: false, message: "Duplicate inbound_no" });
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
      "UPDATE inbound_orders SET deleted_at = NOW() WHERE id = ? AND deleted_at IS NULL",
      [req.params.id]
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({ ok: false, message: "Inbound order not found" });
    }
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ ok: false, message: error.message });
  }
});

module.exports = router;
