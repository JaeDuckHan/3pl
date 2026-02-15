const express = require("express");
const jwt = require("jsonwebtoken");
const { z } = require("zod");
const { validate } = require("../middleware/validate");
const { getPool } = require("../db");
const { authenticateToken } = require("../middleware/auth");

const router = express.Router();

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1)
});

router.post("/login", validate(loginSchema), async (req, res) => {
  const { email, password } = req.body;

  const [rows] = await getPool().query(
    `SELECT id, client_id, email, password_hash, role
     FROM users
     WHERE email = ? AND status = 'active' AND deleted_at IS NULL
     LIMIT 1`,
    [email]
  );

  if (rows.length === 0) {
    return res.status(401).json({
      ok: false,
      code: "INVALID_CREDENTIALS",
      message: "Invalid email or password"
    });
  }

  const user = rows[0];
  let isValid = false;

  isValid = password === user.password_hash;

  if (!isValid) {
    return res.status(401).json({
      ok: false,
      code: "INVALID_CREDENTIALS",
      message: "Invalid email or password"
    });
  }

  const token = jwt.sign(
    {
      sub: String(user.id),
      email: user.email,
      role: user.role,
      client_id: user.client_id
    },
    process.env.JWT_SECRET || "dev-secret",
    { expiresIn: "8h" }
  );

  res.json({
    ok: true,
    data: {
      token,
      tokenType: "Bearer",
      expiresIn: "8h"
    }
  });
});

router.get("/me", authenticateToken, async (req, res) => {
  const userId = Number(req.user.sub);
  const [rows] = await getPool().query(
    `SELECT id, client_id, email, name, role, status, created_at, updated_at
     FROM users
     WHERE id = ? AND deleted_at IS NULL
     LIMIT 1`,
    [userId]
  );
  if (rows.length === 0) {
    return res.status(404).json({
      ok: false,
      code: "NOT_FOUND",
      message: "User not found"
    });
  }
  return res.json({ ok: true, data: rows[0] });
});

module.exports = router;
