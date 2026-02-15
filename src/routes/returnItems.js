const express = require("express");
const { z } = require("zod");
const { getPool } = require("../db");
const { validate } = require("../middleware/validate");
const {
  StockError,
  withTransaction,
  getReturnOrderContext,
  adjustAvailableQty,
  upsertStockTxn,
  softDeleteStockTxn
} = require("../services/stock");

const router = express.Router();

const returnItemSchema = z.object({
  return_order_id: z.coerce.number().int().positive(),
  product_id: z.coerce.number().int().positive(),
  lot_id: z.coerce.number().int().positive(),
  location_id: z.coerce.number().int().positive().nullable().optional(),
  qty_received: z.coerce.number().int().positive(),
  qty_restocked: z.coerce.number().int().min(0).default(0),
  qty_disposed: z.coerce.number().int().min(0).default(0),
  disposition_reason: z.string().max(500).nullable().optional()
});

function isMysqlForeignKey(error) {
  return error && error.code === "ER_NO_REFERENCED_ROW_2";
}

function validateQtyConsistency(body) {
  const received = Number(body.qty_received);
  const restocked = Number(body.qty_restocked || 0);
  const disposed = Number(body.qty_disposed || 0);
  return restocked + disposed <= received;
}

async function validateLotBelongsToProduct(conn, productId, lotId) {
  const [rows] = await conn.query(
    "SELECT id FROM product_lots WHERE id = ? AND product_id = ? AND deleted_at IS NULL",
    [lotId, productId]
  );
  return rows.length > 0;
}

async function getReturnItemWithContext(conn, itemId) {
  const [rows] = await conn.query(
    `SELECT ri.id, ri.return_order_id, ri.product_id, ri.lot_id, ri.location_id, ri.qty_received, ri.qty_restocked, ri.qty_disposed, ri.disposition_reason,
            ro.client_id, ro.warehouse_id, ro.created_by
     FROM return_items ri
     JOIN return_orders ro ON ro.id = ri.return_order_id
     WHERE ri.id = ? AND ri.deleted_at IS NULL`,
    [itemId]
  );
  return rows[0] || null;
}

router.get("/", async (req, res) => {
  const returnOrderId = req.query.return_order_id;
  try {
    let query = `SELECT id, return_order_id, product_id, lot_id, location_id, qty_received, qty_restocked, qty_disposed, disposition_reason, created_at, updated_at
                 FROM return_items
                 WHERE deleted_at IS NULL`;
    const params = [];
    if (returnOrderId) {
      query += " AND return_order_id = ?";
      params.push(returnOrderId);
    }
    query += " ORDER BY id DESC";
    const [rows] = await getPool().query(query, params);
    res.json({ ok: true, data: rows });
  } catch (error) {
    res.status(500).json({ ok: false, message: error.message });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const [rows] = await getPool().query(
      `SELECT id, return_order_id, product_id, lot_id, location_id, qty_received, qty_restocked, qty_disposed, disposition_reason, created_at, updated_at
       FROM return_items
       WHERE id = ? AND deleted_at IS NULL`,
      [req.params.id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ ok: false, message: "Return item not found" });
    }
    res.json({ ok: true, data: rows[0] });
  } catch (error) {
    res.status(500).json({ ok: false, message: error.message });
  }
});

router.post("/", validate(returnItemSchema), async (req, res) => {
  const payload = req.body;
  if (!validateQtyConsistency(payload)) {
    return res.status(400).json({
      ok: false,
      code: "INVALID_QTY_SPLIT",
      message: "qty_restocked + qty_disposed cannot exceed qty_received"
    });
  }

  try {
    const created = await withTransaction(async (conn) => {
      const validLot = await validateLotBelongsToProduct(conn, payload.product_id, payload.lot_id);
      if (!validLot) {
        throw new StockError("INVALID_LOT_PRODUCT", "lot_id does not belong to product_id");
      }

      const order = await getReturnOrderContext(conn, payload.return_order_id);
      if (!order) {
        throw new StockError("INVALID_ORDER", "Invalid return_order_id");
      }

      const [result] = await conn.query(
        `INSERT INTO return_items (return_order_id, product_id, lot_id, location_id, qty_received, qty_restocked, qty_disposed, disposition_reason)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          payload.return_order_id,
          payload.product_id,
          payload.lot_id,
          payload.location_id || null,
          payload.qty_received,
          payload.qty_restocked,
          payload.qty_disposed,
          payload.disposition_reason || null
        ]
      );

      if (Number(payload.qty_restocked) > 0) {
        await adjustAvailableQty(
          conn,
          {
            clientId: order.client_id,
            productId: payload.product_id,
            lotId: payload.lot_id,
            warehouseId: order.warehouse_id,
            locationId: payload.location_id || null
          },
          Number(payload.qty_restocked)
        );
      }

      if (Number(payload.qty_restocked) > 0) {
        await upsertStockTxn(conn, {
          clientId: order.client_id,
          productId: payload.product_id,
          lotId: payload.lot_id,
          warehouseId: order.warehouse_id,
          locationId: payload.location_id || null,
          txnType: "return_restock",
          qtyIn: Number(payload.qty_restocked),
          qtyOut: 0,
          refType: "return_item",
          refId: result.insertId,
          createdBy: order.created_by,
          note: payload.disposition_reason
        });
      }

      if (Number(payload.qty_disposed) > 0) {
        await upsertStockTxn(conn, {
          clientId: order.client_id,
          productId: payload.product_id,
          lotId: payload.lot_id,
          warehouseId: order.warehouse_id,
          locationId: payload.location_id || null,
          txnType: "return_dispose",
          qtyIn: 0,
          qtyOut: Number(payload.qty_disposed),
          refType: "return_item",
          refId: result.insertId,
          createdBy: order.created_by,
          note: payload.disposition_reason
        });
      }

      const [rows] = await conn.query(
        `SELECT id, return_order_id, product_id, lot_id, location_id, qty_received, qty_restocked, qty_disposed, disposition_reason, created_at, updated_at
         FROM return_items
         WHERE id = ?`,
        [result.insertId]
      );
      return rows[0];
    });
    return res.status(201).json({ ok: true, data: created });
  } catch (error) {
    if (isMysqlForeignKey(error)) {
      return res.status(400).json({
        ok: false,
        message: "Invalid return_order_id, product_id, lot_id or location_id"
      });
    }
    if (error instanceof StockError) {
      return res.status(400).json({ ok: false, code: error.code, message: error.message });
    }
    return res.status(500).json({ ok: false, message: error.message });
  }
});

router.put("/:id", validate(returnItemSchema), async (req, res) => {
  const payload = req.body;
  if (!validateQtyConsistency(payload)) {
    return res.status(400).json({
      ok: false,
      code: "INVALID_QTY_SPLIT",
      message: "qty_restocked + qty_disposed cannot exceed qty_received"
    });
  }

  try {
    const updated = await withTransaction(async (conn) => {
      const prev = await getReturnItemWithContext(conn, req.params.id);
      if (!prev) {
        throw new StockError("NOT_FOUND", "Return item not found");
      }

      const validLot = await validateLotBelongsToProduct(conn, payload.product_id, payload.lot_id);
      if (!validLot) {
        throw new StockError("INVALID_LOT_PRODUCT", "lot_id does not belong to product_id");
      }

      const order = await getReturnOrderContext(conn, payload.return_order_id);
      if (!order) {
        throw new StockError("INVALID_ORDER", "Invalid return_order_id");
      }

      if (Number(prev.qty_restocked) > 0) {
        await adjustAvailableQty(
          conn,
          {
            clientId: prev.client_id,
            productId: prev.product_id,
            lotId: prev.lot_id,
            warehouseId: prev.warehouse_id,
            locationId: prev.location_id
          },
          -Number(prev.qty_restocked)
        );
      }

      await conn.query(
        `UPDATE return_items
         SET return_order_id = ?, product_id = ?, lot_id = ?, location_id = ?, qty_received = ?, qty_restocked = ?, qty_disposed = ?, disposition_reason = ?
         WHERE id = ? AND deleted_at IS NULL`,
        [
          payload.return_order_id,
          payload.product_id,
          payload.lot_id,
          payload.location_id || null,
          payload.qty_received,
          payload.qty_restocked,
          payload.qty_disposed,
          payload.disposition_reason || null,
          req.params.id
        ]
      );

      if (Number(payload.qty_restocked) > 0) {
        await adjustAvailableQty(
          conn,
          {
            clientId: order.client_id,
            productId: payload.product_id,
            lotId: payload.lot_id,
            warehouseId: order.warehouse_id,
            locationId: payload.location_id || null
          },
          Number(payload.qty_restocked)
        );
      }

      if (Number(payload.qty_restocked) > 0) {
        await upsertStockTxn(conn, {
          clientId: order.client_id,
          productId: payload.product_id,
          lotId: payload.lot_id,
          warehouseId: order.warehouse_id,
          locationId: payload.location_id || null,
          txnType: "return_restock",
          qtyIn: Number(payload.qty_restocked),
          qtyOut: 0,
          refType: "return_item",
          refId: Number(req.params.id),
          createdBy: order.created_by,
          note: payload.disposition_reason
        });
      } else {
        await softDeleteStockTxn(conn, "return_restock", "return_item", req.params.id);
      }

      if (Number(payload.qty_disposed) > 0) {
        await upsertStockTxn(conn, {
          clientId: order.client_id,
          productId: payload.product_id,
          lotId: payload.lot_id,
          warehouseId: order.warehouse_id,
          locationId: payload.location_id || null,
          txnType: "return_dispose",
          qtyIn: 0,
          qtyOut: Number(payload.qty_disposed),
          refType: "return_item",
          refId: Number(req.params.id),
          createdBy: order.created_by,
          note: payload.disposition_reason
        });
      } else {
        await softDeleteStockTxn(conn, "return_dispose", "return_item", req.params.id);
      }

      const [rows] = await conn.query(
        `SELECT id, return_order_id, product_id, lot_id, location_id, qty_received, qty_restocked, qty_disposed, disposition_reason, created_at, updated_at
         FROM return_items
         WHERE id = ?`,
        [req.params.id]
      );
      return rows[0];
    });
    return res.json({ ok: true, data: updated });
  } catch (error) {
    if (isMysqlForeignKey(error)) {
      return res.status(400).json({
        ok: false,
        message: "Invalid return_order_id, product_id, lot_id or location_id"
      });
    }
    if (error instanceof StockError) {
      const status = error.code === "NOT_FOUND" ? 404 : 400;
      return res.status(status).json({ ok: false, code: error.code, message: error.message });
    }
    return res.status(500).json({ ok: false, message: error.message });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    await withTransaction(async (conn) => {
      const prev = await getReturnItemWithContext(conn, req.params.id);
      if (!prev) {
        throw new StockError("NOT_FOUND", "Return item not found");
      }

      if (Number(prev.qty_restocked) > 0) {
        await adjustAvailableQty(
          conn,
          {
            clientId: prev.client_id,
            productId: prev.product_id,
            lotId: prev.lot_id,
            warehouseId: prev.warehouse_id,
            locationId: prev.location_id
          },
          -Number(prev.qty_restocked)
        );
      }

      await conn.query(
        "UPDATE return_items SET deleted_at = NOW() WHERE id = ? AND deleted_at IS NULL",
        [req.params.id]
      );
      await softDeleteStockTxn(conn, "return_restock", "return_item", req.params.id);
      await softDeleteStockTxn(conn, "return_dispose", "return_item", req.params.id);
    });
    return res.json({ ok: true });
  } catch (error) {
    if (error instanceof StockError) {
      const status = error.code === "NOT_FOUND" ? 404 : 400;
      return res.status(status).json({ ok: false, code: error.code, message: error.message });
    }
    return res.status(500).json({ ok: false, message: error.message });
  }
});

module.exports = router;
