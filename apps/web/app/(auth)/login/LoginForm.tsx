"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { login } from "@/features/auth/api";
import { useToast } from "@/components/ui/toast";
import { ApiError } from "@/features/outbound/api";

export function LoginForm({ nextUrl }: { nextUrl: string }) {
  const router = useRouter();
  const { pushToast } = useToast();

  const [email, setEmail] = useState("admin.demo@example.com");
  const [password, setPassword] = useState("1234");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!email.trim() || !password.trim()) {
      setError("Email and password are required.");
      return;
    }

    setError(null);
    setLoading(true);
    try {
      await login({ email: email.trim(), password });
      pushToast({ title: "Login successful", variant: "success" });
      router.replace(nextUrl);
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "Login request failed";
      setError(message);
      pushToast({ title: "Login failed", description: message, variant: "error" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#f7f9fc] p-6">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Kowinsblue 3PL Login</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <form onSubmit={onSubmit} className="space-y-3">
            <Input
              placeholder="Email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="email"
            />
            <Input
              placeholder="Password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
            />
            {error && <p className="text-sm text-red-600">{error}</p>}
            <Button className="w-full" disabled={loading}>
              {loading ? "Signing in..." : "Sign in"}
            </Button>
          </form>
          <p className="text-xs text-slate-500">Use a valid WMS API account.</p>
        </CardContent>
      </Card>
    </div>
  );
}
