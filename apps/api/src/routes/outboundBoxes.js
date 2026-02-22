const express = require("express");
const { z } = require("zod");
const { getPool } = require("../db");
const { validate } = require("../middleware/validate");

const router = express.Router();

const createBoxSchema = z.object({
  box_no: z.string().min(1).max(80),
  courier: z.string().max(100).nullable().optional(),
  tracking_no: z.string().max(120).nullable().optional(),
  item_count: z.coerce.number().int().min(1)
});

const updateBoxSchema = z.object({
  box_no: z.string().min(1).max(80),
  courier: z.string().max(100).nullable().optional(),
  tracking_no: z.string().max(120).nullable().optional(),
  item_count: z.coerce.number().int().min(1),
  status: z.enum(["open", "packed", "shipped"]).default("open")
});

let ensured = false;

async function ensureOutboundBoxesTable() {
  if (ensured) return;
  await getPool().query(`
    CREATE TABLE IF NOT EXISTS outbound_boxes (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      outbound_order_id BIGINT UNSIGNED NOT NULL,
      box_no VARCHAR(80) NOT NULL,
      courier VARCHAR(100) NULL,
      tracking_no VARCHAR(120) NULL,
      item_count INT UNSIGNED NOT NULL DEFAULT 0,
      status ENUM('open','packed','shipped') NOT NULL DEFAULT 'open',
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      deleted_at DATETIME NULL,
      PRIMARY KEY (id),
      UNIQUE KEY uq_outbound_box_no (outbound_order_id, box_no),
      KEY idx_outbound_boxes_order_deleted (outbound_order_id, deleted_at),
      CONSTRAINT fk_outbound_boxes_order FOREIGN KEY (outbound_order_id) REFERENCES outbound_orders(id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
  ensured = true;
}

async function hasOutboundOrder(outboundOrderId) {
  const [rows] = await getPool().query(
    "SELECT id FROM outbound_orders WHERE id = ? AND deleted_at IS NULL LIMIT 1",
    [outboundOrderId]
  );
  return rows.length > 0;
}

function isMysqlDuplicate(error) {
  return error && error.code === "ER_DUP_ENTRY";
}

router.get("/:id/boxes", async (req, res) => {
  try {
    await ensureOutboundBoxesTable();
    const outboundOrderId = Number(req.params.id);
    const exists = await hasOutboundOrder(outboundOrderId);
    if (!exists) {
      return res.status(404).json({ ok: false, message: "Outbound order not found" });
    }

    const [rows] = await getPool().query(
      `SELECT id, outbound_order_id, box_no, courier, tracking_no, item_count, status, created_at, updated_at
       FROM outbound_boxes
       WHERE outbound_order_id = ? AND deleted_at IS NULL
       ORDER BY id DESC`,
      [outboundOrderId]
    );
    return res.json({ ok: true, data: rows });
  } catch (error) {
    return res.status(500).json({ ok: false, message: error.message });
  }
});

router.post("/:id/boxes", validate(createBoxSchema), async (req, res) => {
  try {
    await ensureOutboundBoxesTable();
    const outboundOrderId = Number(req.params.id);
    const exists = await hasOutboundOrder(outboundOrderId);
    if (!exists) {
      return res.status(404).json({ ok: false, message: "Outbound order not found" });
    }

    const { box_no, courier = null, tracking_no = null, item_count } = req.body;

    const [result] = await getPool().query(
      `INSERT INTO outbound_boxes (outbound_order_id, box_no, courier, tracking_no, item_count, status)
       VALUES (?, ?, ?, ?, ?, 'open')`,
      [outboundOrderId, box_no, courier, tracking_no, item_count]
    );

    const [rows] = await getPool().query(
      `SELECT id, outbound_order_id, box_no, courier, tracking_no, item_count, status, created_at, updated_at
       FROM outbound_boxes
       WHERE id = ?`,
      [result.insertId]
    );

    return res.status(201).json({ ok: true, data: rows[0] });
  } catch (error) {
    if (isMysqlDuplicate(error)) {
      return res.status(409).json({ ok: false, message: "Duplicate box_no in outbound order" });
    }
    return res.status(500).json({ ok: false, message: error.message });
  }
});

router.put("/:id/boxes/:boxId", validate(updateBoxSchema), async (req, res) => {
  try {
    await ensureOutboundBoxesTable();
    const outboundOrderId = Number(req.params.id);
    const exists = await hasOutboundOrder(outboundOrderId);
    if (!exists) {
      return res.status(404).json({ ok: false, message: "Outbound order not found" });
    }

    const { box_no, courier = null, tracking_no = null, item_count, status } = req.body;
    const [result] = await getPool().query(
      `UPDATE outbound_boxes
       SET box_no = ?, courier = ?, tracking_no = ?, item_count = ?, status = ?
       WHERE id = ? AND outbound_order_id = ? AND deleted_at IS NULL`,
      [box_no, courier, tracking_no, item_count, status, req.params.boxId, outboundOrderId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ ok: false, message: "Outbound box not found" });
    }

    const [rows] = await getPool().query(
      `SELECT id, outbound_order_id, box_no, courier, tracking_no, item_count, status, created_at, updated_at
       FROM outbound_boxes
       WHERE id = ?`,
      [req.params.boxId]
    );

    return res.json({ ok: true, data: rows[0] });
  } catch (error) {
    if (isMysqlDuplicate(error)) {
      return res.status(409).json({ ok: false, message: "Duplicate box_no in outbound order" });
    }
    return res.status(500).json({ ok: false, message: error.message });
  }
});

router.delete("/:id/boxes/:boxId", async (req, res) => {
  try {
    await ensureOutboundBoxesTable();
    const outboundOrderId = Number(req.params.id);
    const [result] = await getPool().query(
      `UPDATE outbound_boxes
       SET deleted_at = NOW()
       WHERE id = ? AND outbound_order_id = ? AND deleted_at IS NULL`,
      [req.params.boxId, outboundOrderId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ ok: false, message: "Outbound box not found" });
    }
    return res.json({ ok: true });
  } catch (error) {
    return res.status(500).json({ ok: false, message: error.message });
  }
});

module.exports = router;
