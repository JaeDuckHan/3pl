import { warehousesMock } from "@/features/settings/warehouses/mock";
import type { Warehouse, WarehouseFormInput, WarehouseStatus } from "@/features/settings/warehouses/types";
import { delay, requestJson, resolveToken, shouldUseFallback, shouldUseMockMode, type RequestOptions } from "@/features/settings/shared/http";

const LATENCY_MS = 80;
const CODE_REGEX = /^[A-Z0-9_-]{2,30}$/;
const mockDb: Warehouse[] = warehousesMock.map((item) => ({ ...item }));

type RawWarehouse = {
  id: number | string;
  warehouse_code?: string | null;
  code?: string | null;
  name?: string | null;
  name_kr?: string | null;
  status?: string | null;
  created_at?: string | null;
};

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function normalize(value: string) {
  return value.trim().toLowerCase();
}

function normalizeCode(value: string) {
  return value.trim().toUpperCase();
}

function normalizeStatus(value?: string | null): WarehouseStatus {
  return value === "inactive" ? "inactive" : "active";
}

function validateInput(input: WarehouseFormInput) {
  const warehouse_code = normalizeCode(input.warehouse_code);
  const name = input.name.trim();
  const status = input.status ?? "active";

  if (!warehouse_code) throw new Error("Warehouse code is required.");
  if (!CODE_REGEX.test(warehouse_code)) throw new Error("Warehouse code must be 2-30 chars (A-Z, 0-9, _, -).");
  if (!name) throw new Error("Warehouse name is required.");
  if (name.length > 80) throw new Error("Warehouse name must be 80 characters or less.");

  return { warehouse_code, name, status };
}

function assertWarehouseCodeUnique(code: string, exceptId?: string) {
  const exists = mockDb.some((item) => normalize(item.warehouse_code) === normalize(code) && item.id !== exceptId);
  if (exists) throw new Error("Warehouse code already exists.");
}

function mapRawWarehouse(raw: RawWarehouse): Warehouse {
  return {
    id: String(raw.id),
    warehouse_code: normalizeCode(raw.warehouse_code ?? raw.code ?? `WH-${raw.id}`),
    name: (raw.name_kr ?? raw.name ?? "").trim() || `Warehouse #${raw.id}`,
    status: normalizeStatus(raw.status),
    created_at: raw.created_at ?? new Date().toISOString(),
  };
}

async function listWarehousesFromMock(): Promise<Warehouse[]> {
  await delay(LATENCY_MS);
  return clone(mockDb);
}

async function createWarehouseInMock(input: WarehouseFormInput): Promise<Warehouse> {
  const validated = validateInput(input);
  assertWarehouseCodeUnique(validated.warehouse_code);
  const created: Warehouse = {
    id: `wh-${Date.now()}`,
    warehouse_code: validated.warehouse_code,
    name: validated.name,
    status: validated.status,
    created_at: new Date().toISOString(),
  };
  mockDb.unshift(created);
  return clone(created);
}

async function updateWarehouseInMock(id: string, input: WarehouseFormInput): Promise<Warehouse> {
  const idx = mockDb.findIndex((item) => item.id === id);
  if (idx < 0) throw new Error("Warehouse not found.");
  const validated = validateInput(input);
  assertWarehouseCodeUnique(validated.warehouse_code, id);
  const updated: Warehouse = {
    ...mockDb[idx],
    warehouse_code: validated.warehouse_code,
    name: validated.name,
    status: validated.status,
  };
  mockDb[idx] = updated;
  return clone(updated);
}

async function toggleWarehouseStatusInMock(id: string): Promise<Warehouse> {
  const idx = mockDb.findIndex((item) => item.id === id);
  if (idx < 0) throw new Error("Warehouse not found.");
  const current = mockDb[idx];
  const updated: Warehouse = { ...current, status: current.status === "active" ? "inactive" : "active" };
  mockDb[idx] = updated;
  return clone(updated);
}

export async function listWarehouses(options?: RequestOptions): Promise<Warehouse[]> {
  const token = await resolveToken(options?.token);
  if (shouldUseMockMode()) return listWarehousesFromMock();

  try {
    const rows = await requestJson<RawWarehouse[]>("/warehouses", undefined, options);
    const mapped = rows.map(mapRawWarehouse);
    if (mapped.length === 0 && shouldUseFallback(token)) return listWarehousesFromMock();
    return mapped;
  } catch (error) {
    if (shouldUseFallback(token)) return listWarehousesFromMock();
    throw error;
  }
}

export async function createWarehouse(input: WarehouseFormInput, options?: RequestOptions): Promise<Warehouse> {
  const token = await resolveToken(options?.token);
  if (shouldUseMockMode()) return createWarehouseInMock(input);

  const validated = validateInput(input);
  try {
    const created = await requestJson<RawWarehouse>(
      "/warehouses",
      {
        method: "POST",
        body: JSON.stringify({
          warehouse_code: validated.warehouse_code,
          code: validated.warehouse_code,
          name: validated.name,
          name_kr: validated.name,
          status: validated.status,
        }),
      },
      options
    );
    return mapRawWarehouse(created);
  } catch (error) {
    if (shouldUseFallback(token)) return createWarehouseInMock(validated);
    throw error;
  }
}

export async function updateWarehouse(id: string, input: WarehouseFormInput, options?: RequestOptions): Promise<Warehouse> {
  const token = await resolveToken(options?.token);
  if (shouldUseMockMode()) return updateWarehouseInMock(id, input);

  const validated = validateInput(input);
  try {
    const updated = await requestJson<RawWarehouse>(
      `/warehouses/${id}`,
      {
        method: "PUT",
        body: JSON.stringify({
          warehouse_code: validated.warehouse_code,
          code: validated.warehouse_code,
          name: validated.name,
          name_kr: validated.name,
          status: validated.status,
        }),
      },
      options
    );
    return mapRawWarehouse(updated);
  } catch (error) {
    if (shouldUseFallback(token)) return updateWarehouseInMock(id, validated);
    throw error;
  }
}

export async function toggleWarehouseStatus(id: string, options?: RequestOptions): Promise<Warehouse> {
  const token = await resolveToken(options?.token);
  if (shouldUseMockMode()) return toggleWarehouseStatusInMock(id);

  try {
    const current = await requestJson<RawWarehouse>(`/warehouses/${id}`, undefined, options);
    const nextStatus: WarehouseStatus = normalizeStatus(current.status) === "active" ? "inactive" : "active";
    const updated = await requestJson<RawWarehouse>(
      `/warehouses/${id}`,
      {
        method: "PUT",
        body: JSON.stringify({
          status: nextStatus,
          warehouse_code: current.warehouse_code ?? current.code,
          code: current.warehouse_code ?? current.code,
          name: current.name ?? current.name_kr,
          name_kr: current.name_kr ?? current.name,
        }),
      },
      options
    );
    return mapRawWarehouse(updated);
  } catch (error) {
    if (shouldUseFallback(token)) return toggleWarehouseStatusInMock(id);
    throw error;
  }
}
