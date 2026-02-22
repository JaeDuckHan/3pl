import { cookies } from "next/headers";
import { NextRequest } from "next/server";
import { AUTH_COOKIE_KEY } from "@/lib/auth";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3100";

function buildTargets(joinedPath: string, query: string) {
  return [`${API_BASE_URL}/api/dashboard/${joinedPath}${query}`, `${API_BASE_URL}/dashboard/${joinedPath}${query}`];
}

async function forward(request: NextRequest, params: { path: string[] }) {
  const token = (await cookies()).get(AUTH_COOKIE_KEY)?.value;
  const joinedPath = params.path.join("/");
  const query = request.nextUrl.search || "";
  const targets = buildTargets(joinedPath, query);

  const headers = new Headers();
  const incomingAuth = request.headers.get("authorization");
  if (incomingAuth) headers.set("authorization", incomingAuth);
  else if (token) headers.set("authorization", `Bearer ${token}`);
  const contentType = request.headers.get("content-type");
  if (contentType) headers.set("content-type", contentType);

  const body = request.method === "GET" || request.method === "HEAD" ? undefined : await request.text();

  let response: Response | null = null;
  for (const target of targets) {
    response = await fetch(target, {
      method: request.method,
      headers,
      cache: "no-store",
      body,
    });
    if (response.status !== 404) break;
  }

  if (!response) {
    return Response.json({ ok: false, message: "Dashboard proxy request failed" }, { status: 502 });
  }

  const text = await response.text();
  return new Response(text, {
    status: response.status,
    headers: {
      "content-type": response.headers.get("content-type") ?? "application/json",
    },
  });
}

export async function GET(request: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  return forward(request, await ctx.params);
}

export async function POST(request: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  return forward(request, await ctx.params);
}
