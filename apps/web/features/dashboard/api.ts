"use client";

export type GroupBy = "day" | "week" | "month";
export type CapacityStatus = "ok" | "warn" | "critical";

export type StorageTrendResponse = {
  ok: true;
  from: string;
  to: string;
  groupBy: GroupBy;
  totals: { total_cbm: number; total_pallet: number; total_sku: number };
  series: Array<{ period: string; total_cbm: number; total_pallet: number; total_sku: number }>;
};

export type StorageBillingResponse = {
  ok: true;
  month: string;
  summary: { amount_total: number; amount_cbm: number; amount_pallet: number };
  lines: Array<{
    warehouse_id: number;
    client_id: number;
    days_count: number;
    avg_cbm: number;
    avg_pallet: number;
    amount_total: number;
    amount_cbm: number;
    amount_pallet: number;
  }>;
};

export type StorageDashboardResponse = {
  ok: true;
  date: string;
  totals: { total_cbm: number; total_pallet: number; total_sku: number };
  breakdown: Array<{
    warehouse_id: number;
    client_id: number;
    snapshot_date: string;
    total_cbm: number;
    total_pallet: number;
    total_sku: number;
  }>;
};

export type StorageCapacityResponse = {
  ok: true;
  date: string;
  warehouses: Array<{
    warehouse_id: number;
    used_cbm: number;
    capacity_cbm: number | null;
    usage_pct_cbm: number | null;
    status: CapacityStatus;
    used_pallet: number;
    capacity_pallet: number | null;
    usage_pct_pallet: number | null;
  }>;
  alerts: Array<{
    warehouse_id: number;
    used_cbm: number;
    capacity_cbm: number | null;
    usage_pct_cbm: number | null;
    status: CapacityStatus;
    used_pallet: number;
    capacity_pallet: number | null;
    usage_pct_pallet: number | null;
  }>;
};

export type GenerateSnapshotsResponse = {
  ok: true;
  data: {
    snapshot_date: string;
    filters: { warehouseId: number | null; clientId: number | null };
    generated: boolean;
    alerts: {
      missing_product_cbm_count: number;
      missing_product_cbm_items: Array<{
        warehouse_id: number;
        client_id: number;
        product_id: number;
        sku_code: string | null;
        product_name: string | null;
        available_qty: number;
      }>;
    };
  };
};

function toQuery(input: Record<string, string | number | undefined>) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(input)) {
    if (value === undefined || value === "") continue;
    params.set(key, String(value));
  }
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

async function requestDashboard<T>(path: string, query?: Record<string, string | number | undefined>) {
  const response = await fetch(`/api/dashboard/${path}${toQuery(query ?? {})}`, {
    cache: "no-store",
  });

  const json = await response.json();
  if (!response.ok || !json?.ok) {
    throw new Error(json?.message || "Dashboard request failed");
  }
  return json as T;
}

async function requestDashboardPost<T>(path: string, body: Record<string, string | number | undefined>) {
  const response = await fetch(`/api/dashboard/${path}`, {
    method: "POST",
    cache: "no-store",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

  const json = await response.json();
  if (!response.ok || !json?.ok) {
    throw new Error(json?.message || "Dashboard request failed");
  }
  return json as T;
}

export function getStorageDashboard(query?: { date?: string; warehouseId?: number; clientId?: number }) {
  return requestDashboard<StorageDashboardResponse>("storage", query);
}

export function getStorageTrend(query: {
  from: string;
  to: string;
  groupBy: GroupBy;
  warehouseId?: number;
  clientId?: number;
}) {
  return requestDashboard<StorageTrendResponse>("storage/trend", query);
}

export function getStorageBillingPreview(query: {
  month: string;
  warehouseId?: number;
  clientId?: number;
  rateCbm?: number;
  ratePallet?: number;
}) {
  return requestDashboard<StorageBillingResponse>("storage/billing/preview", query);
}

export function getStorageCapacity(query: { date?: string; warehouseId?: number }) {
  return requestDashboard<StorageCapacityResponse>("storage/capacity", query);
}

export function generateStorageSnapshots(query: { date?: string; warehouseId?: number; clientId?: number }) {
  return requestDashboardPost<GenerateSnapshotsResponse>("storage/snapshots/generate", query);
}

export async function generateSnapshotsForDate(date: string) {
  return generateStorageSnapshots({ date });
}
