import { cookies } from "next/headers";
import { NextRequest } from "next/server";
import { AUTH_COOKIE_KEY } from "@/lib/auth";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3100";

async function forward(request: NextRequest, params: { path: string[] }) {
  const token = (await cookies()).get(AUTH_COOKIE_KEY)?.value;
  const joinedPath = params.path.join("/");
  const query = request.nextUrl.search || "";
  const target = `${API_BASE_URL}/${joinedPath}${query}`;

  const headers = new Headers();
  const contentType = request.headers.get("content-type");
  const incomingAuth = request.headers.get("authorization");
  if (contentType) headers.set("content-type", contentType);
  if (incomingAuth) headers.set("authorization", incomingAuth);
  else if (token) headers.set("authorization", `Bearer ${token}`);

  const body =
    request.method === "GET" || request.method === "HEAD"
      ? undefined
      : await request.text();

  const response = await fetch(target, {
    method: request.method,
    headers,
    body,
    cache: "no-store",
  });

  const text = await response.text();
  const resHeaders = new Headers({
    "content-type": response.headers.get("content-type") ?? "application/json",
  });

  // On successful login, also set server cookie so next SSR/RSC requests always see token.
  if (joinedPath === "auth/login" && response.ok) {
    try {
      const parsed = JSON.parse(text) as { data?: { token?: string } };
      const token = parsed?.data?.token;
      if (token) {
        resHeaders.append(
          "set-cookie",
          `${AUTH_COOKIE_KEY}=${encodeURIComponent(token)}; Path=/; Max-Age=28800; SameSite=Lax; Secure`
        );
      }
    } catch {
      // ignore malformed JSON
    }
  }

  return new Response(text, {
    status: response.status,
    headers: resHeaders,
  });
}

export async function GET(request: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  return forward(request, await ctx.params);
}

export async function POST(request: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  return forward(request, await ctx.params);
}

export async function PUT(request: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  return forward(request, await ctx.params);
}

export async function DELETE(request: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  return forward(request, await ctx.params);
}
