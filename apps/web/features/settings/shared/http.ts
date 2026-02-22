import { ApiError } from "@/features/outbound/api";
import { AUTH_COOKIE_KEY } from "@/lib/auth";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3100";
const USE_MOCK = process.env.NEXT_PUBLIC_USE_MOCK !== "false";
const ENABLE_DEV_FALLBACK = process.env.NODE_ENV !== "production";

type JsonResponse<T> = { ok: boolean; data?: T; message?: string };

export type RequestOptions = { token?: string };
type AuthRequestOptions = RequestOptions & { allowAnonymous?: boolean };

export function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function resolveToken(input?: string): Promise<string | undefined> {
  if (input) return input;
  if (typeof window !== "undefined") {
    const tokenCookie = document.cookie
      .split("; ")
      .find((entry) => entry.startsWith(`${AUTH_COOKIE_KEY}=`));
    return tokenCookie ? decodeURIComponent(tokenCookie.split("=")[1]) : undefined;
  }
  return undefined;
}

export async function requestJson<T>(path: string, init?: RequestInit, options?: AuthRequestOptions): Promise<T> {
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

export function shouldUseFallback(token?: string) {
  return USE_MOCK || ENABLE_DEV_FALLBACK || token === "mock-token";
}

export function shouldUseMockMode() {
  return USE_MOCK;
}
