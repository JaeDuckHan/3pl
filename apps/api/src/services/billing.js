async function resolveActivePricePolicy(conn, clientId, orderDate) {
  const [rows] = await conn.query(
    `SELECT pp.id, pp.service_id, pp.unit_price, pp.currency, sc.billing_basis
     FROM price_policies pp
     JOIN service_catalog sc ON sc.id = pp.service_id
     WHERE pp.client_id = ?
       AND pp.status = 'active'
       AND pp.deleted_at IS NULL
       AND sc.status = 'active'
       AND sc.deleted_at IS NULL
       AND pp.effective_from <= ?
       AND (pp.effective_to IS NULL OR pp.effective_to >= ?)
     ORDER BY pp.effective_from DESC, pp.id DESC
     LIMIT 1`,
    [clientId, orderDate, orderDate]
  );
  return rows[0] || null;
}

function calcAmountByBasis(basis, payload) {
  const qty = Number(payload.qty || 0);
  const boxCount = Number(payload.boxCount || 0);

  if (basis === "QTY") return { qty, boxCount, basisUnits: qty };
  if (basis === "BOX") return { qty, boxCount, basisUnits: boxCount };
  if (basis === "ORDER") return { qty, boxCount, basisUnits: 1 };
  return { qty, boxCount, basisUnits: 0 };
}

async function upsertOutboundServiceEvent(conn, params) {
  const {
    clientId,
    outboundOrderId,
    stockTransactionId,
    orderDate,
    qty,
    boxCount,
    remark
  } = params;

  const policy = await resolveActivePricePolicy(conn, clientId, orderDate);
  if (!policy) {
    return null;
  }

  const { qty: qtyApplied, boxCount: boxApplied, basisUnits } = calcAmountByBasis(
    policy.billing_basis,
    { qty, boxCount }
  );
  const unitPrice = Number(policy.unit_price);
  const amount = Number((unitPrice * basisUnits).toFixed(4));

  const [existing] = await conn.query(
    `SELECT id
     FROM service_events
     WHERE source_type = 'outbound_shipped'
       AND stock_transaction_id = ?
     LIMIT 1`,
    [stockTransactionId]
  );

  if (existing.length === 0) {
    const [result] = await conn.query(
      `INSERT INTO service_events
        (client_id, service_id, outbound_order_id, stock_transaction_id, event_date, source_type, basis_applied, qty, box_count, unit_price, amount, currency, remark)
       VALUES (?, ?, ?, ?, NOW(), 'outbound_shipped', ?, ?, ?, ?, ?, ?, ?)`,
      [
        clientId,
        policy.service_id,
        outboundOrderId,
        stockTransactionId,
        policy.billing_basis,
        qtyApplied,
        boxApplied,
        unitPrice,
        amount,
        policy.currency,
        remark || null
      ]
    );
    return result.insertId;
  }

  await conn.query(
    `UPDATE service_events
     SET client_id = ?, service_id = ?, outbound_order_id = ?, event_date = NOW(),
         basis_applied = ?, qty = ?, box_count = ?, unit_price = ?, amount = ?, currency = ?, remark = ?, deleted_at = NULL
     WHERE id = ?`,
    [
      clientId,
      policy.service_id,
      outboundOrderId,
      policy.billing_basis,
      qtyApplied,
      boxApplied,
      unitPrice,
      amount,
      policy.currency,
      remark || null,
      existing[0].id
    ]
  );
  return existing[0].id;
}

async function softDeleteOutboundServiceEvent(conn, stockTransactionId) {
  await conn.query(
    `UPDATE service_events
     SET deleted_at = NOW()
     WHERE source_type = 'outbound_shipped'
       AND stock_transaction_id = ?
       AND deleted_at IS NULL`,
    [stockTransactionId]
  );
}

module.exports = {
  upsertOutboundServiceEvent,
  softDeleteOutboundServiceEvent
};
