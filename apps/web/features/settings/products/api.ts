import { productsMock } from "@/features/settings/products/mock";
import type { Product, ProductFormInput, ProductStatus } from "@/features/settings/products/types";
import { delay, requestJson, resolveToken, shouldUseFallback, shouldUseMockMode, type RequestOptions } from "@/features/settings/shared/http";

const LATENCY_MS = 80;
const CODE_REGEX = /^[A-Z0-9_-]{2,30}$/;
const BARCODE_RAW_REGEX = /^[A-Za-z0-9_-]{4,64}$/;
const mockDb: Product[] = productsMock.map((item) => ({ ...item }));

type RawProduct = {
  id: number | string;
  client_code?: string | null;
  barcode_raw?: string | null;
  barcode_full?: string | null;
  name?: string | null;
  name_kr?: string | null;
  width_cm?: number | string | null;
  length_cm?: number | string | null;
  height_cm?: number | string | null;
  cbm_m3?: number | string | null;
  min_storage_fee_month?: number | string | null;
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

function normalizeStatus(value?: string | null): ProductStatus {
  return value === "inactive" ? "inactive" : "active";
}

export function buildBarcodeFull(clientCode: string, barcodeRaw: string) {
  return `${normalizeCode(clientCode)}-${barcodeRaw.trim()}`;
}

function parseOptionalNonNegativeNumber(value: unknown, fieldName: string) {
  if (value == null || value === "") return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`${fieldName} must be a number >= 0.`);
  }
  return parsed;
}

function parseOptionalPositiveNumber(value: unknown, fieldName: string) {
  if (value == null || value === "") return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${fieldName} must be a number > 0.`);
  }
  return parsed;
}

function computeCbmM3(widthCm: number | null, lengthCm: number | null, heightCm: number | null) {
  if (!(widthCm && widthCm > 0) || !(lengthCm && lengthCm > 0) || !(heightCm && heightCm > 0)) {
    return null;
  }
  return Number(((widthCm * lengthCm * heightCm) / 1000000).toFixed(6));
}

function validateInput(input: ProductFormInput) {
  const client_code = normalizeCode(input.client_code);
  const barcode_raw = input.barcode_raw.trim();
  const name = input.name.trim();
  const status = input.status ?? "active";
  const width_cm = parseOptionalPositiveNumber(input.width_cm, "width_cm");
  const length_cm = parseOptionalPositiveNumber(input.length_cm, "length_cm");
  const height_cm = parseOptionalPositiveNumber(input.height_cm, "height_cm");
  const cbm_m3 = parseOptionalPositiveNumber(input.cbm_m3, "cbm_m3");
  const min_storage_fee_month = parseOptionalNonNegativeNumber(input.min_storage_fee_month, "min_storage_fee_month");

  if (!client_code) throw new Error("Client code is required.");
  if (!CODE_REGEX.test(client_code)) throw new Error("Client code must be 2-30 chars (A-Z, 0-9, _, -).");
  if (!barcode_raw) throw new Error("Barcode raw is required.");
  if (!BARCODE_RAW_REGEX.test(barcode_raw)) throw new Error("Barcode raw must be 4-64 chars (A-Z, a-z, 0-9, _, -).");
  if (!name) throw new Error("Product name is required.");
  if (name.length > 120) throw new Error("Product name must be 120 characters or less.");

  return {
    client_code,
    barcode_raw,
    name,
    status,
    width_cm,
    length_cm,
    height_cm,
    cbm_m3,
    min_storage_fee_month,
  };
}

function assertUnique(clientCode: string, barcodeRaw: string, exceptId?: string) {
  const cc = normalize(clientCode);
  const br = normalize(barcodeRaw);
  const exists = mockDb.some(
    (item) => normalize(item.client_code) === cc && normalize(item.barcode_raw) === br && item.id !== exceptId
  );
  if (exists) throw new Error("Product already exists for this client code and barcode.");
}

function mapRawProduct(raw: RawProduct): Product {
  const clientCode = normalizeCode(raw.client_code ?? "DEFAULT");
  const barcodeRaw = (raw.barcode_raw ?? raw.barcode_full?.split("-").slice(1).join("-") ?? "").trim() || "UNKNOWN";
  const widthCm = raw.width_cm == null ? null : Number(raw.width_cm);
  const lengthCm = raw.length_cm == null ? null : Number(raw.length_cm);
  const heightCm = raw.height_cm == null ? null : Number(raw.height_cm);
  const cbmM3 = raw.cbm_m3 == null ? computeCbmM3(widthCm, lengthCm, heightCm) : Number(raw.cbm_m3);
  const minStorageFeeMonth = raw.min_storage_fee_month == null ? 0 : Number(raw.min_storage_fee_month);
  return {
    id: String(raw.id),
    client_code: clientCode,
    barcode_raw: barcodeRaw,
    barcode_full: raw.barcode_full?.trim() || buildBarcodeFull(clientCode, barcodeRaw),
    name: (raw.name_kr ?? raw.name ?? "").trim() || `Product #${raw.id}`,
    width_cm: Number.isFinite(widthCm) ? widthCm : null,
    length_cm: Number.isFinite(lengthCm) ? lengthCm : null,
    height_cm: Number.isFinite(heightCm) ? heightCm : null,
    cbm_m3: Number.isFinite(Number(cbmM3)) ? Number(cbmM3) : null,
    min_storage_fee_month: Number.isFinite(minStorageFeeMonth) ? minStorageFeeMonth : 0,
    status: normalizeStatus(raw.status),
    created_at: raw.created_at ?? new Date().toISOString(),
  };
}

async function listProductsFromMock(): Promise<Product[]> {
  await delay(LATENCY_MS);
  return clone(mockDb);
}

async function createProductInMock(input: ProductFormInput): Promise<Product> {
  const validated = validateInput(input);
  assertUnique(validated.client_code, validated.barcode_raw);
  const cbm = validated.cbm_m3 ?? computeCbmM3(validated.width_cm, validated.length_cm, validated.height_cm);
  const created: Product = {
    id: `prd-${Date.now()}`,
    client_code: validated.client_code,
    barcode_raw: validated.barcode_raw,
    barcode_full: buildBarcodeFull(validated.client_code, validated.barcode_raw),
    name: validated.name,
    width_cm: validated.width_cm,
    length_cm: validated.length_cm,
    height_cm: validated.height_cm,
    cbm_m3: cbm,
    min_storage_fee_month: validated.min_storage_fee_month ?? 0,
    status: validated.status,
    created_at: new Date().toISOString(),
  };
  mockDb.unshift(created);
  return clone(created);
}

async function updateProductInMock(id: string, input: ProductFormInput): Promise<Product> {
  const idx = mockDb.findIndex((item) => item.id === id);
  if (idx < 0) throw new Error("Product not found.");
  const validated = validateInput(input);
  assertUnique(validated.client_code, validated.barcode_raw, id);
  const cbm = validated.cbm_m3 ?? computeCbmM3(validated.width_cm, validated.length_cm, validated.height_cm);
  const updated: Product = {
    ...mockDb[idx],
    client_code: validated.client_code,
    barcode_raw: validated.barcode_raw,
    barcode_full: buildBarcodeFull(validated.client_code, validated.barcode_raw),
    name: validated.name,
    width_cm: validated.width_cm,
    length_cm: validated.length_cm,
    height_cm: validated.height_cm,
    cbm_m3: cbm,
    min_storage_fee_month: validated.min_storage_fee_month ?? 0,
    status: validated.status,
  };
  mockDb[idx] = updated;
  return clone(updated);
}

async function toggleProductStatusInMock(id: string): Promise<Product> {
  const idx = mockDb.findIndex((item) => item.id === id);
  if (idx < 0) throw new Error("Product not found.");
  const current = mockDb[idx];
  const updated: Product = { ...current, status: current.status === "active" ? "inactive" : "active" };
  mockDb[idx] = updated;
  return clone(updated);
}

export async function listProducts(options?: RequestOptions): Promise<Product[]> {
  const token = await resolveToken(options?.token);
  if (shouldUseMockMode()) return listProductsFromMock();

  try {
    const rows = await requestJson<RawProduct[]>("/products", undefined, options);
    const mapped = rows.map(mapRawProduct);
    if (mapped.length === 0 && shouldUseFallback(token)) return listProductsFromMock();
    return mapped;
  } catch (error) {
    if (shouldUseFallback(token)) return listProductsFromMock();
    throw error;
  }
}

export async function createProduct(input: ProductFormInput, options?: RequestOptions): Promise<Product> {
  const token = await resolveToken(options?.token);
  if (shouldUseMockMode()) return createProductInMock(input);

  const validated = validateInput(input);
  try {
    const created = await requestJson<RawProduct>(
      "/products",
      {
        method: "POST",
        body: JSON.stringify({
          client_code: validated.client_code,
          barcode_raw: validated.barcode_raw,
          barcode_full: buildBarcodeFull(validated.client_code, validated.barcode_raw),
          name: validated.name,
          name_kr: validated.name,
          width_cm: validated.width_cm,
          length_cm: validated.length_cm,
          height_cm: validated.height_cm,
          cbm_m3: validated.cbm_m3,
          min_storage_fee_month: validated.min_storage_fee_month,
          status: validated.status,
        }),
      },
      options
    );
    return mapRawProduct(created);
  } catch (error) {
    if (shouldUseFallback(token)) return createProductInMock(validated);
    throw error;
  }
}

export async function updateProduct(id: string, input: ProductFormInput, options?: RequestOptions): Promise<Product> {
  const token = await resolveToken(options?.token);
  if (shouldUseMockMode()) return updateProductInMock(id, input);

  const validated = validateInput(input);
  try {
    const updated = await requestJson<RawProduct>(
      `/products/${id}`,
      {
        method: "PUT",
        body: JSON.stringify({
          client_code: validated.client_code,
          barcode_raw: validated.barcode_raw,
          barcode_full: buildBarcodeFull(validated.client_code, validated.barcode_raw),
          name: validated.name,
          name_kr: validated.name,
          width_cm: validated.width_cm,
          length_cm: validated.length_cm,
          height_cm: validated.height_cm,
          cbm_m3: validated.cbm_m3,
          min_storage_fee_month: validated.min_storage_fee_month,
          status: validated.status,
        }),
      },
      options
    );
    return mapRawProduct(updated);
  } catch (error) {
    if (shouldUseFallback(token)) return updateProductInMock(id, validated);
    throw error;
  }
}

export async function toggleProductStatus(id: string, options?: RequestOptions): Promise<Product> {
  const token = await resolveToken(options?.token);
  if (shouldUseMockMode()) return toggleProductStatusInMock(id);

  try {
    const current = await requestJson<RawProduct>(`/products/${id}`, undefined, options);
    const nextStatus: ProductStatus = normalizeStatus(current.status) === "active" ? "inactive" : "active";
    const updated = await requestJson<RawProduct>(
      `/products/${id}`,
      {
        method: "PUT",
        body: JSON.stringify({
          status: nextStatus,
          client_code: current.client_code,
          barcode_raw: current.barcode_raw,
          barcode_full: current.barcode_full,
          name: current.name ?? current.name_kr,
          name_kr: current.name_kr ?? current.name,
          width_cm: current.width_cm,
          length_cm: current.length_cm,
          height_cm: current.height_cm,
          cbm_m3: current.cbm_m3,
          min_storage_fee_month: current.min_storage_fee_month ?? 0,
        }),
      },
      options
    );
    return mapRawProduct(updated);
  } catch (error) {
    if (shouldUseFallback(token)) return toggleProductStatusInMock(id);
    throw error;
  }
}
