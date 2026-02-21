const express = require("express");
const { z } = require("zod");
const { getPool } = require("../db");
const { validate } = require("../middleware/validate");
const { withTransaction } = require("../services/stock");

const router = express.Router();

const BILLING_UNITS = ["ORDER", "SKU", "BOX", "CBM", "PALLET", "EVENT", "MONTH"];
const PRICING_POLICIES = ["THB_BASED", "KRW_FIXED"];

function trunc100(input) {
  const value = Number(input || 0);
  return Math.floor(value / 100) * 100;
}

function monthRange(invoiceMonth) {
  const from = `${invoiceMonth}-01`;
  const [year, month] = invoiceMonth.split("-").map(Number);
  const to = month === 12 ? `${year + 1}-01-01` : `${year}-${String(month + 1).padStart(2, "0")}-01`;
  return { from, to };
}

function parseCreator(req, payloadCreatedBy) {
  if (payloadCreatedBy) return payloadCreatedBy;
  const authUserId = Number(req.user?.sub || 0);
  return Number.isFinite(authUserId) && authUserId > 0 ? authUserId : 1;
}

function mapBillingBasisFromUnit(unit) {
  if (unit === "ORDER") return "ORDER";
  if (unit === "BOX") return "BOX";
  if (unit === "SKU") return "QTY";
  return "MANUAL";
}

function requireAdmin(req, res) {
  if (req.user?.role !== "admin") {
    res.status(403).json({
      ok: false,
      code: "ADMIN_ONLY",
      message: "This operation requires admin role"
    });
    return false;
  }
  return true;
}

async function getExchangeRateUsageCount(conn, exchangeRateId) {
  const [rows] = await conn.query(
    `SELECT COUNT(*) AS usage_count
     FROM invoices i
     JOIN exchange_rates er ON er.id = ?
     WHERE i.deleted_at IS NULL
       AND i.invoice_month IS NOT NULL
       AND i.fx_rate_thbkrw = er.rate`,
    [exchangeRateId]
  );
  return Number(rows[0]?.usage_count || 0);
}

async function resolveInvoiceSequence(conn, clientId, yyyymm) {
  const [seqRows] = await conn.query(
    `SELECT id, last_seq
     FROM invoice_sequences
     WHERE client_id = ? AND yyyymm = ? AND deleted_at IS NULL
     LIMIT 1
     FOR UPDATE`,
    [clientId, yyyymm]
  );

  if (seqRows.length === 0) {
    await conn.query(
      `INSERT INTO invoice_sequences (client_id, yyyymm, last_seq)
       VALUES (?, ?, 1)`,
      [clientId, yyyymm]
    );
    return 1;
  }

  const nextSeq = Number(seqRows[0].last_seq) + 1;
  await conn.query("UPDATE invoice_sequences SET last_seq = ? WHERE id = ?", [nextSeq, seqRows[0].id]);
  return nextSeq;
}

function normalizeInvoiceStatus(status) {
  if (!status) return null;
  const value = String(status).toLowerCase();
  if (["draft", "issued", "paid"].includes(value)) return value;
  return null;
}

const serviceCatalogSchema = z.object({
  service_code: z.string().min(1).max(80),
  service_name: z.string().min(1).max(255),
  billing_unit: z.enum(BILLING_UNITS),
  pricing_policy: z.enum(PRICING_POLICIES),
  default_currency: z.enum(["THB", "KRW"]),
  default_rate: z.coerce.number().nonnegative(),
  status: z.enum(["active", "inactive"]).default("active")
});

const clientRateSchema = z.object({
  client_id: z.coerce.number().int().positive(),
  service_code: z.string().min(1).max(80),
  custom_rate: z.coerce.number().nonnegative(),
  currency: z.enum(["THB", "KRW"]),
  effective_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
});

const exchangeRateSchema = z.object({
  rate_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  rate: z.coerce.number().positive(),
  source: z.enum(["manual", "api"]).default("manual"),
  locked: z.coerce.number().int().min(0).max(1).default(0),
  status: z.enum(["draft", "active", "superseded"]).default("active"),
  entered_by: z.coerce.number().int().positive().optional()
});

const billingEventSchema = z.object({
  client_id: z.coerce.number().int().positive(),
  service_code: z.string().min(1).max(80),
  reference_type: z.string().min(1).max(40),
  reference_id: z.string().max(120).nullable().optional(),
  event_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  qty: z.coerce.number().nonnegative().default(0),
  pricing_policy: z.enum(PRICING_POLICIES),
  unit_price_thb: z.coerce.number().nonnegative().nullable().optional(),
  amount_thb: z.coerce.number().nonnegative().nullable().optional(),
  unit_price_krw: z.coerce.number().nonnegative().nullable().optional(),
  amount_krw: z.coerce.number().nonnegative().nullable().optional()
});

const generateInvoiceSchema = z.object({
  client_id: z.coerce.number().int().positive(),
  invoice_month: z.string().regex(/^\d{4}-\d{2}$/),
  invoice_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  regenerate_draft: z.coerce.number().int().min(0).max(1).default(0),
  created_by: z.coerce.number().int().positive().optional()
});

const markPendingSchema = z.object({
  ids: z.array(z.coerce.number().int().positive()).min(1)
});

function buildBillingEventsWhere(query) {
  const params = [];
  let where = " WHERE be.deleted_at IS NULL";

  if (query.client_id) {
    where += " AND be.client_id = ?";
    params.push(Number(query.client_id));
  }
  if (query.status) {
    where += " AND be.status = ?";
    params.push(String(query.status).toUpperCase());
  }
  if (query.service_code) {
    where += " AND be.service_code = ?";
    params.push(String(query.service_code));
  }
  if (query.invoice_month && /^\d{4}-\d{2}$/.test(String(query.invoice_month))) {
    where += " AND DATE_FORMAT(be.event_date, '%Y-%m') = ?";
    params.push(String(query.invoice_month));
  }

  return { where, params };
}

router.get("/billing/settings/service-catalog", async (_req, res) => {
  try {
    const [rows] = await getPool().query(
      `SELECT id, service_code, COALESCE(service_name, service_name_kr) AS service_name,
              billing_unit, pricing_policy, default_currency, default_rate, status, created_at, updated_at
       FROM service_catalog
       WHERE deleted_at IS NULL
       ORDER BY service_code ASC`
    );
    return res.json({ ok: true, data: rows });
  } catch (error) {
    return res.status(500).json({ ok: false, message: error.message });
  }
});

router.post("/billing/settings/service-catalog", validate(serviceCatalogSchema), async (req, res) => {
  if (!requireAdmin(req, res)) return;
  const payload = req.body;
  try {
    await getPool().query(
      `INSERT INTO service_catalog
        (service_code, service_name_kr, service_name, billing_basis, billing_unit, pricing_policy, default_currency, default_rate, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        payload.service_code,
        payload.service_name,
        payload.service_name,
        mapBillingBasisFromUnit(payload.billing_unit),
        payload.billing_unit,
        payload.pricing_policy,
        payload.default_currency,
        payload.default_rate,
        payload.status
      ]
    );

    const [rows] = await getPool().query(
      `SELECT id, service_code, COALESCE(service_name, service_name_kr) AS service_name,
              billing_unit, pricing_policy, default_currency, default_rate, status, created_at, updated_at
       FROM service_catalog
       WHERE service_code = ? AND deleted_at IS NULL`,
      [payload.service_code]
    );

    return res.status(201).json({ ok: true, data: rows[0] });
  } catch (error) {
    if (error.code === "ER_DUP_ENTRY") {
      return res.status(409).json({ ok: false, message: "Duplicate service_code" });
    }
    return res.status(500).json({ ok: false, message: error.message });
  }
});
router.put("/billing/settings/service-catalog/:serviceCode", validate(serviceCatalogSchema), async (req, res) => {
  if (!requireAdmin(req, res)) return;
  const payload = req.body;
  try {
    const [result] = await getPool().query(
      `UPDATE service_catalog
       SET service_code = ?, service_name_kr = ?, service_name = ?, billing_basis = ?, billing_unit = ?,
           pricing_policy = ?, default_currency = ?, default_rate = ?, status = ?
       WHERE service_code = ? AND deleted_at IS NULL`,
      [
        payload.service_code,
        payload.service_name,
        payload.service_name,
        mapBillingBasisFromUnit(payload.billing_unit),
        payload.billing_unit,
        payload.pricing_policy,
        payload.default_currency,
        payload.default_rate,
        payload.status,
        req.params.serviceCode
      ]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ ok: false, message: "Service not found" });
    }

    const [rows] = await getPool().query(
      `SELECT id, service_code, COALESCE(service_name, service_name_kr) AS service_name,
              billing_unit, pricing_policy, default_currency, default_rate, status, created_at, updated_at
       FROM service_catalog
       WHERE service_code = ? AND deleted_at IS NULL`,
      [payload.service_code]
    );

    return res.json({ ok: true, data: rows[0] });
  } catch (error) {
    if (error.code === "ER_DUP_ENTRY") {
      return res.status(409).json({ ok: false, message: "Duplicate service_code" });
    }
    return res.status(500).json({ ok: false, message: error.message });
  }
});

router.delete("/billing/settings/service-catalog/:serviceCode", async (req, res) => {
  if (!requireAdmin(req, res)) return;
  try {
    const [result] = await getPool().query(
      "UPDATE service_catalog SET deleted_at = NOW() WHERE service_code = ? AND deleted_at IS NULL",
      [req.params.serviceCode]
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({ ok: false, message: "Service not found" });
    }
    return res.json({ ok: true });
  } catch (error) {
    return res.status(500).json({ ok: false, message: error.message });
  }
});

router.get("/billing/settings/client-contract-rates", async (req, res) => {
  const { client_id, service_code } = req.query;
  try {
    let query = `SELECT id, client_id, service_code, custom_rate, currency, effective_date, created_at, updated_at
                 FROM client_contract_rates
                 WHERE deleted_at IS NULL`;
    const params = [];

    if (client_id) {
      query += " AND client_id = ?";
      params.push(client_id);
    }
    if (service_code) {
      query += " AND service_code = ?";
      params.push(service_code);
    }

    query += " ORDER BY effective_date DESC, id DESC";
    const [rows] = await getPool().query(query, params);
    return res.json({ ok: true, data: rows });
  } catch (error) {
    return res.status(500).json({ ok: false, message: error.message });
  }
});

router.post("/billing/settings/client-contract-rates", validate(clientRateSchema), async (req, res) => {
  if (!requireAdmin(req, res)) return;
  const payload = req.body;
  try {
    const [result] = await getPool().query(
      `INSERT INTO client_contract_rates
        (client_id, service_code, custom_rate, currency, effective_date)
       VALUES (?, ?, ?, ?, ?)`,
      [
        payload.client_id,
        payload.service_code,
        payload.custom_rate,
        payload.currency,
        payload.effective_date
      ]
    );

    const [rows] = await getPool().query(
      `SELECT id, client_id, service_code, custom_rate, currency, effective_date, created_at, updated_at
       FROM client_contract_rates
       WHERE id = ?`,
      [result.insertId]
    );
    return res.status(201).json({ ok: true, data: rows[0] });
  } catch (error) {
    if (error.code === "ER_DUP_ENTRY") {
      return res.status(409).json({ ok: false, message: "Duplicate contract rate" });
    }
    return res.status(500).json({ ok: false, message: error.message });
  }
});

router.put("/billing/settings/client-contract-rates/:id", validate(clientRateSchema), async (req, res) => {
  if (!requireAdmin(req, res)) return;
  const payload = req.body;
  try {
    const [result] = await getPool().query(
      `UPDATE client_contract_rates
       SET client_id = ?, service_code = ?, custom_rate = ?, currency = ?, effective_date = ?
       WHERE id = ? AND deleted_at IS NULL`,
      [
        payload.client_id,
        payload.service_code,
        payload.custom_rate,
        payload.currency,
        payload.effective_date,
        req.params.id
      ]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ ok: false, message: "Contract rate not found" });
    }

    const [rows] = await getPool().query(
      `SELECT id, client_id, service_code, custom_rate, currency, effective_date, created_at, updated_at
       FROM client_contract_rates
       WHERE id = ? AND deleted_at IS NULL`,
      [req.params.id]
    );
    return res.json({ ok: true, data: rows[0] });
  } catch (error) {
    if (error.code === "ER_DUP_ENTRY") {
      return res.status(409).json({ ok: false, message: "Duplicate contract rate" });
    }
    return res.status(500).json({ ok: false, message: error.message });
  }
});

router.delete("/billing/settings/client-contract-rates/:id", async (req, res) => {
  if (!requireAdmin(req, res)) return;
  try {
    const [result] = await getPool().query(
      "UPDATE client_contract_rates SET deleted_at = NOW() WHERE id = ? AND deleted_at IS NULL",
      [req.params.id]
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({ ok: false, message: "Contract rate not found" });
    }
    return res.json({ ok: true });
  } catch (error) {
    return res.status(500).json({ ok: false, message: error.message });
  }
});

router.get("/billing/settings/exchange-rates", async (req, res) => {
  const { month } = req.query;
  try {
    let query = `SELECT er.id, er.rate_date, er.base_currency, er.quote_currency, er.rate, er.source, er.locked, er.status,
                        er.created_at, er.updated_at,
                        (
                          SELECT COUNT(*)
                          FROM invoices i
                          WHERE i.deleted_at IS NULL
                            AND i.invoice_month IS NOT NULL
                            AND i.fx_rate_thbkrw = er.rate
                        ) AS used_invoice_count
                 FROM exchange_rates er
                 WHERE er.deleted_at IS NULL
                   AND er.base_currency = 'THB'
                   AND er.quote_currency = 'KRW'`;
    const params = [];

    if (month && /^\d{4}-\d{2}$/.test(String(month))) {
      query += " AND DATE_FORMAT(er.rate_date, '%Y-%m') = ?";
      params.push(month);
    }

    query += " ORDER BY er.rate_date DESC, er.id DESC";
    const [rows] = await getPool().query(query, params);
    return res.json({ ok: true, data: rows });
  } catch (error) {
    return res.status(500).json({ ok: false, message: error.message });
  }
});

router.post("/billing/settings/exchange-rates", validate(exchangeRateSchema), async (req, res) => {
  if (!requireAdmin(req, res)) return;
  const payload = req.body;
  const enteredBy = parseCreator(req, payload.entered_by);

  try {
    const [result] = await getPool().query(
      `INSERT INTO exchange_rates
        (rate_date, base_currency, quote_currency, rate, source, locked, status, entered_by)
       VALUES (?, 'THB', 'KRW', ?, ?, ?, ?, ?)`,
      [payload.rate_date, payload.rate, payload.source, payload.locked, payload.status, enteredBy]
    );

    const [rows] = await getPool().query(
      `SELECT id, rate_date, base_currency, quote_currency, rate, source, locked, status, created_at, updated_at,
              0 AS used_invoice_count
       FROM exchange_rates
       WHERE id = ?`,
      [result.insertId]
    );
    return res.status(201).json({ ok: true, data: rows[0] });
  } catch (error) {
    if (error.code === "ER_DUP_ENTRY") {
      return res.status(409).json({ ok: false, message: "Duplicate rate_date for THB/KRW" });
    }
    return res.status(500).json({ ok: false, message: error.message });
  }
});
router.put("/billing/settings/exchange-rates/:id", validate(exchangeRateSchema), async (req, res) => {
  if (!requireAdmin(req, res)) return;
  const payload = req.body;
  try {
    const [rows] = await getPool().query(
      `SELECT id, locked FROM exchange_rates WHERE id = ? AND deleted_at IS NULL LIMIT 1`,
      [req.params.id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ ok: false, message: "Exchange rate not found" });
    }

    const usedCount = await getExchangeRateUsageCount(getPool(), req.params.id);
    if (Number(rows[0].locked) === 1 || usedCount > 0) {
      return res.status(409).json({
        ok: false,
        code: "EXCHANGE_RATE_LOCKED",
        message: "Exchange rate is locked/used by invoices and cannot be modified"
      });
    }

    const [result] = await getPool().query(
      `UPDATE exchange_rates
       SET rate_date = ?, rate = ?, source = ?, locked = ?, status = ?
       WHERE id = ? AND deleted_at IS NULL`,
      [payload.rate_date, payload.rate, payload.source, payload.locked, payload.status, req.params.id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ ok: false, message: "Exchange rate not found" });
    }

    const [updated] = await getPool().query(
      `SELECT id, rate_date, base_currency, quote_currency, rate, source, locked, status, created_at, updated_at,
              0 AS used_invoice_count
       FROM exchange_rates
       WHERE id = ? AND deleted_at IS NULL`,
      [req.params.id]
    );
    return res.json({ ok: true, data: updated[0] });
  } catch (error) {
    if (error.code === "ER_DUP_ENTRY") {
      return res.status(409).json({ ok: false, message: "Duplicate rate_date for THB/KRW" });
    }
    return res.status(500).json({ ok: false, message: error.message });
  }
});

router.delete("/billing/settings/exchange-rates/:id", async (req, res) => {
  if (!requireAdmin(req, res)) return;
  try {
    const [rows] = await getPool().query(
      `SELECT id, locked FROM exchange_rates WHERE id = ? AND deleted_at IS NULL LIMIT 1`,
      [req.params.id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ ok: false, message: "Exchange rate not found" });
    }

    const usedCount = await getExchangeRateUsageCount(getPool(), req.params.id);
    if (Number(rows[0].locked) === 1 || usedCount > 0) {
      return res.status(409).json({
        ok: false,
        code: "EXCHANGE_RATE_LOCKED",
        message: "Exchange rate is locked/used by invoices and cannot be deleted"
      });
    }

    await getPool().query("UPDATE exchange_rates SET deleted_at = NOW() WHERE id = ? AND deleted_at IS NULL", [req.params.id]);
    return res.json({ ok: true });
  } catch (error) {
    return res.status(500).json({ ok: false, message: error.message });
  }
});

router.get("/billing/events", async (req, res) => {
  try {
    const { where, params } = buildBillingEventsWhere(req.query);
    const [rows] = await getPool().query(
      `SELECT be.id, be.event_date, be.client_id, c.client_code, c.name_kr,
              be.service_code, be.qty, be.amount_thb, be.fx_rate_thbkrw, be.amount_krw,
              be.reference_type, be.reference_id, be.status, be.invoice_id
       FROM billing_events be
       JOIN clients c ON c.id = be.client_id
       ${where}
       ORDER BY be.event_date DESC, be.id DESC`,
      params
    );
    return res.json({ ok: true, data: rows });
  } catch (error) {
    return res.status(500).json({ ok: false, message: error.message });
  }
});

router.get("/billing/events/export.csv", async (req, res) => {
  try {
    const { where, params } = buildBillingEventsWhere(req.query);
    const [rows] = await getPool().query(
      `SELECT be.event_date, c.client_code, be.service_code, be.qty, be.amount_thb,
              be.fx_rate_thbkrw, be.amount_krw, be.reference_type, be.reference_id, be.status
       FROM billing_events be
       JOIN clients c ON c.id = be.client_id
       ${where}
       ORDER BY be.event_date DESC, be.id DESC`,
      params
    );

    const header = "event_date,client,service_code,qty,amount_thb,fx_rate_thbkrw,amount_krw,reference_type,reference_id,status";
    const lines = rows.map((r) => {
      const values = [
        r.event_date,
        r.client_code,
        r.service_code,
        r.qty,
        r.amount_thb,
        r.fx_rate_thbkrw,
        r.amount_krw,
        r.reference_type,
        r.reference_id,
        r.status
      ];
      return values
        .map((v) => {
          const s = v === null || v === undefined ? "" : String(v);
          return `"${s.replace(/"/g, "\"\"")}"`;
        })
        .join(",");
    });

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", "attachment; filename=billing_events.csv");
    return res.send([header, ...lines].join("\n"));
  } catch (error) {
    return res.status(500).json({ ok: false, message: error.message });
  }
});

router.post("/billing/events/mark-pending", validate(markPendingSchema), async (req, res) => {
  if (!requireAdmin(req, res)) return;

  try {
    const result = await withTransaction(async (conn) => {
      const ids = req.body.ids;

      const [rows] = await conn.query(
        `SELECT be.id, be.invoice_id, i.status AS invoice_status
         FROM billing_events be
         LEFT JOIN invoices i ON i.id = be.invoice_id AND i.deleted_at IS NULL
         WHERE be.id IN (?) AND be.deleted_at IS NULL
         FOR UPDATE`,
        [ids]
      );

      if (rows.length === 0) {
        return { ok: false, code: "EVENTS_NOT_FOUND", message: "No billing events found" };
      }

      const blocked = rows.filter((r) => ["issued", "paid"].includes(String(r.invoice_status || "").toLowerCase()));
      if (blocked.length > 0) {
        return {
          ok: false,
          code: "EVENTS_LOCKED",
          message: "Cannot mark events pending when linked invoice is ISSUED/PAID"
        };
      }

      await conn.query(
        `UPDATE billing_events
         SET status = 'PENDING', invoice_id = NULL, fx_rate_thbkrw = NULL
         WHERE id IN (?) AND deleted_at IS NULL`,
        [ids]
      );

      return { ok: true, data: { updated: rows.length } };
    });

    if (!result.ok) return res.status(400).json(result);
    return res.json(result);
  } catch (error) {
    return res.status(500).json({ ok: false, message: error.message });
  }
});

router.post("/billing/events", validate(billingEventSchema), async (req, res) => {
  const payload = req.body;
  const amountThb = payload.amount_thb ?? (payload.unit_price_thb ?? 0) * (payload.qty ?? 0);
  const amountKrw = payload.amount_krw ?? (payload.unit_price_krw ?? 0) * (payload.qty ?? 0);

  try {
    const [result] = await getPool().query(
      `INSERT INTO billing_events
        (client_id, service_code, reference_type, reference_id, event_date, qty, pricing_policy, unit_price_thb, amount_thb, unit_price_krw, amount_krw)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        payload.client_id,
        payload.service_code,
        payload.reference_type,
        payload.reference_id || null,
        payload.event_date,
        payload.qty,
        payload.pricing_policy,
        payload.unit_price_thb || null,
        payload.pricing_policy === "THB_BASED" ? amountThb : null,
        payload.unit_price_krw || null,
        payload.pricing_policy === "KRW_FIXED" ? trunc100(amountKrw) : null
      ]
    );

    const [rows] = await getPool().query(
      `SELECT id, client_id, service_code, reference_type, reference_id, event_date, qty, pricing_policy,
              unit_price_thb, amount_thb, unit_price_krw, amount_krw, fx_rate_thbkrw, invoice_id, status, created_at, updated_at
       FROM billing_events
       WHERE id = ?`,
      [result.insertId]
    );
    return res.status(201).json({ ok: true, data: rows[0] });
  } catch (error) {
    return res.status(500).json({ ok: false, message: error.message });
  }
});
router.post("/billing/events/sample", async (req, res) => {
  const clientId = Number(req.body?.client_id || 1);
  const month = String(req.body?.invoice_month || "2026-01");
  const dateA = `${month}-03`;
  const dateB = `${month}-07`;

  try {
    await getPool().query(
      `INSERT INTO billing_events
        (client_id, service_code, reference_type, reference_id, event_date, qty, pricing_policy, unit_price_thb, amount_thb)
       VALUES
        (?, 'TH_SHIPPING', 'SHIPPING', 'SAMPLE-SHP-001', ?, 1, 'THB_BASED', 120, 120),
        (?, 'TH_BOX', 'SHIPPING', 'SAMPLE-BOX-001', ?, 5, 'THB_BASED', 8, 40),
        (?, 'OUTBOUND_FEE', 'OUTBOUND', 'SAMPLE-OUT-001', ?, 3, 'KRW_FIXED', NULL, NULL)`,
      [clientId, dateA, clientId, dateB, clientId, dateB]
    );

    await getPool().query(
      `UPDATE billing_events
       SET unit_price_krw = 3500, amount_krw = 10500
       WHERE client_id = ?
         AND reference_id = 'SAMPLE-OUT-001'
         AND pricing_policy = 'KRW_FIXED'
         AND deleted_at IS NULL
       ORDER BY id DESC
       LIMIT 1`,
      [clientId]
    );

    return res.json({ ok: true, data: { client_id: clientId, invoice_month: month, seeded: true } });
  } catch (error) {
    return res.status(500).json({ ok: false, message: error.message });
  }
});

router.post("/billing/invoices/generate", validate(generateInvoiceSchema), async (req, res) => {
  try {
    const result = await withTransaction(async (conn) => {
      const payload = req.body;
      const createdBy = parseCreator(req, payload.created_by);
      const { from, to } = monthRange(payload.invoice_month);

      const [existingRows] = await conn.query(
        `SELECT id, status
         FROM invoices
         WHERE client_id = ?
           AND invoice_month = ?
           AND deleted_at IS NULL
         ORDER BY id DESC
         LIMIT 1
         FOR UPDATE`,
        [payload.client_id, payload.invoice_month]
      );

      if (existingRows.length > 0) {
        const existing = existingRows[0];
        if (String(existing.status).toLowerCase() !== "draft") {
          return {
            ok: false,
            code: "INVOICE_ALREADY_ISSUED",
            message: "Generation blocked: month already has non-draft invoice. Use admin duplicate action."
          };
        }

        if (!payload.regenerate_draft) {
          return {
            ok: true,
            data: { invoice_id: existing.id, reused: true }
          };
        }

        await conn.query(
          `UPDATE billing_events
           SET status = 'PENDING', invoice_id = NULL, fx_rate_thbkrw = NULL
           WHERE invoice_id = ? AND deleted_at IS NULL`,
          [existing.id]
        );
        await conn.query("UPDATE invoice_items SET deleted_at = NOW() WHERE invoice_id = ? AND deleted_at IS NULL", [existing.id]);
        await conn.query("UPDATE invoices SET deleted_at = NOW() WHERE id = ?", [existing.id]);
      }

      const [fxRows] = await conn.query(
        `SELECT id, rate
         FROM exchange_rates
         WHERE base_currency = 'THB'
           AND quote_currency = 'KRW'
           AND deleted_at IS NULL
           AND status = 'active'
           AND rate_date <= ?
         ORDER BY rate_date DESC, id DESC
         LIMIT 1
         FOR UPDATE`,
        [payload.invoice_date]
      );

      if (fxRows.length === 0) {
        return {
          ok: false,
          code: "FX_NOT_FOUND",
          message: "No active THB->KRW rate found on or before invoice_date"
        };
      }

      const fxRateId = Number(fxRows[0].id);
      const fx = Number(fxRows[0].rate);
      await conn.query("UPDATE exchange_rates SET locked = 1 WHERE id = ?", [fxRateId]);

      const [events] = await conn.query(
        `SELECT id, service_code, qty, pricing_policy, unit_price_thb, amount_thb, unit_price_krw, amount_krw
         FROM billing_events
         WHERE client_id = ?
           AND status = 'PENDING'
           AND deleted_at IS NULL
           AND event_date >= ?
           AND event_date < ?
         ORDER BY id ASC
         FOR UPDATE`,
        [payload.client_id, from, to]
      );

      if (events.length === 0) {
        return {
          ok: false,
          code: "NO_PENDING_EVENTS",
          message: "No pending billing events found for invoice month"
        };
      }

      const yyyymm = payload.invoice_month.replace("-", "");
      const nextSeq = await resolveInvoiceSequence(conn, payload.client_id, yyyymm);
      const invoiceNo = `KRW-${payload.client_id}-${yyyymm}-${String(nextSeq).padStart(4, "0")}`;

      const [invoiceCreated] = await conn.query(
        `INSERT INTO invoices
          (settlement_batch_id, client_id, invoice_month, invoice_no, status, issue_date, invoice_date, due_date, recipient_email,
           currency, fx_rate_thbkrw, subtotal_krw, vat_krw, total_krw, total_amount, created_by)
         VALUES (NULL, ?, ?, ?, 'draft', ?, ?, ?, NULL, 'KRW', ?, 0, 0, 0, 0, ?)`,
        [
          payload.client_id,
          payload.invoice_month,
          invoiceNo,
          payload.invoice_date,
          payload.invoice_date,
          payload.invoice_date,
          fx,
          createdBy
        ]
      );
      const invoiceId = Number(invoiceCreated.insertId);

      const [serviceNameRows] = await conn.query(
        `SELECT service_code, COALESCE(service_name, service_name_kr) AS service_name
         FROM service_catalog
         WHERE deleted_at IS NULL`
      );
      const serviceNameMap = new Map(serviceNameRows.map((row) => [row.service_code, row.service_name]));
      const grouped = new Map();

      for (const event of events) {
        let normalizedAmount = 0;
        if (event.pricing_policy === "THB_BASED") {
          const amountThb =
            event.amount_thb !== null && event.amount_thb !== undefined
              ? Number(event.amount_thb)
              : Number(event.unit_price_thb || 0) * Number(event.qty || 0);
          normalizedAmount = trunc100(amountThb * fx);
        } else {
          const amountKrw =
            event.amount_krw !== null && event.amount_krw !== undefined
              ? Number(event.amount_krw)
              : Number(event.unit_price_krw || 0) * Number(event.qty || 0);
          normalizedAmount = trunc100(amountKrw);
        }

        await conn.query(
          `UPDATE billing_events
           SET amount_krw = ?, fx_rate_thbkrw = ?, status = 'INVOICED', invoice_id = ?
           WHERE id = ?`,
          [normalizedAmount, fx, invoiceId, event.id]
        );

        if (!grouped.has(event.service_code)) {
          grouped.set(event.service_code, { qty: 0, amount_krw: 0 });
        }
        const current = grouped.get(event.service_code);
        current.qty += Number(event.qty || 0);
        current.amount_krw += Number(normalizedAmount);
      }

      let subtotalKrw = 0;
      for (const [serviceCode, agg] of grouped.entries()) {
        const qty = Number(agg.qty);
        const lineAmount = trunc100(Number(agg.amount_krw));
        subtotalKrw += lineAmount;

        const unitDisplay = qty > 0 ? trunc100(lineAmount / qty) : lineAmount;
        await conn.query(
          `INSERT INTO invoice_items
            (invoice_id, service_code, description, qty, unit_price_krw, amount_krw)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [invoiceId, serviceCode, serviceNameMap.get(serviceCode) || serviceCode, qty, unitDisplay, lineAmount]
        );
      }

      subtotalKrw = trunc100(subtotalKrw);
      const vatKrw = trunc100(subtotalKrw * 0.07);
      const totalKrw = trunc100(subtotalKrw + vatKrw);

      await conn.query(
        `INSERT INTO invoice_items
          (invoice_id, service_code, description, qty, unit_price_krw, amount_krw)
         VALUES (?, 'VAT_7', 'VAT 7%', 1, ?, ?)`,
        [invoiceId, vatKrw, vatKrw]
      );

      await conn.query(
        `UPDATE invoices
         SET subtotal_krw = ?, vat_krw = ?, total_krw = ?, total_amount = ?
         WHERE id = ?`,
        [subtotalKrw, vatKrw, totalKrw, totalKrw, invoiceId]
      );

      const [invoiceRows] = await conn.query(
        `SELECT id, client_id, invoice_no, invoice_month, invoice_date, currency, fx_rate_thbkrw,
                subtotal_krw, vat_krw, total_krw, status, created_at, updated_at
         FROM invoices
         WHERE id = ?`,
        [invoiceId]
      );

      return {
        ok: true,
        data: {
          invoice: invoiceRows[0],
          events_count: events.length,
          reused: false,
          fx_rate_id: fxRateId
        }
      };
    });

    if (!result.ok) return res.status(400).json(result);
    return res.json(result);
  } catch (error) {
    return res.status(500).json({ ok: false, message: error.message });
  }
});
router.post("/billing/invoices/:id/issue", async (req, res) => {
  try {
    const result = await withTransaction(async (conn) => {
      const invoiceId = Number(req.params.id);
      const [rows] = await conn.query(
        `SELECT id, status FROM invoices WHERE id = ? AND deleted_at IS NULL LIMIT 1 FOR UPDATE`,
        [invoiceId]
      );
      if (rows.length === 0) return { ok: false, code: "NOT_FOUND", message: "Invoice not found" };
      if (String(rows[0].status).toLowerCase() !== "draft") {
        return { ok: false, code: "INVALID_STATUS", message: "Only DRAFT invoice can be issued" };
      }
      await conn.query("UPDATE invoices SET status = 'issued' WHERE id = ?", [invoiceId]);
      return { ok: true, data: { id: invoiceId, status: "issued" } };
    });
    if (!result.ok) return res.status(400).json(result);
    return res.json(result);
  } catch (error) {
    return res.status(500).json({ ok: false, message: error.message });
  }
});

router.post("/billing/invoices/:id/mark-paid", async (req, res) => {
  try {
    const result = await withTransaction(async (conn) => {
      const invoiceId = Number(req.params.id);
      const [rows] = await conn.query(
        `SELECT id, status FROM invoices WHERE id = ? AND deleted_at IS NULL LIMIT 1 FOR UPDATE`,
        [invoiceId]
      );
      if (rows.length === 0) return { ok: false, code: "NOT_FOUND", message: "Invoice not found" };
      if (String(rows[0].status).toLowerCase() !== "issued") {
        return { ok: false, code: "INVALID_STATUS", message: "Only ISSUED invoice can be marked paid" };
      }
      await conn.query("UPDATE invoices SET status = 'paid' WHERE id = ?", [invoiceId]);
      return { ok: true, data: { id: invoiceId, status: "paid" } };
    });
    if (!result.ok) return res.status(400).json(result);
    return res.json(result);
  } catch (error) {
    return res.status(500).json({ ok: false, message: error.message });
  }
});

router.post("/billing/invoices/:id/duplicate-admin", async (req, res) => {
  if (!requireAdmin(req, res)) return;

  try {
    const result = await withTransaction(async (conn) => {
      const sourceInvoiceId = Number(req.params.id);
      const [invoiceRows] = await conn.query(
        `SELECT id, client_id, invoice_month, status
         FROM invoices
         WHERE id = ? AND deleted_at IS NULL
         LIMIT 1
         FOR UPDATE`,
        [sourceInvoiceId]
      );

      if (invoiceRows.length === 0) {
        return { ok: false, code: "NOT_FOUND", message: "Invoice not found" };
      }

      const source = invoiceRows[0];
      if (String(source.status).toLowerCase() === "draft") {
        return { ok: false, code: "INVALID_STATUS", message: "Use generate/regenerate for draft invoice" };
      }

      const yyyymm = String(source.invoice_month).replace("-", "");
      const nextSeq = await resolveInvoiceSequence(conn, source.client_id, yyyymm);
      const newInvoiceNo = `KRW-${source.client_id}-${yyyymm}-${String(nextSeq).padStart(4, "0")}`;

      const [created] = await conn.query(
        `INSERT INTO invoices
          (settlement_batch_id, client_id, invoice_month, invoice_no, status, issue_date, invoice_date, due_date, recipient_email,
           currency, fx_rate_thbkrw, subtotal_krw, vat_krw, total_krw, total_amount, created_by)
         SELECT NULL, client_id, invoice_month, ?, 'draft', issue_date, invoice_date, due_date, recipient_email,
                'KRW', fx_rate_thbkrw, subtotal_krw, vat_krw, total_krw, total_krw, created_by
         FROM invoices
         WHERE id = ?`,
        [newInvoiceNo, sourceInvoiceId]
      );
      const newInvoiceId = Number(created.insertId);

      await conn.query(
        `INSERT INTO invoice_items (invoice_id, service_code, description, qty, unit_price_krw, amount_krw)
         SELECT ?, service_code, description, qty, unit_price_krw, amount_krw
         FROM invoice_items
         WHERE invoice_id = ? AND deleted_at IS NULL`,
        [newInvoiceId, sourceInvoiceId]
      );

      const [newRows] = await conn.query(
        `SELECT id, invoice_no, status, invoice_month, invoice_date, fx_rate_thbkrw, subtotal_krw, vat_krw, total_krw
         FROM invoices
         WHERE id = ?`,
        [newInvoiceId]
      );

      return { ok: true, data: newRows[0] };
    });

    if (!result.ok) return res.status(400).json(result);
    return res.json(result);
  } catch (error) {
    return res.status(500).json({ ok: false, message: error.message });
  }
});

router.get("/billing/invoices", async (req, res) => {
  const { client_id, invoice_month } = req.query;
  const status = normalizeInvoiceStatus(req.query.status);

  try {
    let query = `SELECT i.id, i.client_id, c.client_code, c.name_kr,
                        i.invoice_no, i.invoice_month, i.invoice_date, i.currency,
                        i.fx_rate_thbkrw, i.subtotal_krw, i.vat_krw, i.total_krw, i.status, i.created_at
                 FROM invoices i
                 JOIN clients c ON c.id = i.client_id
                 WHERE i.deleted_at IS NULL
                   AND i.invoice_month IS NOT NULL`;
    const params = [];

    if (client_id) {
      query += " AND i.client_id = ?";
      params.push(client_id);
    }
    if (invoice_month) {
      query += " AND i.invoice_month = ?";
      params.push(invoice_month);
    }
    if (status) {
      query += " AND i.status = ?";
      params.push(status);
    }

    query += " ORDER BY i.invoice_month DESC, i.id DESC";
    const [rows] = await getPool().query(query, params);
    return res.json({ ok: true, data: rows });
  } catch (error) {
    return res.status(500).json({ ok: false, message: error.message });
  }
});

router.get("/billing/invoices/:id", async (req, res) => {
  try {
    const [invoiceRows] = await getPool().query(
      `SELECT i.id, i.client_id, c.client_code, c.name_kr,
              i.invoice_no, i.invoice_month, i.invoice_date, i.currency,
              i.fx_rate_thbkrw, i.subtotal_krw, i.vat_krw, i.total_krw, i.status, i.created_at, i.updated_at,
              (MOD(i.subtotal_krw, 100) = 0) AS subtotal_trunc100,
              (MOD(i.vat_krw, 100) = 0) AS vat_trunc100,
              (MOD(i.total_krw, 100) = 0) AS total_trunc100
       FROM invoices i
       JOIN clients c ON c.id = i.client_id
       WHERE i.id = ? AND i.deleted_at IS NULL`,
      [req.params.id]
    );

    if (invoiceRows.length === 0) {
      return res.status(404).json({ ok: false, message: "Invoice not found" });
    }

    const [itemRows] = await getPool().query(
      `SELECT id, invoice_id, service_code, description, qty, unit_price_krw, amount_krw, created_at, updated_at,
              (MOD(unit_price_krw, 100) = 0) AS unit_price_trunc100,
              (MOD(amount_krw, 100) = 0) AS amount_trunc100
       FROM invoice_items
       WHERE invoice_id = ? AND deleted_at IS NULL
       ORDER BY id ASC`,
      [req.params.id]
    );

    return res.json({
      ok: true,
      data: {
        invoice: invoiceRows[0],
        items: itemRows
      }
    });
  } catch (error) {
    return res.status(500).json({ ok: false, message: error.message });
  }
});

router.get("/billing/invoices/:id/export-pdf", async (req, res) => {
  try {
    const [invoiceRows] = await getPool().query(
      `SELECT id, invoice_no, invoice_month, total_krw, status
       FROM invoices
       WHERE id = ? AND deleted_at IS NULL`,
      [req.params.id]
    );

    if (invoiceRows.length === 0) {
      return res.status(404).json({ ok: false, message: "Invoice not found" });
    }

    return res.json({
      ok: true,
      data: {
        invoice_id: invoiceRows[0].id,
        invoice_no: invoiceRows[0].invoice_no,
        status: "stub",
        message: "PDF export endpoint is ready. Implement renderer integration next.",
        download_url: null
      }
    });
  } catch (error) {
    return res.status(500).json({ ok: false, message: error.message });
  }
});

module.exports = router;
