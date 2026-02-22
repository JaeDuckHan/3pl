import { getOutboundByNo, outboundOrdersMock } from "@/features/outbounds/mock";
import type {
  OutboundAction,
  OutboundBox,
  OutboundItem,
  OutboundListQuery,
  OutboundOrder,
  OutboundStatus,
  OutboundTimeline,
} from "@/features/outbound/types";
import { AUTH_COOKIE_KEY } from "@/lib/auth";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3100";
const USE_MOCK = process.env.NEXT_PUBLIC_USE_MOCK !== "false";
const LATENCY_MS = 120;

type RequestOptions = {
  token?: string;
};

type AuthRequestOptions = RequestOptions & {
  allowAnonymous?: boolean;
};

type RawOutboundOrder = {
  id: number;
  outbound_no: string;
  client_id: number;
  warehouse_id: number;
  order_date: string;
  sales_channel: string | null;
  order_no: string | null;
  tracking_no: string | null;
  status: OutboundStatus;
  packed_at: string | null;
  shipped_at: string | null;
  created_by: number;
  created_at: string;
  updated_at: string;
};

type RawOutboundItem = {
  id: number;
  outbound_order_id: number;
  product_id: number;
  lot_id: number;
  location_id: number | null;
  qty: number;
  box_type: string | null;
  box_count: number;
  remark: string | null;
  created_at: string;
  updated_at: string;
};

type RawClient = {
  id: number;
  name_kr: string;
};

type RawProduct = {
  id: number;
  barcode_full: string;
  name_kr: string;
};

type RawLot = {
  id: number;
  lot_no: string;
};

type RawStockBalance = {
  product_id: number;
  lot_id: number;
  location_id: number | null;
  available_qty: number;
};

type RawOutboundBox = {
  id: number;
  outbound_order_id: number;
  box_no: string;
  courier: string | null;
  tracking_no: string | null;
  item_count: number;
  status: "open" | "packed" | "shipped";
  created_at: string;
  updated_at: string;
};

type RawOutboundLog = {
  id: number;
  action: string;
  from_status: string | null;
  to_status: string | null;
  note: string | null;
  actor_user_id: number | null;
  actor_email: string | null;
  actor_name: string | null;
  created_at: string;
};

type JsonResponse<T> = {
  ok: boolean;
  data?: T;
  message?: string;
};

export class ApiError extends Error {
  status: number;

  constructor(message: string, status = 500) {
    super(message);
    this.status = status;
  }
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function toDateOnly(value: string | null | undefined): string {
  if (!value) return new Date().toISOString().slice(0, 10);
  const trimmed = value.trim();
  const matched = trimmed.match(/^(\d{4}-\d{2}-\d{2})/);
  if (matched) return matched[1];

  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) {
    return new Date().toISOString().slice(0, 10);
  }
  return parsed.toISOString().slice(0, 10);
}

function toIsoDateTime(value: string | null | undefined): string | null {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}

async function resolveToken(input?: string): Promise<string | undefined> {
  if (input) return input;
  if (typeof window !== "undefined") {
    const tokenCookie = document.cookie
      .split("; ")
      .find((entry) => entry.startsWith(`${AUTH_COOKIE_KEY}=`));
    if (tokenCookie) return decodeURIComponent(tokenCookie.split("=")[1]);

    const tokenLocal = localStorage.getItem(AUTH_COOKIE_KEY) ?? undefined;
    if (tokenLocal) return tokenLocal;
  }
  return undefined;
}

async function requestJson<T>(
  path: string,
  init?: RequestInit,
  options?: AuthRequestOptions
): Promise<T> {
  const token = await resolveToken(options?.token);
  if (!token && !options?.allowAnonymous) {
    throw new ApiError("Missing auth token", 401);
  }

  const endpoint =
    typeof window === "undefined" ? `${API_BASE_URL}${path}` : `/api/proxy${path}`;

  const response = await fetch(endpoint, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  });

  const json = (await response.json()) as JsonResponse<T>;
  if (!response.ok || !json.ok) {
    throw new ApiError(json.message ?? "Request failed", response.status);
  }

  if (json.data === undefined) {
    throw new ApiError("Missing response data", response.status);
  }

  return json.data;
}

function cloneOrder(order: OutboundOrder): OutboundOrder {
  return JSON.parse(JSON.stringify(order)) as OutboundOrder;
}

function applyListFilter(orders: OutboundOrder[], query?: OutboundListQuery): OutboundOrder[] {
  const q = query?.q?.trim().toLowerCase();
  const status = query?.status ?? "all";
  return orders.filter((order) => {
    const matchStatus = status === "all" ? true : order.status === status;
    const matchText =
      !q ||
      order.outbound_no.toLowerCase().includes(q) ||
      order.client.toLowerCase().includes(q) ||
      order.summary.toLowerCase().includes(q);
    return matchStatus && matchText;
  });
}

function mapMockActionStatus(action: OutboundAction): OutboundStatus {
  if (action === "allocate") return "allocated";
  if (action === "pack") return "packed";
  return "shipped";
}

function buildTimeline(order: RawOutboundOrder): OutboundTimeline[] {
  const timeline: OutboundTimeline[] = [
    {
      id: `tl-created-${order.id}`,
      type: "created",
      title: "Order Created",
      at: order.created_at.slice(0, 16).replace("T", " "),
      actor: `user-${order.created_by}`,
    },
  ];

  if (["allocated", "picking", "packing", "packed", "shipped", "delivered"].includes(order.status)) {
    timeline.push({
      id: `tl-allocated-${order.id}`,
      type: "allocated",
      title: "Stock Allocated",
      at: order.updated_at.slice(0, 16).replace("T", " "),
      actor: "system",
    });
  }

  if (order.packed_at || ["packed", "shipped", "delivered"].includes(order.status)) {
    timeline.push({
      id: `tl-packed-${order.id}`,
      type: "packed",
      title: "Packing Completed",
      at: (order.packed_at ?? order.updated_at).slice(0, 16).replace("T", " "),
      actor: "system",
    });
  }

  if (order.shipped_at || ["shipped", "delivered"].includes(order.status)) {
    timeline.push({
      id: `tl-shipped-${order.id}`,
      type: "shipped",
      title: "Shipment Completed",
      at: (order.shipped_at ?? order.updated_at).slice(0, 16).replace("T", " "),
      actor: "system",
    });
  }

  return timeline;
}

function formatTimelineAt(value: string | null | undefined): string {
  if (!value) return "-";
  return value.slice(0, 16).replace("T", " ");
}

function mapOutboundLogType(log: RawOutboundLog): OutboundTimeline["type"] {
  if (log.action === "allocate") return "allocated";
  if (log.action === "pack") return "packed";
  if (log.action === "ship") return "shipped";
  if (log.action === "cancel") return "cancelled";
  if (log.action === "create") return "created";
  return "updated";
}

function mapOutboundLogTitle(log: RawOutboundLog): string {
  if (log.action === "allocate") return "Stock Allocated";
  if (log.action === "pack") return "Packing Completed";
  if (log.action === "ship") return "Shipment Completed";
  if (log.action === "cancel") return "Outbound Cancelled";
  if (log.action === "create") return "Order Created";
  if (log.action === "status_change") return "Status Changed";
  if (log.action === "delete") return "Outbound Deleted";
  return "Outbound Updated";
}

function mapOutboundLogs(logs: RawOutboundLog[]): OutboundTimeline[] {
  return logs.map((log) => ({
    id: `tl-log-${log.id}`,
    type: mapOutboundLogType(log),
    title: mapOutboundLogTitle(log),
    at: formatTimelineAt(log.created_at),
    actor: log.actor_name ?? log.actor_email ?? (log.actor_user_id ? `user-${log.actor_user_id}` : "system"),
    note:
      log.note ??
      (log.from_status && log.to_status && log.from_status !== log.to_status
        ? `${log.from_status} -> ${log.to_status}`
        : undefined),
  }));
}

function mapOrderSummary(order: RawOutboundOrder, itemCount: number, totalQty: number): string {
  return `${itemCount} SKUs / ${totalQty} EA`;
}

function mapOutboundOrder(
  order: RawOutboundOrder,
  clientName: string,
  items: OutboundItem[],
  boxes: OutboundBox[],
  boxesSupported = true,
  timeline?: OutboundTimeline[]
): OutboundOrder {
  const totalQty = items.reduce((acc, item) => acc + item.requested_qty, 0);
  return {
    id: String(order.outbound_no),
    outbound_no: order.outbound_no,
    client: clientName || `Client #${order.client_id}`,
    eta_date: order.order_date,
    status: order.status,
    memo: order.sales_channel ?? "N/A",
    ship_to: `Warehouse #${order.warehouse_id}`,
    summary: mapOrderSummary(order, items.length, totalQty),
    items,
    boxes,
    boxes_supported: boxesSupported,
    timeline: timeline && timeline.length > 0 ? timeline : buildTimeline(order),
  };
}

function mapBoxes(rawBoxes: RawOutboundBox[], trackingNo: string | null): OutboundBox[] {
  return rawBoxes.map((box) => ({
    id: String(box.id),
    box_no: box.box_no,
    courier: box.courier ?? "N/A",
    tracking_no: box.tracking_no ?? trackingNo ?? "-",
    item_count: Number(box.item_count),
  }));
}

function toKey(productId: number, lotId: number, locationId: number | null) {
  return `${productId}:${lotId}:${locationId ?? 0}`;
}

function mapItems(
  rawItems: RawOutboundItem[],
  products: RawProduct[],
  lots: RawLot[],
  balances: RawStockBalance[],
  orderStatus: OutboundStatus
): OutboundItem[] {
  const productMap = new Map(products.map((product) => [product.id, product]));
  const lotMap = new Map(lots.map((lot) => [lot.id, lot]));
  const balanceMap = new Map(
    balances.map((balance) => [toKey(balance.product_id, balance.lot_id, balance.location_id), Number(balance.available_qty)])
  );

  return rawItems.map((item) => {
    const available = balanceMap.get(toKey(item.product_id, item.lot_id, item.location_id)) ?? 0;
    const picked = ["packed", "shipped", "delivered"].includes(orderStatus) ? Number(item.qty) : 0;
    return {
      id: String(item.id),
      barcode_full: productMap.get(item.product_id)?.barcode_full ?? `P-${item.product_id}`,
      product_name: productMap.get(item.product_id)?.name_kr ?? `Product #${item.product_id}`,
      lot: lotMap.get(item.lot_id)?.lot_no ?? `LOT-${item.lot_id}`,
      location: item.location_id ? `LOC-${item.location_id}` : "-",
      requested_qty: Number(item.qty),
      picked_qty: picked,
      available_qty: available,
      status: available < Number(item.qty) ? "shortage" : picked > 0 ? "picked" : "ready",
    };
  });
}

const mockDb: OutboundOrder[] = outboundOrdersMock.map((order) => cloneOrder(order));

export async function getOutboundOrders(query?: OutboundListQuery, options?: RequestOptions): Promise<OutboundOrder[]> {
  if (USE_MOCK) {
    await delay(LATENCY_MS);
    return applyListFilter(mockDb, query).map((order) => cloneOrder(order));
  }

  const [orders, clients] = await Promise.all([
    requestJson<RawOutboundOrder[]>("/outbound-orders", undefined, options),
    requestJson<RawClient[]>("/clients", undefined, options),
  ]);
  const clientMap = new Map(clients.map((client) => [client.id, client.name_kr]));
  const mapped = orders.map((order) =>
    mapOutboundOrder(order, clientMap.get(order.client_id) ?? "", [], [])
  );
  return applyListFilter(mapped, query);
}

export async function getOutboundOrderByNo(outboundNo: string, options?: RequestOptions): Promise<OutboundOrder | null> {
  if (USE_MOCK) {
    await delay(LATENCY_MS);
    const order = mockDb.find((item) => item.outbound_no === outboundNo) ?? getOutboundByNo(outboundNo);
    return order ? cloneOrder(order) : null;
  }

  try {
    const rawOrders = await requestJson<RawOutboundOrder[]>("/outbound-orders", undefined, options);
    const rawOrder = rawOrders.find((order) => order.outbound_no === outboundNo);
    if (!rawOrder) return null;

    const [clients, rawItems, products, lots, balances] = await Promise.all([
      requestJson<RawClient[]>("/clients", undefined, options),
      requestJson<RawOutboundItem[]>(`/outbound-items?outbound_order_id=${rawOrder.id}`, undefined, options),
      requestJson<RawProduct[]>("/products", undefined, options),
      requestJson<RawLot[]>("/product-lots", undefined, options),
      requestJson<RawStockBalance[]>(
        `/stock-balances?client_id=${rawOrder.client_id}&warehouse_id=${rawOrder.warehouse_id}`,
        undefined,
        options
      ),
    ]);
    let rawBoxes: RawOutboundBox[] = [];
    let boxesSupported = true;
    let rawLogs: RawOutboundLog[] = [];
    try {
      rawBoxes = await requestJson<RawOutboundBox[]>(`/outbound-orders/${rawOrder.id}/boxes`, undefined, options);
    } catch (error) {
      // Some backend deployments do not expose box routes yet.
      if (error instanceof ApiError && error.status === 404) {
        boxesSupported = false;
      } else {
        throw error;
      }
    }
    try {
      rawLogs = await requestJson<RawOutboundLog[]>(`/outbound-orders/${rawOrder.id}/logs`, undefined, options);
    } catch (error) {
      if (!(error instanceof ApiError && error.status === 404)) throw error;
    }

    const items = mapItems(rawItems, products, lots, balances, rawOrder.status);
    const boxes = mapBoxes(rawBoxes, rawOrder.tracking_no);
    const clientName = clients.find((client) => client.id === rawOrder.client_id)?.name_kr ?? "";
    const timeline = mapOutboundLogs(rawLogs);

    return mapOutboundOrder(rawOrder, clientName, items, boxes, boxesSupported, timeline);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null;
    throw error;
  }
}

export async function transitionOutboundStatus(
  outboundNo: string,
  action: OutboundAction,
  options?: RequestOptions
): Promise<OutboundOrder> {
  if (USE_MOCK) {
    await delay(LATENCY_MS);
    const idx = mockDb.findIndex((item) => item.outbound_no === outboundNo);
    if (idx < 0) throw new ApiError("Outbound order not found", 404);
    const current = mockDb[idx];
    const updated: OutboundOrder = {
      ...current,
      status: mapMockActionStatus(action),
      timeline: [
        ...current.timeline,
        {
          id: `TL-${Date.now()}`,
          type: action === "allocate" ? "allocated" : action === "pack" ? "packed" : "shipped",
          title: `${action.toUpperCase()} completed`,
          at: new Date().toISOString().slice(0, 16).replace("T", " "),
          actor: "admin.demo",
        },
      ],
    };
    mockDb[idx] = updated;
    return cloneOrder(updated);
  }

  const current = await (async () => {
    const rawOrders = await requestJson<RawOutboundOrder[]>("/outbound-orders", undefined, options);
    const found = rawOrders.find((order) => order.outbound_no === outboundNo);
    if (!found) throw new ApiError("Outbound order not found", 404);
    return found;
  })();
  const nextStatus: OutboundStatus =
    action === "allocate" ? "allocated" : action === "pack" ? "packed" : "shipped";
  const nowIso = new Date().toISOString();

  await requestJson<RawOutboundOrder>(
    `/outbound-orders/${current.id}`,
    {
      method: "PUT",
      body: JSON.stringify({
        outbound_no: current.outbound_no,
        client_id: current.client_id,
        warehouse_id: current.warehouse_id,
        order_date: toDateOnly(current.order_date),
        sales_channel: current.sales_channel,
        order_no: current.order_no,
        tracking_no: current.tracking_no,
        status: nextStatus,
        packed_at: action === "pack" ? nowIso : toIsoDateTime(current.packed_at),
        shipped_at: action === "ship" ? nowIso : toIsoDateTime(current.shipped_at),
        created_by: current.created_by,
      }),
    },
    options
  );

  const updated = await getOutboundOrderByNo(current.outbound_no, options);
  if (!updated) throw new ApiError("Outbound order not found", 404);
  return updated;
}

export type AddBoxPayload = {
  box_no: string;
  courier: string;
  tracking_no: string;
  item_count: number;
};

export async function addOutboundBox(
  outboundNo: string,
  payload: AddBoxPayload,
  options?: RequestOptions
): Promise<OutboundBox[]> {
  if (!USE_MOCK) {
    const current = await (async () => {
      const rawOrders = await requestJson<RawOutboundOrder[]>("/outbound-orders", undefined, options);
      const found = rawOrders.find((order) => order.outbound_no === outboundNo);
      if (!found) throw new ApiError("Outbound order not found", 404);
      return found;
    })();
    try {
      await requestJson<RawOutboundBox>(
        `/outbound-orders/${current.id}/boxes`,
        {
          method: "POST",
          body: JSON.stringify({
            box_no: payload.box_no,
            courier: payload.courier,
            tracking_no: payload.tracking_no,
            item_count: payload.item_count,
          }),
        },
        options
      );
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) {
        throw new ApiError("Box API endpoint is not available on current backend.", 404);
      }
      throw error;
    }

    const boxes = await requestJson<RawOutboundBox[]>(`/outbound-orders/${current.id}/boxes`, undefined, options);
    return mapBoxes(boxes, null);
  }

  await delay(LATENCY_MS);
  const idx = mockDb.findIndex((item) => item.outbound_no === outboundNo);
  if (idx < 0) throw new ApiError("Outbound order not found", 404);

  const nextBox: OutboundBox = { id: `BOX-${Date.now()}`, ...payload };
  const updated = { ...mockDb[idx], boxes: [nextBox, ...mockDb[idx].boxes] };
  mockDb[idx] = updated;
  return updated.boxes.map((box) => ({ ...box }));
}
