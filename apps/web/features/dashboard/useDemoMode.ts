"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

const STORAGE_KEY = "dashboard_demo_mode";

function parseDemoValue(value: string | null) {
  if (value === "1") return true;
  if (value === "0") return false;
  return null;
}

export function useDemoMode() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [demoMode, setDemoModeState] = useState(false);
  const [ready, setReady] = useState(false);

  const isDashboardRoute = useMemo(() => pathname.startsWith("/dashboard"), [pathname]);

  useEffect(() => {
    const queryValue = parseDemoValue(searchParams.get("demo"));
    const storedValue = parseDemoValue(window.localStorage.getItem(STORAGE_KEY));
    const resolved = queryValue ?? storedValue ?? false;
    setDemoModeState(resolved);
    setReady(true);
  }, [searchParams]);

  useEffect(() => {
    if (!ready) return;
    window.localStorage.setItem(STORAGE_KEY, demoMode ? "1" : "0");
    if (!isDashboardRoute) return;

    const params = new URLSearchParams(searchParams.toString());
    if (demoMode) {
      params.set("demo", "1");
    } else {
      params.delete("demo");
    }
    const nextQuery = params.toString();
    const currentQuery = searchParams.toString();
    if (nextQuery === currentQuery) return;
    router.replace(nextQuery ? `${pathname}?${nextQuery}` : pathname, { scroll: false });
  }, [demoMode, isDashboardRoute, pathname, ready, router, searchParams]);

  const setDemoMode = useCallback((next: boolean) => {
    setDemoModeState(next);
  }, []);

  const toggleDemoMode = useCallback(() => {
    setDemoModeState((prev) => !prev);
  }, []);

  return { demoMode, setDemoMode, toggleDemoMode, ready };
}
