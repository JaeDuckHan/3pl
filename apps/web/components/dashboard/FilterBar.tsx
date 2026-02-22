"use client";

import type { ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { normalizeDate, normalizeInt, normalizeMonth } from "@/features/dashboard/input";
import { useI18n } from "@/lib/i18n/I18nProvider";

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
  const { t } = useI18n();
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
              placeholder={t("filter.from")}
              value={values.from ?? ""}
              onChange={(e) => onChange({ ...values, from: e.target.value.replace(/[^\d-]/g, "").slice(0, 10) })}
              onBlur={() => onChange({ ...values, from: normalizeDate(values.from ?? "") })}
            />
            <Input
              placeholder={t("filter.to")}
              value={values.to ?? ""}
              onChange={(e) => onChange({ ...values, to: e.target.value.replace(/[^\d-]/g, "").slice(0, 10) })}
              onBlur={() => onChange({ ...values, to: normalizeDate(values.to ?? "") })}
            />
          </>
        )}
        {mode === "date" && (
          <Input
            placeholder={t("filter.date")}
            value={values.date ?? ""}
            onChange={(e) => onChange({ ...values, date: e.target.value.replace(/[^\d-]/g, "").slice(0, 10) })}
            onBlur={() => onChange({ ...values, date: normalizeDate(values.date ?? "") })}
          />
        )}
        {mode === "month" && (
          <Input
            placeholder={t("filter.month")}
            value={values.month ?? ""}
            onChange={(e) => onChange({ ...values, month: e.target.value.replace(/[^\d-]/g, "").slice(0, 7) })}
            onBlur={() => onChange({ ...values, month: normalizeMonth(values.month ?? "") })}
          />
        )}

        {!hideWarehouse && (
          <Input
            placeholder={t("filter.warehouseId")}
            value={values.warehouseId ?? ""}
            onChange={(e) => onChange({ ...values, warehouseId: normalizeInt(e.target.value) })}
          />
        )}
        {!hideClient && (
          <Input
            placeholder={t("filter.clientId")}
            value={values.clientId ?? ""}
            onChange={(e) => onChange({ ...values, clientId: normalizeInt(e.target.value) })}
          />
        )}
        {children}
        <Button type="button" disabled={!canSubmit} onClick={submitFilters}>
          {loading ? t("common.loading") : t("common.load")}
        </Button>
        <Button
          type="button"
          variant="secondary"
          onClick={() => {
            onReset();
            syncQuery({}, keysToSync);
          }}
        >
          {t("common.reset")}
        </Button>
      </div>
      <div className="mt-2 text-xs text-slate-500">{t("filter.pressEnter")}</div>
      {validationError && <p className="mt-2 text-sm text-red-600">{validationError}</p>}
    </div>
  );
}
