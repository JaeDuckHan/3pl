"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Bell, Search, UserCircle2 } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { logout } from "@/features/auth/api";
import { useToast } from "@/components/ui/toast";

export function Topbar() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const { pushToast } = useToast();

  const initialQuery = useMemo(() => searchParams.get("q") ?? "", [searchParams]);
  const [query, setQuery] = useState(initialQuery);

  useEffect(() => {
    setQuery(initialQuery);
  }, [initialQuery]);

  const onSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const params = new URLSearchParams(searchParams.toString());
    if (query.trim()) params.set("q", query.trim());
    else params.delete("q");
    const nextPath = pathname.startsWith("/inbounds")
      ? pathname
      : pathname.startsWith("/outbounds")
        ? pathname
        : "/outbounds";
    router.push(`${nextPath}?${params.toString()}`);
  };

  const onLogout = () => {
    logout();
    pushToast({ title: "Signed out", variant: "info" });
    router.push("/login");
  };

  return (
    <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b bg-white px-6">
      <form onSubmit={onSearch} className="relative w-full max-w-md">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <Input
          placeholder="Search orders, clients, products..."
          className="pl-9"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </form>
      <div className="ml-4 flex items-center gap-2">
        <button type="button" className="rounded-md p-2 text-slate-500 hover:bg-slate-100">
          <Bell className="h-5 w-5" />
        </button>
        <Button variant="secondary" size="sm" onClick={onLogout}>
          <UserCircle2 className="h-4 w-4" />
          Admin
        </Button>
      </div>
    </header>
  );
}
