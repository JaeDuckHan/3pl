import { getInboundByNo, inboundOrdersMock } from "@/features/inbound/mock";
import type {
  InboundAction,
  InboundItem,
  InboundListQuery,
  InboundOrder,
  InboundStatus,
  InboundTimeline,
} from "@/features/inbound/types";
import { ApiError } from "@/features/outbound/api";
import { AUTH_COOKIE_KEY } from "@/lib/auth";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3010";
const USE_MOCK = process.env.NEXT_PUBLIC_USE_MOCK !== "false";
const LATENCY_MS = 120;

type RequestOptions = { token?: string };
type AuthRequestOptions = RequestOptions & { allowAnonymous?: boolean };

type RawInboundOrder = {
  id: number;
  inbound_no: string;
  client_id: number;
  warehouse_id: number;
  inbound_date: string;
  status: InboundStatus;
  memo: string | null;
  created_by: number;
  received_at: string | null;
  created_at: string;
  updated_at: string;
};

type RawInboundItem = {
  id: number;
  inbound_order_id: number;
  product_id: number;
  lot_id: number;
  location_id: number | null;
  qty: number;
  invoice_price: number | null;
  currency: "KRW" | "THB" | null;
  remark: string | null;
};

type RawClient = { id: number; name_kr: string };
type RawProduct = { id: number; barcode_full: string; name_kr: string };
type RawLot = { id: number; lot_no: string };
type JsonResponse<T> = { ok: boolean; data?: T; message?: string };

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function toDateOnly(value: string | null | undefined): string {
  if (!value) return new Date().toISOString().slice(0, 10);
  const m = value.trim().match(/^(\d{4}-\d{2}-\d{2})/);
  if (m) return m[1];
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return new Date().toISOString().slice(0, 10);
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
    return tokenCookie ? decodeURIComponent(tokenCookie.split("=")[1]) : undefined;
  }
  return undefined;
}

async function requestJson<T>(
  path: string,
  init?: RequestInit,
  options?: AuthRequestOptions
): Promise<T> {
  const token = await resolveToken(options?.token);
  if (!token && !options?.allowAnonymous) throw new ApiError("Missing auth token", 401);

  const endpoint = typeof window === "undefined" ? `${API_BASE_URL}${path}` : `/api/proxy${path}`;
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
  if (!response.ok || !json.ok) throw new ApiError(json.message ?? "Request failed", response.status);
  if (json.data === undefined) throw new ApiError("Missing response data", response.status);
  return json.data;
}

function cloneOrder(order: InboundOrder): InboundOrder {
  return JSON.parse(JSON.stringify(order)) as InboundOrder;
}

function applyListFilter(orders: InboundOrder[], query?: InboundListQuery): InboundOrder[] {
  const q = query?.q?.trim().toLowerCase();
  const status = query?.status ?? "all";
  return orders.filter((order) => {
    const matchStatus = status === "all" ? true : order.status === status;
    const matchText =
      !q ||
      order.inbound_no.toLowerCase().includes(q) ||
      order.client.toLowerCase().includes(q) ||
      order.summary.toLowerCase().includes(q);
    return matchStatus && matchText;
  });
}

function mapMockActionStatus(action: InboundAction): InboundStatus {
  if (action === "submit") return "submitted";
  if (action === "arrive") return "arrived";
  return "received";
}

function buildTimeline(order: RawInboundOrder): InboundTimeline[] {
  const timeline: InboundTimeline[] = [
    {
      id: `itl-created-${order.id}`,
      type: "created",
      title: "Inbound Created",
      at: order.created_at.slice(0, 16).replace("T", " "),
      actor: `user-${order.created_by}`,
    },
  ];

  if (["submitted", "arrived", "qc_hold", "received"].includes(order.status)) {
    timeline.push({
      id: `itl-submitted-${order.id}`,
      type: "submitted",
      title: "Inbound Submitted",
      at: order.updated_at.slice(0, 16).replace("T", " "),
      actor: "system",
    });
  }
  if (["arrived", "qc_hold", "received"].includes(order.status)) {
    timeline.push({
      id: `itl-arrived-${order.id}`,
      type: "arrived",
      title: "Goods Arrived",
      at: order.updated_at.slice(0, 16).replace("T", " "),
      actor: "system",
    });
  }
  if (order.received_at || order.status === "received") {
    timeline.push({
      id: `itl-received-${order.id}`,
      type: "received",
      title: "Receiving Completed",
      at: (order.received_at ?? order.updated_at).slice(0, 16).replace("T", " "),
      actor: "system",
    });
  }
  return timeline;
}

function mapInboundOrder(order: RawInboundOrder, clientName: string, items: InboundItem[]): InboundOrder {
  const totalQty = items.reduce((acc, item) => acc + item.qty, 0);
  return {
    id: String(order.id),
    inbound_no: order.inbound_no,
    client: clientName || `Client #${order.client_id}`,
    inbound_date: order.inbound_date,
    status: order.status,
    memo: order.memo ?? "-",
    warehouse: `Warehouse #${order.warehouse_id}`,
    summary: `${items.length} SKUs / ${totalQty} EA`,
    items,
    timeline: buildTimeline(order),
  };
}

function mapItems(rawItems: RawInboundItem[], products: RawProduct[], lots: RawLot[]): InboundItem[] {
  const productMap = new Map(products.map((product) => [product.id, product]));
  const lotMap = new Map(lots.map((lot) => [lot.id, lot]));
  return rawItems.map((item) => ({
    id: String(item.id),
    barcode_full: productMap.get(item.product_id)?.barcode_full ?? `P-${item.product_id}`,
    product_name: productMap.get(item.product_id)?.name_kr ?? `Product #${item.product_id}`,
    lot: lotMap.get(item.lot_id)?.lot_no ?? `LOT-${item.lot_id}`,
    location: item.location_id ? `LOC-${item.location_id}` : "-",
    qty: Number(item.qty),
    invoice_price: item.invoice_price === null ? null : Number(item.invoice_price),
    currency: item.currency,
    remark: item.remark,
  }));
}

const mockDb: InboundOrder[] = inboundOrdersMock.map((order) => cloneOrder(order));

export async function getInboundOrders(query?: InboundListQuery, options?: RequestOptions): Promise<InboundOrder[]> {
  if (USE_MOCK) {
    await delay(LATENCY_MS);
    return applyListFilter(mockDb, query).map((order) => cloneOrder(order));
  }
  const [orders, clients] = await Promise.all([
    requestJson<RawInboundOrder[]>("/inbound-orders", undefined, options),
    requestJson<RawClient[]>("/clients", undefined, options),
  ]);
  const clientMap = new Map(clients.map((client) => [client.id, client.name_kr]));
  const mapped = orders.map((order) => mapInboundOrder(order, clientMap.get(order.client_id) ?? "", []));
  return applyListFilter(mapped, query);
}

export async function getInboundOrderByNo(inboundNo: string, options?: RequestOptions): Promise<InboundOrder | null> {
  if (USE_MOCK) {
    await delay(LATENCY_MS);
    const order = mockDb.find((item) => item.inbound_no === inboundNo) ?? getInboundByNo(inboundNo);
    return order ? cloneOrder(order) : null;
  }
  try {
    const rawOrders = await requestJson<RawInboundOrder[]>("/inbound-orders", undefined, options);
    const rawOrder = rawOrders.find((order) => order.inbound_no === inboundNo);
    if (!rawOrder) return null;
    const [clients, rawItems, products, lots] = await Promise.all([
      requestJson<RawClient[]>("/clients", undefined, options),
      requestJson<RawInboundItem[]>(`/inbound-items?inbound_order_id=${rawOrder.id}`, undefined, options),
      requestJson<RawProduct[]>("/products", undefined, options),
      requestJson<RawLot[]>("/product-lots", undefined, options),
    ]);
    const clientName = clients.find((client) => client.id === rawOrder.client_id)?.name_kr ?? "";
    const items = mapItems(rawItems, products, lots);
    return mapInboundOrder(rawOrder, clientName, items);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null;
    throw error;
  }
}

export async function transitionInboundStatus(
  inboundNo: string,
  action: InboundAction,
  options?: RequestOptions
): Promise<InboundOrder> {
  if (USE_MOCK) {
    await delay(LATENCY_MS);
    const idx = mockDb.findIndex((item) => item.inbound_no === inboundNo);
    if (idx < 0) throw new ApiError("Inbound order not found", 404);
    const current = mockDb[idx];
    const updated: InboundOrder = {
      ...current,
      status: mapMockActionStatus(action),
      timeline: [
        ...current.timeline,
        {
          id: `ITL-${Date.now()}`,
          type: action === "submit" ? "submitted" : action === "arrive" ? "arrived" : "received",
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
    const rawOrders = await requestJson<RawInboundOrder[]>("/inbound-orders", undefined, options);
    const found = rawOrders.find((order) => order.inbound_no === inboundNo);
    if (!found) throw new ApiError("Inbound order not found", 404);
    return found;
  })();
  const nextStatus: InboundStatus =
    action === "submit" ? "submitted" : action === "arrive" ? "arrived" : "received";
  const nowIso = new Date().toISOString();

  await requestJson<RawInboundOrder>(
    `/inbound-orders/${current.id}`,
    {
      method: "PUT",
      body: JSON.stringify({
        inbound_no: current.inbound_no,
        client_id: current.client_id,
        warehouse_id: current.warehouse_id,
        inbound_date: toDateOnly(current.inbound_date),
        status: nextStatus,
        memo: current.memo,
        created_by: current.created_by,
        received_at: action === "receive" ? nowIso : toIsoDateTime(current.received_at),
      }),
    },
    options
  );

  const updated = await getInboundOrderByNo(current.inbound_no, options);
  if (!updated) throw new ApiError("Inbound order not found", 404);
  return updated;
}
