const express = require("express");
const { z } = require("zod");
const { getPool } = require("../db");
const { validate } = require("../middleware/validate");

const router = express.Router();

const warehouseSchema = z.object({
  code: z.string().min(1).max(50),
  name: z.string().min(1).max(255),
  country: z.string().min(1).max(100),
  timezone: z.string().min(1).max(100).default("Asia/Bangkok"),
  status: z.enum(["active", "inactive"]).default("active")
});

function isMysqlDuplicate(error) {
  return error && error.code === "ER_DUP_ENTRY";
}

router.get("/", async (_req, res) => {
  try {
    const [rows] = await getPool().query(
      `SELECT id, code, name, country, timezone, status, created_at, updated_at
       FROM warehouses
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
      `SELECT id, code, name, country, timezone, status, created_at, updated_at
       FROM warehouses
       WHERE id = ? AND deleted_at IS NULL`,
      [req.params.id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ ok: false, message: "Warehouse not found" });
    }
    res.json({ ok: true, data: rows[0] });
  } catch (error) {
    res.status(500).json({ ok: false, message: error.message });
  }
});

router.post("/", validate(warehouseSchema), async (req, res) => {
  const {
    code,
    name,
    country,
    timezone = "Asia/Bangkok",
    status = "active"
  } = req.body;

  if (!code || !name || !country) {
    return res.status(400).json({
      ok: false,
      message: "code, name, country are required"
    });
  }

  try {
    const [result] = await getPool().query(
      `INSERT INTO warehouses (code, name, country, timezone, status)
       VALUES (?, ?, ?, ?, ?)`,
      [code, name, country, timezone, status]
    );

    const [rows] = await getPool().query(
      `SELECT id, code, name, country, timezone, status, created_at, updated_at
       FROM warehouses
       WHERE id = ?`,
      [result.insertId]
    );
    res.status(201).json({ ok: true, data: rows[0] });
  } catch (error) {
    if (isMysqlDuplicate(error)) {
      return res.status(409).json({ ok: false, message: "Duplicate warehouse code" });
    }
    res.status(500).json({ ok: false, message: error.message });
  }
});

router.put("/:id", validate(warehouseSchema), async (req, res) => {
  const { code, name, country, timezone, status } = req.body;

  if (!code || !name || !country || !timezone || !status) {
    return res.status(400).json({
      ok: false,
      message: "code, name, country, timezone, status are required"
    });
  }

  try {
    const [result] = await getPool().query(
      `UPDATE warehouses
       SET code = ?, name = ?, country = ?, timezone = ?, status = ?
       WHERE id = ? AND deleted_at IS NULL`,
      [code, name, country, timezone, status, req.params.id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ ok: false, message: "Warehouse not found" });
    }

    const [rows] = await getPool().query(
      `SELECT id, code, name, country, timezone, status, created_at, updated_at
       FROM warehouses
       WHERE id = ?`,
      [req.params.id]
    );
    res.json({ ok: true, data: rows[0] });
  } catch (error) {
    if (isMysqlDuplicate(error)) {
      return res.status(409).json({ ok: false, message: "Duplicate warehouse code" });
    }
    res.status(500).json({ ok: false, message: error.message });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    const [result] = await getPool().query(
      "UPDATE warehouses SET deleted_at = NOW() WHERE id = ? AND deleted_at IS NULL",
      [req.params.id]
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({ ok: false, message: "Warehouse not found" });
    }
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ ok: false, message: error.message });
  }
});

module.exports = router;
