"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ArrowDownUp, Copy, Download, ImageDown } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { DashboardTabs } from "@/components/dashboard/DashboardTabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ErrorState } from "@/components/ui/ErrorState";
import { EmptyState } from "@/components/ui/EmptyState";
import { FilterBar } from "@/components/dashboard/FilterBar";
import { CardsSkeleton, FilterBarSkeleton, TableSkeleton } from "@/components/dashboard/DashboardSkeleton";
import { GenerateSnapshotsButton } from "@/components/dashboard/GenerateSnapshotsButton";
import { DemoModeBanner, DemoModeToggle } from "@/components/dashboard/DemoModeToggle";
import {
  stickyHeaderClass,
  stickyIntersectionClass,
  stickyLeftClass,
  stickyTableClass,
  StickyTableContainer,
} from "@/components/dashboard/StickyTable";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getStorageBillingPreview, type StorageBillingResponse } from "@/features/dashboard/api";
import { captureElementToPng } from "@/features/dashboard/capture";
import { normalizeInt, normalizeMonth } from "@/features/dashboard/input";
import { useDashboardToast } from "@/features/dashboard/toast";
import { useDemoMode } from "@/features/dashboard/useDemoMode";
import {
  compareNumber,
  copyToClipboard,
  downloadCsv,
  formatCbm,
  formatMoney,
  readFiltersFromSearchParams,
  safeNumber,
  toCsv,
  toTsv,
  type CsvColumn,
  type SortDirection,
  writeFiltersToUrl,
} from "@/features/dashboard/utils";

function thisMonth() {
  return new Date().toISOString().slice(0, 7);
}

function isNonNegativeNumber(value: string) {
  return value === "" || (!Number.isNaN(Number(value)) && Number(value) >= 0);
}

type BillingSortKey = "days_count" | "avg_cbm" | "avg_pallet" | "amount_total";

type BillingFilters = {
  month: string;
  warehouseId: string;
  clientId: string;
  rateCbm: string;
  ratePallet: string;
};

const billingColumns = [
  { key: "warehouse_id", label: "warehouse_id" },
  { key: "client_id", label: "client_id" },
  { key: "days_count", label: "days_count" },
  { key: "avg_cbm", label: "avg_cbm" },
  { key: "avg_pallet", label: "avg_pallet" },
  { key: "amount_total", label: "amount_total" },
] satisfies CsvColumn<Record<string, unknown>>[];

export function StorageBillingPage() {
  const { toastError, toastSuccess } = useDashboardToast();
  const { demoMode, ready: demoReady, toggleDemoMode } = useDemoMode();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const captureRef = useRef<HTMLDivElement | null>(null);
  const [bootstrapped, setBootstrapped] = useState(false);

  const defaultFilters = useMemo(
    () => ({
      month: thisMonth(),
      warehouseId: "",
      clientId: "",
      rateCbm: "",
      ratePallet: "",
    }),
    []
  );
  const initialFilters = useMemo(
    () => readFiltersFromSearchParams(searchParams, defaultFilters),
    [defaultFilters, searchParams]
  );
  const hasExplicitFilterQuery = useMemo(() => {
    return ["month", "warehouseId", "clientId", "rateCbm", "ratePallet"].some((key) => !!searchParams.get(key));
  }, [searchParams]);

  const [month, setMonth] = useState(initialFilters.month);
  const [warehouseId, setWarehouseId] = useState(initialFilters.warehouseId);
  const [clientId, setClientId] = useState(initialFilters.clientId);
  const [rateCbm, setRateCbm] = useState(initialFilters.rateCbm);
  const [ratePallet, setRatePallet] = useState(initialFilters.ratePallet);
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<BillingSortKey>("amount_total");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<StorageBillingResponse | null>(null);

  const buildFilters = useCallback(
    (next?: Partial<BillingFilters>) => ({
      month: next?.month ?? month,
      warehouseId: next?.warehouseId ?? warehouseId,
      clientId: next?.clientId ?? clientId,
      rateCbm: next?.rateCbm ?? rateCbm,
      ratePallet: next?.ratePallet ?? ratePallet,
    }),
    [clientId, month, rateCbm, ratePallet, warehouseId]
  );

  const getValidationError = useCallback((filters: BillingFilters) => {
    if (!normalizeMonth(filters.month)) return "month must use YYYY-MM format.";
    if (filters.warehouseId && !normalizeInt(filters.warehouseId)) return "warehouseId must be a positive integer.";
    if (filters.clientId && !normalizeInt(filters.clientId)) return "clientId must be a positive integer.";
    if (!isNonNegativeNumber(filters.rateCbm)) return "rateCbm must be a number >= 0.";
    if (!isNonNegativeNumber(filters.ratePallet)) return "ratePallet must be a number >= 0.";
    return null;
  }, []);

  const validationError = useMemo(() => {
    return getValidationError(buildFilters());
  }, [buildFilters, getValidationError]);

  const loadWithFilters = useCallback(async (filters: BillingFilters) => {
    const normalizedMonth = normalizeMonth(filters.month);
    if (!normalizedMonth) return;
    setLoading(true);
    setError(null);
    try {
      const result = await getStorageBillingPreview({
        month: normalizedMonth,
        warehouseId: filters.warehouseId ? Number(normalizeInt(filters.warehouseId)) : undefined,
        clientId: filters.clientId ? Number(normalizeInt(filters.clientId)) : undefined,
        rateCbm: filters.rateCbm ? Number(filters.rateCbm) : undefined,
        ratePallet: filters.ratePallet ? Number(filters.ratePallet) : undefined,
      });
      setData(result);
    } catch (e) {
      const message = e instanceof Error ? e.message : "Failed to load billing preview.";
      setError(message);
      toastError(message);
    } finally {
      setLoading(false);
    }
  }, [toastError]);

  const load = useCallback(async () => {
    const filters = buildFilters();
    if (getValidationError(filters)) return;
    await loadWithFilters(filters);
  }, [buildFilters, getValidationError, loadWithFilters]);

  useEffect(() => {
    if (!demoReady || bootstrapped) return;
    if (demoMode && !hasExplicitFilterQuery) {
      const preset = {
        month: thisMonth(),
        warehouseId: "",
        clientId: "",
        rateCbm: "",
        ratePallet: "",
      };
      setMonth(preset.month);
      setWarehouseId("");
      setClientId("");
      setRateCbm("");
      setRatePallet("");
      writeFiltersToUrl(router, pathname, preset);
      void loadWithFilters(preset);
      setBootstrapped(true);
      return;
    }
    void load();
    setBootstrapped(true);
  }, [bootstrapped, demoMode, demoReady, hasExplicitFilterQuery, load, loadWithFilters, pathname, router]);

  const tableRows = useMemo(() => {
    if (!data?.lines?.length) return [];
    const keyword = search.trim().toLowerCase();
    const filtered = keyword
      ? data.lines.filter((row) => {
          const warehouseText = String(row.warehouse_id).toLowerCase();
          const clientText = String(row.client_id).toLowerCase();
          return warehouseText.includes(keyword) || clientText.includes(keyword);
        })
      : data.lines;

    return [...filtered].sort((a, b) => {
      return compareNumber(a[sortKey], b[sortKey], sortDirection);
    });
  }, [data?.lines, search, sortDirection, sortKey]);

  const reset = () => {
    const next = {
      month: defaultFilters.month,
      warehouseId: defaultFilters.warehouseId,
      clientId: defaultFilters.clientId,
      rateCbm: defaultFilters.rateCbm,
      ratePallet: defaultFilters.ratePallet,
    };
    setMonth(next.month);
    setWarehouseId(next.warehouseId);
    setClientId(next.clientId);
    setRateCbm(next.rateCbm);
    setRatePallet(next.ratePallet);
    setSearch("");
    writeFiltersToUrl(router, pathname, {});
    void loadWithFilters(next);
  };

  const applyFilters = () => {
    const next = buildFilters();
    if (getValidationError(next)) return;
    const normalizedMonth = normalizeMonth(next.month);
    const normalizedWarehouse = normalizeInt(next.warehouseId);
    const normalizedClient = normalizeInt(next.clientId);
    setMonth(normalizedMonth);
    setWarehouseId(normalizedWarehouse);
    setClientId(normalizedClient);
    writeFiltersToUrl(router, pathname, {
      month: normalizedMonth,
      rateCbm: next.rateCbm,
      ratePallet: next.ratePallet,
      warehouseId: normalizedWarehouse,
      clientId: normalizedClient,
    });
    void loadWithFilters({
      month: normalizedMonth,
      warehouseId: normalizedWarehouse,
      clientId: normalizedClient,
      rateCbm: next.rateCbm,
      ratePallet: next.ratePallet,
    });
  };

  const toggleSort = (next: BillingSortKey) => {
    if (sortKey === next) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
      return;
    }
    setSortKey(next);
    setSortDirection("desc");
  };

  const copyJson = async () => {
    if (!data) return;
    try {
      await navigator.clipboard.writeText(JSON.stringify(data, null, 2));
      toastSuccess("Copied JSON");
    } catch {
      toastError("Copy failed");
    }
  };

  const exportCsv = () => {
    const rows = tableRows.map((row) => ({
      warehouse_id: safeNumber(row.warehouse_id),
      client_id: safeNumber(row.client_id),
      days_count: safeNumber(row.days_count),
      avg_cbm: safeNumber(row.avg_cbm),
      avg_pallet: safeNumber(row.avg_pallet),
      amount_total: safeNumber(row.amount_total),
    }));
    const csv = toCsv(rows, billingColumns);
    downloadCsv(`storage-billing-${month}.csv`, csv);
    toastSuccess("CSV downloaded");
  };

  const copyTable = async () => {
    if (!tableRows.length) return;
    try {
      const rows = tableRows.map((row) => ({
        warehouse_id: safeNumber(row.warehouse_id),
        client_id: safeNumber(row.client_id),
        days_count: safeNumber(row.days_count),
        avg_cbm: safeNumber(row.avg_cbm),
        avg_pallet: safeNumber(row.avg_pallet),
        amount_total: safeNumber(row.amount_total),
      }));
      await copyToClipboard(toTsv(rows, billingColumns));
      toastSuccess("Copied to clipboard");
    } catch {
      toastError("Copy failed");
    }
  };

  const savePng = async () => {
    if (!captureRef.current) return;
    try {
      await captureElementToPng(captureRef.current, `billing_${month || thisMonth()}.png`);
      toastSuccess("PNG saved");
    } catch {
      toastError("PNG save failed");
    }
  };

  const applyThisMonthPreset = () => {
    const next = {
      month: thisMonth(),
      warehouseId,
      clientId,
      rateCbm,
      ratePallet,
    };
    setMonth(next.month);
    writeFiltersToUrl(router, pathname, next);
    void loadWithFilters(next);
  };

  return (
    <section>
      <PageHeader
        breadcrumbs={[{ label: "Dashboard", href: "/dashboard" }, { label: "Storage Billing" }]}
        title="Storage Billing Preview"
        description="Monthly storage billing simulation."
        actions={
          <div className="flex flex-wrap gap-2">
            {demoReady ? <DemoModeToggle demoMode={demoMode} onToggle={toggleDemoMode} /> : null}
            {demoMode ? <GenerateSnapshotsButton /> : null}
            <Button type="button" variant="secondary" onClick={() => void savePng()} disabled={loading}>
              <ImageDown className="h-4 w-4" />
              Save PNG
            </Button>
            <Button type="button" variant="secondary" onClick={() => void copyJson()} disabled={!data}>
              <Copy className="h-4 w-4" />
              Copy JSON
            </Button>
          </div>
        }
      />
      <DashboardTabs />
      {demoReady ? <DemoModeBanner demoMode={demoMode} /> : null}

      {loading && !data ? <FilterBarSkeleton /> : null}
      <FilterBar
        mode="month"
        values={{ month, warehouseId, clientId, rateCbm, ratePallet, search }}
        loading={loading}
        validationError={validationError}
        onChange={(next) => {
          setMonth(next.month ?? "");
          setWarehouseId(next.warehouseId ?? "");
          setClientId(next.clientId ?? "");
        }}
        onSubmit={applyFilters}
        onReset={reset}
        syncToUrl={false}
      >
        <Input
          placeholder="rateCbm"
          value={rateCbm}
          onChange={(e) => setRateCbm(e.target.value)}
          inputMode="decimal"
        />
        <Input
          placeholder="ratePallet"
          value={ratePallet}
          onChange={(e) => setRatePallet(e.target.value)}
          inputMode="decimal"
        />
        <Button type="button" variant="secondary" onClick={applyThisMonthPreset} disabled={loading}>
          This month
        </Button>
      </FilterBar>

      {error && (
        <div className="mb-4">
          <ErrorState title="Failed to load billing preview" message={error} onRetry={() => void load()} />
        </div>
      )}

      {loading ? <CardsSkeleton count={3} /> : null}
      {!loading && (
        <div ref={captureRef} className="mb-4 space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader>
              <CardTitle>Amount Total</CardTitle>
            </CardHeader>
            <CardContent className="text-2xl font-semibold">{formatMoney(data?.summary.amount_total ?? 0)}</CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Amount CBM</CardTitle>
            </CardHeader>
            <CardContent className="text-2xl font-semibold">{formatMoney(data?.summary.amount_cbm ?? 0)}</CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Amount Pallet</CardTitle>
            </CardHeader>
            <CardContent className="text-2xl font-semibold">{formatMoney(data?.summary.amount_pallet ?? 0)}</CardContent>
          </Card>
          </div>

          <Card>
            <CardHeader className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <CardTitle>Billing Lines</CardTitle>
              <p className="text-sm text-slate-500">Monthly line-item preview by warehouse and client.</p>
            </CardHeader>
          </Card>
        </div>
      )}

      <Card>
        <CardHeader className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <CardTitle>Billing Lines</CardTitle>
          <div className="flex w-full flex-col gap-2 md:w-auto md:flex-row">
            <Input
              placeholder="Search warehouse_id/client_id"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="md:w-64"
            />
            <Button type="button" variant="secondary" onClick={exportCsv} disabled={!tableRows.length}>
              <Download className="h-4 w-4" />
              CSV export
            </Button>
            <Button type="button" variant="secondary" onClick={() => void copyTable()} disabled={!tableRows.length}>
              <Copy className="h-4 w-4" />
              Copy table
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <TableSkeleton rows={8} cols={6} />
          ) : !tableRows.length ? (
            <EmptyState
              title="No billing lines"
              description="Try removing filters or generate recent snapshots for demo data."
              actions={
                <GenerateSnapshotsButton
                  warehouseId={warehouseId ? Number(warehouseId) : undefined}
                  clientId={clientId ? Number(clientId) : undefined}
                />
              }
            />
          ) : (
            <StickyTableContainer>
              <Table className={stickyTableClass}>
                <TableHeader>
                  <TableRow>
                    <TableHead className={`${stickyHeaderClass} ${stickyLeftClass} ${stickyIntersectionClass} left-0 w-32`}>
                      warehouse_id
                    </TableHead>
                    <TableHead className={`${stickyHeaderClass} ${stickyLeftClass} ${stickyIntersectionClass} left-[8rem] w-32`}>
                      client_id
                    </TableHead>
                    <TableHead className={`${stickyHeaderClass} text-right`}>
                      <button type="button" className="inline-flex items-center gap-1" onClick={() => toggleSort("days_count")}>
                        days_count
                        <ArrowDownUp className="h-3.5 w-3.5" />
                      </button>
                    </TableHead>
                    <TableHead className={`${stickyHeaderClass} text-right`}>
                      <button type="button" className="inline-flex items-center gap-1" onClick={() => toggleSort("avg_cbm")}>
                        avg_cbm
                        <ArrowDownUp className="h-3.5 w-3.5" />
                      </button>
                    </TableHead>
                    <TableHead className={`${stickyHeaderClass} text-right`}>
                      <button type="button" className="inline-flex items-center gap-1" onClick={() => toggleSort("avg_pallet")}>
                        avg_pallet
                        <ArrowDownUp className="h-3.5 w-3.5" />
                      </button>
                    </TableHead>
                    <TableHead className={`${stickyHeaderClass} text-right`}>
                      <button type="button" className="inline-flex items-center gap-1" onClick={() => toggleSort("amount_total")}>
                        amount_total
                        <ArrowDownUp className="h-3.5 w-3.5" />
                      </button>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {tableRows.map((row) => (
                    <TableRow key={`${row.warehouse_id}-${row.client_id}`}>
                      <TableCell className={`${stickyLeftClass} left-0 w-32`}>{row.warehouse_id}</TableCell>
                      <TableCell className={`${stickyLeftClass} left-[8rem] w-32`}>{row.client_id}</TableCell>
                      <TableCell className="text-right">
                        <div className="inline-flex items-center gap-2">
                          <span>{safeNumber(row.days_count).toLocaleString()}</span>
                          {row.days_count < 20 ? <Badge variant="warning">insufficient snapshot days</Badge> : null}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">{formatCbm(row.avg_cbm)}</TableCell>
                      <TableCell className="text-right">{formatCbm(row.avg_pallet)}</TableCell>
                      <TableCell className="text-right">{formatMoney(row.amount_total)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </StickyTableContainer>
          )}
        </CardContent>
      </Card>
    </section>
  );
}


