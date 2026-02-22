import { clientsMock } from "@/features/settings/clients/mock";
import type { Client, ClientFormInput, ClientStatus } from "@/features/settings/clients/types";
import { delay, requestJson, resolveToken, shouldUseFallback, shouldUseMockMode, type RequestOptions } from "@/features/settings/shared/http";

const LATENCY_MS = 80;
const CODE_REGEX = /^[A-Z0-9_-]{2,30}$/;
const mockDb: Client[] = clientsMock.map((item) => ({ ...item }));

type RawClient = {
  id: number | string;
  client_code?: string | null;
  code?: string | null;
  name?: string | null;
  name_kr?: string | null;
  memo?: string | null;
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

function normalizeStatus(value?: string | null): ClientStatus {
  return value === "inactive" ? "inactive" : "active";
}

function validateInput(input: ClientFormInput) {
  const client_code = normalizeCode(input.client_code);
  const name = input.name.trim();
  const memo = input.memo?.trim() ?? "";
  const status = input.status ?? "active";

  if (!client_code) throw new Error("Client code is required.");
  if (!CODE_REGEX.test(client_code)) throw new Error("Client code must be 2-30 chars (A-Z, 0-9, _, -).");
  if (!name) throw new Error("Client name is required.");
  if (name.length > 80) throw new Error("Client name must be 80 characters or less.");
  if (memo.length > 300) throw new Error("Memo must be 300 characters or less.");

  return { client_code, name, memo, status };
}

function assertClientCodeUnique(clientCode: string, exceptId?: string) {
  const exists = mockDb.some((item) => normalize(item.client_code) === normalize(clientCode) && item.id !== exceptId);
  if (exists) throw new Error("Client code already exists.");
}

function mapRawClient(raw: RawClient): Client {
  return {
    id: String(raw.id),
    client_code: normalizeCode(raw.client_code ?? raw.code ?? `CL-${raw.id}`),
    name: (raw.name_kr ?? raw.name ?? "").trim() || `Client #${raw.id}`,
    memo: raw.memo?.trim() ?? "",
    status: normalizeStatus(raw.status),
    created_at: raw.created_at ?? new Date().toISOString(),
  };
}

async function listClientsFromMock(): Promise<Client[]> {
  await delay(LATENCY_MS);
  return clone(mockDb);
}

async function createClientInMock(input: ClientFormInput): Promise<Client> {
  const validated = validateInput(input);
  assertClientCodeUnique(validated.client_code);
  const created: Client = {
    id: `cl-${Date.now()}`,
    client_code: validated.client_code,
    name: validated.name,
    memo: validated.memo,
    status: validated.status,
    created_at: new Date().toISOString(),
  };
  mockDb.unshift(created);
  return clone(created);
}

async function updateClientInMock(id: string, input: ClientFormInput): Promise<Client> {
  const idx = mockDb.findIndex((item) => item.id === id);
  if (idx < 0) throw new Error("Client not found.");
  const validated = validateInput(input);
  assertClientCodeUnique(validated.client_code, id);
  const updated: Client = {
    ...mockDb[idx],
    client_code: validated.client_code,
    name: validated.name,
    memo: validated.memo,
    status: validated.status,
  };
  mockDb[idx] = updated;
  return clone(updated);
}

async function toggleClientStatusInMock(id: string): Promise<Client> {
  const idx = mockDb.findIndex((item) => item.id === id);
  if (idx < 0) throw new Error("Client not found.");
  const current = mockDb[idx];
  const updated: Client = { ...current, status: current.status === "active" ? "inactive" : "active" };
  mockDb[idx] = updated;
  return clone(updated);
}

export async function listClients(options?: RequestOptions): Promise<Client[]> {
  const token = await resolveToken(options?.token);
  if (shouldUseMockMode()) return listClientsFromMock();

  try {
    const rows = await requestJson<RawClient[]>("/clients", undefined, options);
    const mapped = rows.map(mapRawClient);
    if (mapped.length === 0 && shouldUseFallback(token)) return listClientsFromMock();
    return mapped;
  } catch (error) {
    if (shouldUseFallback(token)) return listClientsFromMock();
    throw error;
  }
}

export async function createClient(input: ClientFormInput, options?: RequestOptions): Promise<Client> {
  const token = await resolveToken(options?.token);
  if (shouldUseMockMode()) return createClientInMock(input);

  const validated = validateInput(input);
  try {
    const created = await requestJson<RawClient>(
      "/clients",
      {
        method: "POST",
        body: JSON.stringify({
          client_code: validated.client_code,
          code: validated.client_code,
          name: validated.name,
          name_kr: validated.name,
          memo: validated.memo,
          status: validated.status,
        }),
      },
      options
    );
    return mapRawClient(created);
  } catch (error) {
    if (shouldUseFallback(token)) return createClientInMock(validated);
    throw error;
  }
}

export async function updateClient(id: string, input: ClientFormInput, options?: RequestOptions): Promise<Client> {
  const token = await resolveToken(options?.token);
  if (shouldUseMockMode()) return updateClientInMock(id, input);

  const validated = validateInput(input);
  try {
    const updated = await requestJson<RawClient>(
      `/clients/${id}`,
      {
        method: "PUT",
        body: JSON.stringify({
          client_code: validated.client_code,
          code: validated.client_code,
          name: validated.name,
          name_kr: validated.name,
          memo: validated.memo,
          status: validated.status,
        }),
      },
      options
    );
    return mapRawClient(updated);
  } catch (error) {
    if (shouldUseFallback(token)) return updateClientInMock(id, validated);
    throw error;
  }
}

export async function toggleClientStatus(id: string, options?: RequestOptions): Promise<Client> {
  const token = await resolveToken(options?.token);
  if (shouldUseMockMode()) return toggleClientStatusInMock(id);

  try {
    const current = await requestJson<RawClient>(`/clients/${id}`, undefined, options);
    const nextStatus: ClientStatus = normalizeStatus(current.status) === "active" ? "inactive" : "active";
    const updated = await requestJson<RawClient>(
      `/clients/${id}`,
      {
        method: "PUT",
        body: JSON.stringify({
          status: nextStatus,
          client_code: current.client_code ?? current.code,
          code: current.client_code ?? current.code,
          name: current.name ?? current.name_kr,
          name_kr: current.name_kr ?? current.name,
          memo: current.memo ?? "",
        }),
      },
      options
    );
    return mapRawClient(updated);
  } catch (error) {
    if (shouldUseFallback(token)) return toggleClientStatusInMock(id);
    throw error;
  }
}
