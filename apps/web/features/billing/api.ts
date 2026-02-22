import { requestJson, type RequestOptions } from "@/features/settings/shared/http";

export type ServiceRate = {
  id: number;
  service_code: string;
  service_name: string;
  billing_unit: "ORDER" | "SKU" | "BOX" | "CBM" | "PALLET" | "EVENT" | "MONTH";
  pricing_policy: "THB_BASED" | "KRW_FIXED";
  default_currency: "THB" | "KRW";
  default_rate: number;
  status: "active" | "inactive";
};

export type ClientContractRate = {
  id: number;
  client_id: number;
  service_code: string;
  custom_rate: number;
  currency: "THB" | "KRW";
  effective_date: string;
};

export type ExchangeRate = {
  id: number;
  rate_date: string;
  base_currency: "THB";
  quote_currency: "KRW";
  rate: number;
  source: "manual" | "api";
  locked: number;
  status: "draft" | "active" | "superseded";
  used_invoice_count?: number;
};

export type BillingInvoice = {
  id: number;
  client_id: number;
  client_code: string;
  name_kr: string;
  invoice_no: string;
  invoice_month: string;
  invoice_date: string;
  currency: "KRW";
  fx_rate_thbkrw: number;
  subtotal_krw: number;
  vat_krw: number;
  total_krw: number;
  status: string;
};

export type BillingInvoiceItem = {
  id: number;
  invoice_id: number;
  service_code: string;
  description: string;
  qty: number;
  unit_price_krw: number;
  amount_krw: number;
  unit_price_trunc100?: number;
  amount_trunc100?: number;
};

export type BillingEvent = {
  id: number;
  event_date: string;
  client_id: number;
  client_code: string;
  name_kr: string;
  service_code: string;
  qty: number;
  amount_thb: number | null;
  fx_rate_thbkrw: number | null;
  amount_krw: number | null;
  reference_type: string;
  reference_id: string | null;
  status: "PENDING" | "INVOICED";
  invoice_id: number | null;
};

export async function listServiceRates(options?: RequestOptions) {
  return requestJson<ServiceRate[]>("/billing/settings/service-catalog", undefined, options);
}

export async function createServiceRate(input: Omit<ServiceRate, "id">, options?: RequestOptions) {
  return requestJson<ServiceRate>(
    "/billing/settings/service-catalog",
    { method: "POST", body: JSON.stringify(input) },
    options
  );
}

export async function updateServiceRate(serviceCode: string, input: Omit<ServiceRate, "id">, options?: RequestOptions) {
  return requestJson<ServiceRate>(
    `/billing/settings/service-catalog/${encodeURIComponent(serviceCode)}`,
    { method: "PUT", body: JSON.stringify(input) },
    options
  );
}

export async function deleteServiceRate(serviceCode: string, options?: RequestOptions) {
  return requestJson<{ ok: true }>(
    `/billing/settings/service-catalog/${encodeURIComponent(serviceCode)}`,
    { method: "DELETE" },
    options
  );
}

export async function listClientContractRates(query?: { client_id?: number }, options?: RequestOptions) {
  const params = new URLSearchParams();
  if (query?.client_id) params.set("client_id", String(query.client_id));
  const suffix = params.toString() ? `?${params.toString()}` : "";
  return requestJson<ClientContractRate[]>(`/billing/settings/client-contract-rates${suffix}`, undefined, options);
}

export async function createClientContractRate(input: Omit<ClientContractRate, "id">, options?: RequestOptions) {
  return requestJson<ClientContractRate>(
    "/billing/settings/client-contract-rates",
    { method: "POST", body: JSON.stringify(input) },
    options
  );
}

export async function updateClientContractRate(id: number, input: Omit<ClientContractRate, "id">, options?: RequestOptions) {
  return requestJson<ClientContractRate>(
    `/billing/settings/client-contract-rates/${id}`,
    { method: "PUT", body: JSON.stringify(input) },
    options
  );
}

export async function deleteClientContractRate(id: number, options?: RequestOptions) {
  return requestJson<{ ok: true }>(`/billing/settings/client-contract-rates/${id}`, { method: "DELETE" }, options);
}

export async function listExchangeRates(query?: { month?: string }, options?: RequestOptions) {
  const params = new URLSearchParams();
  if (query?.month) params.set("month", query.month);
  const suffix = params.toString() ? `?${params.toString()}` : "";
  return requestJson<ExchangeRate[]>(`/billing/settings/exchange-rates${suffix}`, undefined, options);
}

export async function createExchangeRate(
  input: Omit<ExchangeRate, "id" | "base_currency" | "quote_currency"> & { entered_by?: number },
  options?: RequestOptions
) {
  return requestJson<ExchangeRate>(
    "/billing/settings/exchange-rates",
    { method: "POST", body: JSON.stringify(input) },
    options
  );
}

export async function updateExchangeRate(
  id: number,
  input: Omit<ExchangeRate, "id" | "base_currency" | "quote_currency">,
  options?: RequestOptions
) {
  return requestJson<ExchangeRate>(
    `/billing/settings/exchange-rates/${id}`,
    { method: "PUT", body: JSON.stringify(input) },
    options
  );
}

export async function deleteExchangeRate(id: number, options?: RequestOptions) {
  return requestJson<{ ok: true }>(`/billing/settings/exchange-rates/${id}`, { method: "DELETE" }, options);
}

export async function seedBillingEvents(input: { client_id: number; invoice_month: string }, options?: RequestOptions) {
  return requestJson<{ seeded: boolean }>(
    "/billing/events/sample",
    { method: "POST", body: JSON.stringify(input) },
    options
  );
}

export async function listBillingEvents(
  query?: { client_id?: number; invoice_month?: string; status?: "PENDING" | "INVOICED"; service_code?: string },
  options?: RequestOptions
) {
  const params = new URLSearchParams();
  if (query?.client_id) params.set("client_id", String(query.client_id));
  if (query?.invoice_month) params.set("invoice_month", query.invoice_month);
  if (query?.status) params.set("status", query.status);
  if (query?.service_code) params.set("service_code", query.service_code);
  const suffix = params.toString() ? `?${params.toString()}` : "";
  return requestJson<BillingEvent[]>(`/billing/events${suffix}`, undefined, options);
}

export async function markBillingEventsPending(ids: number[], options?: RequestOptions) {
  return requestJson<{ updated: number }>(
    "/billing/events/mark-pending",
    { method: "POST", body: JSON.stringify({ ids }) },
    options
  );
}

export function billingEventsCsvUrl(query?: {
  client_id?: number;
  invoice_month?: string;
  status?: "PENDING" | "INVOICED";
  service_code?: string;
}) {
  const params = new URLSearchParams();
  if (query?.client_id) params.set("client_id", String(query.client_id));
  if (query?.invoice_month) params.set("invoice_month", query.invoice_month);
  if (query?.status) params.set("status", query.status);
  if (query?.service_code) params.set("service_code", query.service_code);
  const suffix = params.toString() ? `?${params.toString()}` : "";
  return `/api/proxy/billing/events/export.csv${suffix}`;
}

export async function generateBillingInvoice(
  input: { client_id: number; invoice_month: string; invoice_date: string; regenerate_draft?: number },
  options?: RequestOptions
) {
  return requestJson<{ invoice: BillingInvoice; events_count: number; reused: boolean; invoice_id?: number }>(
    "/billing/invoices/generate",
    { method: "POST", body: JSON.stringify(input) },
    options
  );
}

export async function listBillingInvoices(
  query?: { client_id?: number; invoice_month?: string; status?: string },
  options?: RequestOptions
) {
  const params = new URLSearchParams();
  if (query?.client_id) params.set("client_id", String(query.client_id));
  if (query?.invoice_month) params.set("invoice_month", query.invoice_month);
  if (query?.status) params.set("status", query.status);
  const suffix = params.toString() ? `?${params.toString()}` : "";
  return requestJson<BillingInvoice[]>(`/billing/invoices${suffix}`, undefined, options);
}

export async function getBillingInvoice(id: string | number, options?: RequestOptions) {
  return requestJson<{ invoice: BillingInvoice; items: BillingInvoiceItem[] }>(
    `/billing/invoices/${id}`,
    undefined,
    options
  );
}

export async function exportBillingInvoicePdf(id: string | number, options?: RequestOptions) {
  return requestJson<{ status: string; message: string }>(`/billing/invoices/${id}/export-pdf`, undefined, options);
}

export async function issueBillingInvoice(id: string | number, options?: RequestOptions) {
  return requestJson<{ id: number; status: "issued" }>(`/billing/invoices/${id}/issue`, { method: "POST" }, options);
}

export async function markBillingInvoicePaid(id: string | number, options?: RequestOptions) {
  return requestJson<{ id: number; status: "paid" }>(
    `/billing/invoices/${id}/mark-paid`,
    { method: "POST" },
    options
  );
}

export async function duplicateBillingInvoiceAdmin(id: string | number, options?: RequestOptions) {
  return requestJson<BillingInvoice>(`/billing/invoices/${id}/duplicate-admin`, { method: "POST" }, options);
}
