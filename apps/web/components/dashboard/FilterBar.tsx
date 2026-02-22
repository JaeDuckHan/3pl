"use client";

import type { ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { normalizeDate, normalizeInt, normalizeMonth } from "@/features/dashboard/input";

export type FilterBarValues = {
  [key: string]: string | undefined;
  from?: string;
  to?: string;
  date?: string;
  month?: string;
  warehouseId?: string;
  clientId?: string;
};

type FilterBarProps = {
  mode: "date-range" | "date" | "month";
  values: FilterBarValues;
  loading?: boolean;
  validationError?: string | null;
  onChange: (next: FilterBarValues) => void;
  onSubmit: () => void;
  onReset: () => void;
  children?: ReactNode;
  hideWarehouse?: boolean;
  hideClient?: boolean;
  queryKeys?: string[];
  syncToUrl?: boolean;
};

export function FilterBar({
  mode,
  values,
  loading,
  validationError,
  onChange,
  onSubmit,
  onReset,
  children,
  hideWarehouse,
  hideClient,
  queryKeys,
  syncToUrl = true,
}: FilterBarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const syncQuery = (nextValues: FilterBarValues, keys: string[]) => {
    if (!syncToUrl) return;
    const params = new URLSearchParams(searchParams.toString());
    for (const key of keys) params.delete(key);
    for (const key of keys) {
      const value = nextValues[key]?.trim();
      if (value) params.set(key, value);
    }
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };

  const keysToSync = queryKeys ?? Object.keys(values);
  const canSubmit = !loading && !validationError;

  const submitFilters = () => {
    if (!canSubmit) return;
    syncQuery(values, keysToSync);
    onSubmit();
  };

  return (
    <div
      className="rounded-xl border bg-white p-4"
      onKeyDown={(e) => {
        if (e.key !== "Enter") return;
        e.preventDefault();
        submitFilters();
      }}
    >
      <div className="grid gap-3 md:grid-cols-6">
        {mode === "date-range" && (
          <>
            <Input
              placeholder="from YYYY-MM-DD"
              value={values.from ?? ""}
              onChange={(e) => onChange({ ...values, from: e.target.value.replace(/[^\d-]/g, "").slice(0, 10) })}
              onBlur={() => onChange({ ...values, from: normalizeDate(values.from ?? "") })}
            />
            <Input
              placeholder="to YYYY-MM-DD"
              value={values.to ?? ""}
              onChange={(e) => onChange({ ...values, to: e.target.value.replace(/[^\d-]/g, "").slice(0, 10) })}
              onBlur={() => onChange({ ...values, to: normalizeDate(values.to ?? "") })}
            />
          </>
        )}
        {mode === "date" && (
          <Input
            placeholder="date YYYY-MM-DD"
            value={values.date ?? ""}
            onChange={(e) => onChange({ ...values, date: e.target.value.replace(/[^\d-]/g, "").slice(0, 10) })}
            onBlur={() => onChange({ ...values, date: normalizeDate(values.date ?? "") })}
          />
        )}
        {mode === "month" && (
          <Input
            placeholder="month YYYY-MM"
            value={values.month ?? ""}
            onChange={(e) => onChange({ ...values, month: e.target.value.replace(/[^\d-]/g, "").slice(0, 7) })}
            onBlur={() => onChange({ ...values, month: normalizeMonth(values.month ?? "") })}
          />
        )}

        {!hideWarehouse && (
          <Input
            placeholder="warehouseId"
            value={values.warehouseId ?? ""}
            onChange={(e) => onChange({ ...values, warehouseId: normalizeInt(e.target.value) })}
          />
        )}
        {!hideClient && (
          <Input
            placeholder="clientId"
            value={values.clientId ?? ""}
            onChange={(e) => onChange({ ...values, clientId: normalizeInt(e.target.value) })}
          />
        )}
        {children}
        <Button type="button" disabled={!canSubmit} onClick={submitFilters}>
          {loading ? "Loading..." : "Load"}
        </Button>
        <Button
          type="button"
          variant="secondary"
          onClick={() => {
            onReset();
            syncQuery({}, keysToSync);
          }}
        >
          Reset
        </Button>
      </div>
      <div className="mt-2 text-xs text-slate-500">Press Enter to submit.</div>
      {validationError && <p className="mt-2 text-sm text-red-600">{validationError}</p>}
    </div>
  );
}
