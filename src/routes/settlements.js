const express = require("express");
const { z } = require("zod");
const { getPool } = require("../db");
const { validate } = require("../middleware/validate");
const { withTransaction } = require("../services/stock");

const router = express.Router();

const generateSchema = z.object({
  client_id: z.coerce.number().int().positive(),
  billing_month: z.string().regex(/^\d{4}-\d{2}$/),
  created_by: z.coerce.number().int().positive(),
  exchange_rate_id: z.coerce.number().int().positive().nullable().optional(),
  is_provisional: z.coerce.number().int().min(0).max(1).default(1)
});

const issueInvoiceSchema = z.object({
  settlement_batch_id: z.coerce.number().int().positive(),
  issue_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  recipient_email: z.string().email().nullable().optional(),
  created_by: z.coerce.number().int().positive()
});

const closeBatchSchema = z.object({
  closed_by: z.coerce.number().int().positive(),
  reason: z.string().max(2000).nullable().optional()
});

const reopenRequestSchema = z.object({
  requested_by: z.coerce.number().int().positive(),
  reason: z.string().min(1).max(2000)
});

const reopenDecisionSchema = z.object({
  approved_by: z.coerce.number().int().positive(),
  reason: z.string().max(2000).nullable().optional()
});

function monthRange(billingMonth) {
  const from = `${billingMonth}-01`;
  const [y, m] = billingMonth.split("-").map(Number);
  const next = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`;
  return { from, to: next };
}

async function resolveFx(conn, payload, rangeTo) {
  if (payload.exchange_rate_id) {
    const [rows] = await conn.query(
      `SELECT id, base_currency, quote_currency, rate
       FROM exchange_rates
       WHERE id = ? AND status = 'active' AND deleted_at IS NULL
       LIMIT 1`,
      [payload.exchange_rate_id]
    );
    return rows[0] || null;
  }

  const [rows] = await conn.query(
    `SELECT id, base_currency, quote_currency, rate
     FROM exchange_rates
     WHERE status = 'active'
       AND deleted_at IS NULL
       AND base_currency = 'THB'
       AND quote_currency = 'KRW'
       AND rate_date < ?
     ORDER BY rate_date DESC, id DESC
     LIMIT 1`,
    [rangeTo]
  );
  return rows[0] || null;
}

router.post("/settlement-batches/generate", validate(generateSchema), async (req, res) => {
  try {
    const result = await withTransaction(async (conn) => {
      const payload = req.body;
      const range = monthRange(payload.billing_month);

      const fx = await resolveFx(conn, payload, range.to);
      if (!fx) {
        return {
          ok: false,
          code: "FX_NOT_FOUND",
          message: "Active THB->KRW exchange rate not found for this period"
        };
      }

      const [existing] = await conn.query(
        `SELECT id
         FROM settlement_batches
         WHERE client_id = ? AND billing_month = ? AND deleted_at IS NULL
         LIMIT 1`,
        [payload.client_id, payload.billing_month]
      );

      let batchId;
      if (existing.length === 0) {
        const [created] = await conn.query(
          `INSERT INTO settlement_batches
            (client_id, billing_month, exchange_rate_id, status, is_provisional, created_by)
           VALUES (?, ?, ?, 'calculating', ?, ?)`,
          [payload.client_id, payload.billing_month, fx.id, payload.is_provisional, payload.created_by]
        );
        batchId = created.insertId;
      } else {
        batchId = existing[0].id;
        await conn.query(
          `UPDATE settlement_batches
           SET exchange_rate_id = ?, status = 'calculating', is_provisional = ?, created_by = ?, deleted_at = NULL
           WHERE id = ?`,
          [fx.id, payload.is_provisional, payload.created_by, batchId]
        );
        await conn.query(
          "UPDATE settlement_lines SET deleted_at = NOW() WHERE settlement_batch_id = ? AND deleted_at IS NULL",
          [batchId]
        );
      }

      const [events] = await conn.query(
        `SELECT se.id, se.service_id, se.basis_applied, se.qty, se.unit_price, se.currency, se.amount, se.remark, sc.service_name_kr
         FROM service_events se
         LEFT JOIN service_catalog sc ON sc.id = se.service_id
         WHERE se.client_id = ?
           AND se.deleted_at IS NULL
           AND se.event_date >= ?
           AND se.event_date < ?`,
        [payload.client_id, range.from, range.to]
      );

      let krwSubtotal = 0;
      let thbSubtotal = 0;

      for (const ev of events) {
        const amount = Number(ev.amount || 0);
        if (ev.currency === "KRW") krwSubtotal += amount;
        if (ev.currency === "THB") thbSubtotal += amount;

        await conn.query(
          `INSERT INTO settlement_lines
            (settlement_batch_id, service_id, line_type, description, basis, qty, unit_price, currency, amount, extra_amount, total_amount, source_service_event_id)
           VALUES (?, ?, 'service', ?, ?, ?, ?, ?, ?, 0, ?, ?)`,
          [
            batchId,
            ev.service_id,
            ev.service_name_kr || "Service",
            ev.basis_applied,
            ev.qty,
            ev.unit_price,
            ev.currency,
            amount,
            amount,
            ev.id
          ]
        );
      }

      const totalKrw = Number((krwSubtotal + thbSubtotal * Number(fx.rate)).toFixed(4));
      await conn.query(
        `UPDATE settlement_batches
         SET krw_subtotal = ?, thb_subtotal = ?, total_krw = ?, status = 'reviewed'
         WHERE id = ?`,
        [krwSubtotal, thbSubtotal, totalKrw, batchId]
      );

      const [batchRows] = await conn.query(
        `SELECT id, client_id, billing_month, exchange_rate_id, status, is_provisional, krw_subtotal, thb_subtotal, total_krw, created_at, updated_at
         FROM settlement_batches
         WHERE id = ?`,
        [batchId]
      );

      return {
        ok: true,
        data: {
          batch: batchRows[0],
          lines_count: events.length
        }
      };
    });

    if (!result.ok) {
      return res.status(400).json(result);
    }
    return res.json(result);
  } catch (error) {
    return res.status(500).json({ ok: false, message: error.message });
  }
});

router.get("/settlement-batches/:id", async (req, res) => {
  try {
    const [batchRows] = await getPool().query(
      `SELECT id, client_id, billing_month, exchange_rate_id, status, is_provisional, krw_subtotal, thb_subtotal, total_krw, created_at, updated_at
       FROM settlement_batches
       WHERE id = ? AND deleted_at IS NULL`,
      [req.params.id]
    );
    if (batchRows.length === 0) {
      return res.status(404).json({ ok: false, message: "Settlement batch not found" });
    }

    const [lineRows] = await getPool().query(
      `SELECT id, settlement_batch_id, service_id, line_type, description, basis, qty, unit_price, currency, amount, extra_amount, total_amount, source_service_event_id, created_at, updated_at
       FROM settlement_lines
       WHERE settlement_batch_id = ? AND deleted_at IS NULL
       ORDER BY id ASC`,
      [req.params.id]
    );

    return res.json({
      ok: true,
      data: {
        batch: batchRows[0],
        lines: lineRows
      }
    });
  } catch (error) {
    return res.status(500).json({ ok: false, message: error.message });
  }
});

router.post("/invoices/issue", validate(issueInvoiceSchema), async (req, res) => {
  try {
    const result = await withTransaction(async (conn) => {
      const payload = req.body;

      const [batchRows] = await conn.query(
        `SELECT id, client_id, billing_month, total_krw
         FROM settlement_batches
         WHERE id = ? AND deleted_at IS NULL
         LIMIT 1`,
        [payload.settlement_batch_id]
      );
      if (batchRows.length === 0) {
        return { ok: false, code: "BATCH_NOT_FOUND", message: "Settlement batch not found" };
      }
      const batch = batchRows[0];

      const [existingInvoice] = await conn.query(
        `SELECT id, invoice_no, status, issue_date, due_date, recipient_email, currency, total_amount
         FROM invoices
         WHERE settlement_batch_id = ? AND deleted_at IS NULL
         LIMIT 1`,
        [batch.id]
      );
      if (existingInvoice.length > 0) {
        return {
          ok: true,
          data: {
            invoice: existingInvoice[0],
            lines_count: 0,
            reused: true
          }
        };
      }

      const yyyymm = String(batch.billing_month).replace("-", "");
      const [seqRows] = await conn.query(
        `SELECT id, last_seq
         FROM invoice_sequences
         WHERE client_id = ? AND yyyymm = ? AND deleted_at IS NULL
         LIMIT 1
         FOR UPDATE`,
        [batch.client_id, yyyymm]
      );

      let nextSeq;
      if (seqRows.length === 0) {
        nextSeq = 1;
        await conn.query(
          `INSERT INTO invoice_sequences (client_id, yyyymm, last_seq)
           VALUES (?, ?, ?)`,
          [batch.client_id, yyyymm, nextSeq]
        );
      } else {
        nextSeq = Number(seqRows[0].last_seq) + 1;
        await conn.query(
          "UPDATE invoice_sequences SET last_seq = ? WHERE id = ?",
          [nextSeq, seqRows[0].id]
        );
      }

      const invoiceNo = `INV-${batch.client_id}-${yyyymm}-${String(nextSeq).padStart(4, "0")}`;

      const [invoiceCreated] = await conn.query(
        `INSERT INTO invoices
          (settlement_batch_id, client_id, invoice_no, status, issue_date, due_date, recipient_email, currency, total_amount, created_by)
         VALUES (?, ?, ?, 'issued', ?, ?, ?, 'KRW', ?, ?)`,
        [
          batch.id,
          batch.client_id,
          invoiceNo,
          payload.issue_date,
          payload.due_date,
          payload.recipient_email || null,
          batch.total_krw,
          payload.created_by
        ]
      );
      const invoiceId = invoiceCreated.insertId;

      const [settlementLines] = await conn.query(
        `SELECT id, service_id, line_type, description, qty, basis, currency, unit_price, amount, extra_amount, total_amount
         FROM settlement_lines
         WHERE settlement_batch_id = ? AND deleted_at IS NULL
         ORDER BY id ASC`,
        [batch.id]
      );

      for (const line of settlementLines) {
        await conn.query(
          `INSERT INTO invoice_lines
            (invoice_id, settlement_line_id, service_id, line_type, description, qty, unit, currency, unit_price, amount, extra_amount, total_amount)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            invoiceId,
            line.id,
            line.service_id,
            line.line_type,
            line.description,
            line.qty,
            line.basis,
            line.currency,
            line.unit_price,
            line.amount,
            line.extra_amount,
            line.total_amount
          ]
        );
      }

      const [invoiceRows] = await conn.query(
        `SELECT id, settlement_batch_id, client_id, invoice_no, status, issue_date, due_date, recipient_email, currency, total_amount, created_at, updated_at
         FROM invoices
         WHERE id = ?`,
        [invoiceId]
      );

      return {
        ok: true,
        data: {
          invoice: invoiceRows[0],
          lines_count: settlementLines.length,
          reused: false
        }
      };
    });

    if (!result.ok) {
      return res.status(400).json(result);
    }
    return res.json(result);
  } catch (error) {
    return res.status(500).json({ ok: false, message: error.message });
  }
});

router.get("/invoices/:id", async (req, res) => {
  try {
    const [invoiceRows] = await getPool().query(
      `SELECT id, settlement_batch_id, client_id, invoice_no, status, issue_date, due_date, recipient_email, currency, total_amount, created_at, updated_at
       FROM invoices
       WHERE id = ? AND deleted_at IS NULL`,
      [req.params.id]
    );
    if (invoiceRows.length === 0) {
      return res.status(404).json({ ok: false, message: "Invoice not found" });
    }

    const [lineRows] = await getPool().query(
      `SELECT id, invoice_id, settlement_line_id, service_id, line_type, description, qty, unit, currency, unit_price, amount, extra_amount, total_amount, created_at, updated_at
       FROM invoice_lines
       WHERE invoice_id = ? AND deleted_at IS NULL
       ORDER BY id ASC`,
      [req.params.id]
    );

    return res.json({
      ok: true,
      data: {
        invoice: invoiceRows[0],
        lines: lineRows
      }
    });
  } catch (error) {
    return res.status(500).json({ ok: false, message: error.message });
  }
});

router.post(
  "/settlement-batches/:id/close",
  validate(closeBatchSchema),
  async (req, res) => {
    try {
      const result = await withTransaction(async (conn) => {
        const batchId = Number(req.params.id);
        const payload = req.body;

        const [rows] = await conn.query(
          `SELECT id, status
           FROM settlement_batches
           WHERE id = ? AND deleted_at IS NULL
           LIMIT 1
           FOR UPDATE`,
          [batchId]
        );
        if (rows.length === 0) {
          return {
            ok: false,
            code: "BATCH_NOT_FOUND",
            message: "Settlement batch not found"
          };
        }

        if (rows[0].status === "closed") {
          return {
            ok: false,
            code: "ALREADY_CLOSED",
            message: "Settlement batch is already closed"
          };
        }

        if (!["reviewed", "open"].includes(rows[0].status)) {
          return {
            ok: false,
            code: "INVALID_STATUS",
            message: "Only reviewed/open batch can be closed"
          };
        }

        await conn.query(
          `UPDATE settlement_batches
           SET status = 'closed', closed_at = NOW(), closed_by = ?
           WHERE id = ?`,
          [payload.closed_by, batchId]
        );

        await conn.query(
          `INSERT INTO settlement_reopen_logs
            (settlement_batch_id, request_id, actor_id, action, reason, acted_at)
           VALUES (?, NULL, ?, 'close', ?, NOW())`,
          [batchId, payload.closed_by, payload.reason || null]
        );

        const [batchRows] = await conn.query(
          `SELECT id, status, closed_at, closed_by, updated_at
           FROM settlement_batches
           WHERE id = ?`,
          [batchId]
        );

        return { ok: true, data: batchRows[0] };
      });

      if (!result.ok) {
        return res.status(400).json(result);
      }
      return res.json(result);
    } catch (error) {
      return res.status(500).json({ ok: false, message: error.message });
    }
  }
);

router.post(
  "/settlement-batches/:id/reopen-requests",
  validate(reopenRequestSchema),
  async (req, res) => {
    try {
      const result = await withTransaction(async (conn) => {
        const batchId = Number(req.params.id);
        const payload = req.body;

        const [batchRows] = await conn.query(
          `SELECT id, status
           FROM settlement_batches
           WHERE id = ? AND deleted_at IS NULL
           LIMIT 1
           FOR UPDATE`,
          [batchId]
        );
        if (batchRows.length === 0) {
          return {
            ok: false,
            code: "BATCH_NOT_FOUND",
            message: "Settlement batch not found"
          };
        }

        if (batchRows[0].status !== "closed") {
          return {
            ok: false,
            code: "INVALID_STATUS",
            message: "Only closed batch can request reopen"
          };
        }

        const [pendingRows] = await conn.query(
          `SELECT id
           FROM settlement_reopen_requests
           WHERE settlement_batch_id = ? AND status = 'requested' AND deleted_at IS NULL
           LIMIT 1`,
          [batchId]
        );
        if (pendingRows.length > 0) {
          return {
            ok: false,
            code: "REQUEST_EXISTS",
            message: "Pending reopen request already exists"
          };
        }

        const [created] = await conn.query(
          `INSERT INTO settlement_reopen_requests
            (settlement_batch_id, requested_by, reason, status)
           VALUES (?, ?, ?, 'requested')`,
          [batchId, payload.requested_by, payload.reason]
        );

        const [rows] = await conn.query(
          `SELECT id, settlement_batch_id, requested_by, reason, status, approved_by, approved_at, created_at, updated_at
           FROM settlement_reopen_requests
           WHERE id = ?`,
          [created.insertId]
        );
        return { ok: true, data: rows[0] };
      });

      if (!result.ok) {
        return res.status(400).json(result);
      }
      return res.status(201).json(result);
    } catch (error) {
      return res.status(500).json({ ok: false, message: error.message });
    }
  }
);

router.get("/settlement-batches/:id/reopen-requests", async (req, res) => {
  try {
    const [rows] = await getPool().query(
      `SELECT id, settlement_batch_id, requested_by, reason, status, approved_by, approved_at, created_at, updated_at
       FROM settlement_reopen_requests
       WHERE settlement_batch_id = ? AND deleted_at IS NULL
       ORDER BY id DESC`,
      [req.params.id]
    );
    return res.json({ ok: true, data: rows });
  } catch (error) {
    return res.status(500).json({ ok: false, message: error.message });
  }
});

router.post(
  "/settlement-reopen-requests/:id/approve",
  validate(reopenDecisionSchema),
  async (req, res) => {
    try {
      const result = await withTransaction(async (conn) => {
        const requestId = Number(req.params.id);
        const payload = req.body;

        const [reqRows] = await conn.query(
          `SELECT id, settlement_batch_id, reason, status
           FROM settlement_reopen_requests
           WHERE id = ? AND deleted_at IS NULL
           LIMIT 1
           FOR UPDATE`,
          [requestId]
        );
        if (reqRows.length === 0) {
          return {
            ok: false,
            code: "REQUEST_NOT_FOUND",
            message: "Reopen request not found"
          };
        }

        if (reqRows[0].status !== "requested") {
          return {
            ok: false,
            code: "INVALID_STATUS",
            message: "Only requested status can be approved"
          };
        }

        await conn.query(
          `UPDATE settlement_reopen_requests
           SET status = 'approved', approved_by = ?, approved_at = NOW()
           WHERE id = ?`,
          [payload.approved_by, requestId]
        );

        await conn.query(
          `UPDATE settlement_batches
           SET status = 'reviewed', closed_at = NULL, closed_by = NULL
           WHERE id = ?`,
          [reqRows[0].settlement_batch_id]
        );

        await conn.query(
          `INSERT INTO settlement_reopen_logs
            (settlement_batch_id, request_id, actor_id, action, reason, acted_at)
           VALUES (?, ?, ?, 'reopen', ?, NOW())`,
          [
            reqRows[0].settlement_batch_id,
            requestId,
            payload.approved_by,
            payload.reason || reqRows[0].reason || null
          ]
        );

        const [rows] = await conn.query(
          `SELECT id, settlement_batch_id, requested_by, reason, status, approved_by, approved_at, created_at, updated_at
           FROM settlement_reopen_requests
           WHERE id = ?`,
          [requestId]
        );
        return { ok: true, data: rows[0] };
      });

      if (!result.ok) {
        return res.status(400).json(result);
      }
      return res.json(result);
    } catch (error) {
      return res.status(500).json({ ok: false, message: error.message });
    }
  }
);

router.post(
  "/settlement-reopen-requests/:id/reject",
  validate(reopenDecisionSchema),
  async (req, res) => {
    try {
      const result = await withTransaction(async (conn) => {
        const requestId = Number(req.params.id);
        const payload = req.body;

        const [reqRows] = await conn.query(
          `SELECT id, settlement_batch_id, status
           FROM settlement_reopen_requests
           WHERE id = ? AND deleted_at IS NULL
           LIMIT 1
           FOR UPDATE`,
          [requestId]
        );
        if (reqRows.length === 0) {
          return {
            ok: false,
            code: "REQUEST_NOT_FOUND",
            message: "Reopen request not found"
          };
        }

        if (reqRows[0].status !== "requested") {
          return {
            ok: false,
            code: "INVALID_STATUS",
            message: "Only requested status can be rejected"
          };
        }

        await conn.query(
          `UPDATE settlement_reopen_requests
           SET status = 'rejected', approved_by = ?, approved_at = NOW()
           WHERE id = ?`,
          [payload.approved_by, requestId]
        );

        const [rows] = await conn.query(
          `SELECT id, settlement_batch_id, requested_by, reason, status, approved_by, approved_at, created_at, updated_at
           FROM settlement_reopen_requests
           WHERE id = ?`,
          [requestId]
        );
        return { ok: true, data: rows[0] };
      });

      if (!result.ok) {
        return res.status(400).json(result);
      }
      return res.json(result);
    } catch (error) {
      return res.status(500).json({ ok: false, message: error.message });
    }
  }
);

router.get("/settlement-batches/:id/reopen-logs", async (req, res) => {
  try {
    const [rows] = await getPool().query(
      `SELECT id, settlement_batch_id, request_id, actor_id, action, reason, acted_at, created_at, updated_at
       FROM settlement_reopen_logs
       WHERE settlement_batch_id = ? AND deleted_at IS NULL
       ORDER BY id DESC`,
      [req.params.id]
    );
    return res.json({ ok: true, data: rows });
  } catch (error) {
    return res.status(500).json({ ok: false, message: error.message });
  }
});

module.exports = router;
