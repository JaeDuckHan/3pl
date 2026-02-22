const express = require("express");
const { z } = require("zod");
const { getPool } = require("../db");
const { validate } = require("../middleware/validate");

const router = express.Router();

const clientCreateSchema = z.object({
  client_code: z.string().min(1).max(50),
  name_kr: z.string().min(1).max(255),
  name_en: z.string().max(255).nullable().optional(),
  contact_name: z.string().max(100).nullable().optional(),
  phone: z.string().max(50).nullable().optional(),
  email: z.string().email().nullable().optional(),
  address: z.string().max(500).nullable().optional(),
  status: z.enum(["active", "inactive"]).default("active")
});

const clientUpdateSchema = clientCreateSchema.extend({
  status: z.enum(["active", "inactive"])
});

function isMysqlDuplicate(error) {
  return error && error.code === "ER_DUP_ENTRY";
}

router.get("/", async (_req, res) => {
  try {
    const [rows] = await getPool().query(
      `SELECT id, client_code, name_kr, name_en, contact_name, phone, email, address, status, created_at, updated_at
       FROM clients
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
      `SELECT id, client_code, name_kr, name_en, contact_name, phone, email, address, status, created_at, updated_at
       FROM clients
       WHERE id = ? AND deleted_at IS NULL`,
      [req.params.id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ ok: false, message: "Client not found" });
    }
    res.json({ ok: true, data: rows[0] });
  } catch (error) {
    res.status(500).json({ ok: false, message: error.message });
  }
});

router.post("/", validate(clientCreateSchema), async (req, res) => {
  const {
    client_code,
    name_kr,
    name_en = null,
    contact_name = null,
    phone = null,
    email = null,
    address = null,
    status = "active"
  } = req.body;

  if (!client_code || !name_kr) {
    return res.status(400).json({
      ok: false,
      message: "client_code, name_kr are required"
    });
  }

  try {
    const [result] = await getPool().query(
      `INSERT INTO clients (client_code, name_kr, name_en, contact_name, phone, email, address, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [client_code, name_kr, name_en, contact_name, phone, email, address, status]
    );

    const [rows] = await getPool().query(
      `SELECT id, client_code, name_kr, name_en, contact_name, phone, email, address, status, created_at, updated_at
       FROM clients
       WHERE id = ?`,
      [result.insertId]
    );
    res.status(201).json({ ok: true, data: rows[0] });
  } catch (error) {
    if (isMysqlDuplicate(error)) {
      return res.status(409).json({ ok: false, message: "Duplicate client_code" });
    }
    res.status(500).json({ ok: false, message: error.message });
  }
});

router.put("/:id", validate(clientUpdateSchema), async (req, res) => {
  const {
    client_code,
    name_kr,
    name_en,
    contact_name,
    phone,
    email,
    address,
    status
  } = req.body;

  if (!client_code || !name_kr || !status) {
    return res.status(400).json({
      ok: false,
      message: "client_code, name_kr, status are required"
    });
  }

  try {
    const [result] = await getPool().query(
      `UPDATE clients
       SET client_code = ?, name_kr = ?, name_en = ?, contact_name = ?, phone = ?, email = ?, address = ?, status = ?
       WHERE id = ? AND deleted_at IS NULL`,
      [
        client_code,
        name_kr,
        name_en || null,
        contact_name || null,
        phone || null,
        email || null,
        address || null,
        status,
        req.params.id
      ]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ ok: false, message: "Client not found" });
    }

    const [rows] = await getPool().query(
      `SELECT id, client_code, name_kr, name_en, contact_name, phone, email, address, status, created_at, updated_at
       FROM clients
       WHERE id = ?`,
      [req.params.id]
    );
    res.json({ ok: true, data: rows[0] });
  } catch (error) {
    if (isMysqlDuplicate(error)) {
      return res.status(409).json({ ok: false, message: "Duplicate client_code" });
    }
    res.status(500).json({ ok: false, message: error.message });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    const [result] = await getPool().query(
      "UPDATE clients SET deleted_at = NOW() WHERE id = ? AND deleted_at IS NULL",
      [req.params.id]
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({ ok: false, message: "Client not found" });
    }
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ ok: false, message: error.message });
  }
});

module.exports = router;
