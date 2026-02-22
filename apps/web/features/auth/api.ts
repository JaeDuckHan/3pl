import { AUTH_COOKIE_KEY } from "@/lib/auth";
import { ApiError } from "@/features/outbound/api";

type LoginPayload = {
  email: string;
  password: string;
};

type LoginResponse = {
  token: string;
  tokenType: string;
  expiresIn: string;
};

type MeResponse = {
  id: number;
  email: string;
  role: string;
  name: string | null;
};

type JsonResponse<T> = {
  ok: boolean;
  data?: T;
  message?: string;
};

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api/proxy${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const json = (await response.json()) as JsonResponse<T>;
  if (!response.ok || !json.ok || json.data === undefined) {
    throw new ApiError(json.message ?? "Request failed", response.status);
  }
  return json.data;
}

export async function login(payload: LoginPayload): Promise<{ token: string; email: string }> {
  const data = await requestJson<LoginResponse>("/auth/login", {
    method: "POST",
    body: JSON.stringify(payload),
  });

  const token = data.token;
  document.cookie = `${AUTH_COOKIE_KEY}=${encodeURIComponent(token)}; path=/; max-age=28800; samesite=lax; secure`;
  localStorage.setItem(AUTH_COOKIE_KEY, token);
  localStorage.setItem("kb3pl_user_email", payload.email);

  return { token, email: payload.email };
}

export async function getMe(): Promise<MeResponse> {
  const tokenCookie = document.cookie
    .split("; ")
    .find((entry) => entry.startsWith(`${AUTH_COOKIE_KEY}=`));
  const token = tokenCookie ? decodeURIComponent(tokenCookie.split("=")[1]) : "";
  if (!token) throw new ApiError("Missing auth token", 401);

  return requestJson<MeResponse>("/auth/me", {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
}

export function logout() {
  document.cookie = `${AUTH_COOKIE_KEY}=; path=/; max-age=0; samesite=lax`;
  localStorage.removeItem(AUTH_COOKIE_KEY);
  localStorage.removeItem("kb3pl_user_email");
}
