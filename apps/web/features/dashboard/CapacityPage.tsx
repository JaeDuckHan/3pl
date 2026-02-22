"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { AlertTriangle, ArrowDownUp, Copy, Download, ImageDown } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/ui/PageHeader";
import { DashboardTabs } from "@/components/dashboard/DashboardTabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
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
import { getStorageCapacity, type CapacityStatus, type StorageCapacityResponse } from "@/features/dashboard/api";
import { captureElementToPng } from "@/features/dashboard/capture";
import { normalizeDate, normalizeInt } from "@/features/dashboard/input";
import { useDashboardToast } from "@/features/dashboard/toast";
import { useDemoMode } from "@/features/dashboard/useDemoMode";
import { useI18n } from "@/lib/i18n/I18nProvider";
import {
  compareNumber,
  copyToClipboard,
  downloadCsv,
  formatCbm,
  formatPct,
  readFiltersFromSearchParams,
  safeNumber,
  toCsv,
  toTsv,
  type CsvColumn,
  type SortDirection,
  writeFiltersToUrl,
} from "@/features/dashboard/utils";

function today() {
  return new Date().toISOString().slice(0, 10);
}

function previousDate(dateText: string) {
  const date = new Date(`${dateText}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

function StatusCell({ status }: { status: CapacityStatus }) {
  if (status === "critical") return <Badge variant="danger">critical</Badge>;
  if (status === "warn") return <Badge variant="warning">warn</Badge>;
  return <Badge variant="success">ok</Badge>;
}

function UsageProgress({
  usagePct,
  capacityCbm,
  deltaPct,
}: {
  usagePct: number | null;
  capacityCbm: number | null;
  deltaPct: number | null;
}) {
  const deltaBadge =
    deltaPct == null ? (
      <Badge variant="default">Δ -</Badge>
    ) : deltaPct > 0 ? (
      <Badge variant="danger">Δ +{formatPct(Math.abs(deltaPct))}</Badge>
    ) : deltaPct < 0 ? (
      <Badge variant="success">Δ -{formatPct(Math.abs(deltaPct))}</Badge>
    ) : (
      <Badge variant="default">Δ {formatPct(0)}</Badge>
    );

  if (safeNumber(capacityCbm) <= 0) {
    return (
      <div className="flex items-center justify-end gap-2">
        <span className="text-xs text-slate-500">capacity not set</span>
        {deltaBadge}
      </div>
    );
  }
  const clamped = Math.min(Math.max(safeNumber(usagePct), 0), 100);
  const tone = clamped >= 95 ? "bg-red-500" : clamped >= 85 ? "bg-amber-500" : "bg-emerald-500";
  return (
    <div className="flex items-center justify-end gap-2">
      <div className="h-2 w-28 overflow-hidden rounded-full bg-slate-200">
        <div className={`h-full ${tone}`} style={{ width: `${clamped}%` }} />
      </div>
      <span className="min-w-12 text-right">{formatPct(usagePct)}</span>
      {deltaBadge}
    </div>
  );
}

type CapacitySortKey = "used_cbm" | "capacity_cbm" | "usage_pct_cbm";

type CapacityFilters = {
  date: string;
  warehouseId: string;
};

const capacityColumns = [
  { key: "warehouse_id", label: "warehouse_id" },
  { key: "used_cbm", label: "used_cbm" },
  { key: "capacity_cbm", label: "capacity_cbm" },
  { key: "usage_pct_cbm", label: "usage_pct_cbm" },
  { key: "status", label: "status" },
  { key: "used_pallet", label: "used_pallet" },
  { key: "capacity_pallet", label: "capacity_pallet" },
  { key: "usage_pct_pallet", label: "usage_pct_pallet" },
] satisfies CsvColumn<Record<string, unknown>>[];

export function CapacityPage() {
  const { t } = useI18n();
  const { toastError, toastSuccess } = useDashboardToast();
  const { demoMode, ready: demoReady, toggleDemoMode } = useDemoMode();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const captureRef = useRef<HTMLDivElement | null>(null);
  const [bootstrapped, setBootstrapped] = useState(false);

  const defaultFilters = useMemo(
    () => ({
      date: today(),
      warehouseId: "",
    }),
    []
  );
  const initialFilters = useMemo(
    () => readFiltersFromSearchParams(searchParams, defaultFilters),
    [defaultFilters, searchParams]
  );
  const hasExplicitFilterQuery = useMemo(() => {
    return ["date", "warehouseId"].some((key) => !!searchParams.get(key));
  }, [searchParams]);

  const [date, setDate] = useState(initialFilters.date);
  const [warehouseId, setWarehouseId] = useState(initialFilters.warehouseId);
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<CapacitySortKey>("usage_pct_cbm");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<StorageCapacityResponse | null>(null);
  const [previousData, setPreviousData] = useState<StorageCapacityResponse | null>(null);

  const buildFilters = useCallback(
    (next?: Partial<CapacityFilters>) => ({
      date: next?.date ?? date,
      warehouseId: next?.warehouseId ?? warehouseId,
    }),
    [date, warehouseId]
  );

  const getValidationError = useCallback((filters: CapacityFilters) => {
    if (filters.date && !normalizeDate(filters.date)) return "date must use YYYY-MM-DD format.";
    if (filters.warehouseId && !normalizeInt(filters.warehouseId)) return "warehouseId must be a positive integer.";
    return null;
  }, []);

  const validationError = useMemo(() => {
    return getValidationError(buildFilters());
  }, [buildFilters, getValidationError]);

  const loadWithFilters = useCallback(async (filters: CapacityFilters) => {
    const normalizedDate = normalizeDate(filters.date);
    setLoading(true);
    setError(null);
    try {
      const currentQuery = {
        date: normalizedDate || undefined,
        warehouseId: filters.warehouseId ? Number(normalizeInt(filters.warehouseId)) : undefined,
      };
      const previousQuery = normalizedDate
        ? {
            date: previousDate(normalizedDate),
            warehouseId: filters.warehouseId ? Number(normalizeInt(filters.warehouseId)) : undefined,
          }
        : undefined;
      const [currentResult, previousResult] = await Promise.allSettled([
        getStorageCapacity(currentQuery),
        previousQuery ? getStorageCapacity(previousQuery) : Promise.resolve(null),
      ]);
      if (currentResult.status === "rejected") {
        throw currentResult.reason;
      }
      setData(currentResult.value);
      setPreviousData(previousResult.status === "fulfilled" ? previousResult.value : null);
    } catch (e) {
      const message = e instanceof Error ? e.message : "Failed to load capacity.";
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
        date: "",
        warehouseId: "",
      };
      setDate("");
      setWarehouseId("");
      writeFiltersToUrl(router, pathname, preset);
      void loadWithFilters(preset);
      setBootstrapped(true);
      return;
    }
    void load();
    setBootstrapped(true);
  }, [bootstrapped, demoMode, demoReady, hasExplicitFilterQuery, load, loadWithFilters, pathname, router]);

  const alertRows = useMemo(() => {
    const rows = data?.warehouses ?? [];
    const severity = (status: CapacityStatus) => {
      if (status === "critical") return 0;
      if (status === "warn") return 1;
      return 2;
    };
    return rows
      .filter((row) => row.status !== "ok")
      .sort((a, b) => {
        const byStatus = severity(a.status) - severity(b.status);
        if (byStatus !== 0) return byStatus;
        return safeNumber(b.usage_pct_cbm) - safeNumber(a.usage_pct_cbm);
      });
  }, [data?.warehouses]);

  const tableRows = useMemo(() => {
    const rows = data?.warehouses ?? [];
    const keyword = search.trim().toLowerCase();
    const filtered = keyword ? rows.filter((row) => String(row.warehouse_id).toLowerCase().includes(keyword)) : rows;
    return [...filtered].sort((a, b) => compareNumber(a[sortKey], b[sortKey], sortDirection));
  }, [data?.warehouses, search, sortDirection, sortKey]);

  const previousUsageByWarehouse = useMemo(() => {
    return new Map((previousData?.warehouses ?? []).map((row) => [row.warehouse_id, row.usage_pct_cbm]));
  }, [previousData?.warehouses]);

  const avgUsageToday = useMemo(() => {
    const rows = data?.warehouses ?? [];
    const values = rows.map((row) => row.usage_pct_cbm).filter((value) => value != null).map((value) => safeNumber(value));
    if (!values.length) return null;
    return values.reduce((sum, value) => sum + value, 0) / values.length;
  }, [data?.warehouses]);

  const avgUsagePrev = useMemo(() => {
    const rows = previousData?.warehouses ?? [];
    const values = rows.map((row) => row.usage_pct_cbm).filter((value) => value != null).map((value) => safeNumber(value));
    if (!values.length) return null;
    return values.reduce((sum, value) => sum + value, 0) / values.length;
  }, [previousData?.warehouses]);

  const avgUsageDelta = useMemo(() => {
    if (avgUsageToday == null || avgUsagePrev == null) return null;
    return avgUsageToday - avgUsagePrev;
  }, [avgUsagePrev, avgUsageToday]);

  const reset = () => {
    const next = {
      date: defaultFilters.date,
      warehouseId: defaultFilters.warehouseId,
    };
    setDate(next.date);
    setWarehouseId(next.warehouseId);
    setSearch("");
    writeFiltersToUrl(router, pathname, {});
    void loadWithFilters(next);
  };

  const applyFilters = () => {
    const next = buildFilters();
    if (getValidationError(next)) return;
    const normalizedDate = normalizeDate(next.date);
    const normalizedWarehouse = normalizeInt(next.warehouseId);
    setDate(normalizedDate);
    setWarehouseId(normalizedWarehouse);
    writeFiltersToUrl(router, pathname, { date: normalizedDate, warehouseId: normalizedWarehouse });
    void loadWithFilters({ date: normalizedDate, warehouseId: normalizedWarehouse });
  };

  const toggleSort = (next: CapacitySortKey) => {
    if (sortKey === next) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
      return;
    }
    setSortKey(next);
    setSortDirection("desc");
  };

  const exportCsv = () => {
    const rows = tableRows.map((row) => ({
      warehouse_id: safeNumber(row.warehouse_id),
      used_cbm: safeNumber(row.used_cbm),
      capacity_cbm: row.capacity_cbm ?? "",
      usage_pct_cbm: row.usage_pct_cbm ?? "",
      status: row.status,
      used_pallet: safeNumber(row.used_pallet),
      capacity_pallet: row.capacity_pallet ?? "",
      usage_pct_pallet: row.usage_pct_pallet ?? "",
    }));
    const csv = toCsv(rows, capacityColumns);
    downloadCsv(`storage-capacity-${date || "today"}.csv`, csv);
    toastSuccess("CSV downloaded");
  };

  const copyTable = async () => {
    if (!tableRows.length) return;
    try {
      const rows = tableRows.map((row) => ({
        warehouse_id: safeNumber(row.warehouse_id),
        used_cbm: safeNumber(row.used_cbm),
        capacity_cbm: row.capacity_cbm ?? "",
        usage_pct_cbm: row.usage_pct_cbm ?? "",
        status: row.status,
        used_pallet: safeNumber(row.used_pallet),
        capacity_pallet: row.capacity_pallet ?? "",
        usage_pct_pallet: row.usage_pct_pallet ?? "",
      }));
      await copyToClipboard(toTsv(rows, capacityColumns));
      toastSuccess("Copied to clipboard");
    } catch {
      toastError("Copy failed");
    }
  };

  const savePng = async () => {
    if (!captureRef.current) return;
    try {
      await captureElementToPng(captureRef.current, `capacity_${date || "today"}.png`);
      toastSuccess("PNG saved");
    } catch {
      toastError("PNG save failed");
    }
  };

  return (
    <section>
      <PageHeader
        breadcrumbs={[{ label: t("nav.dashboard"), href: "/dashboard" }, { label: t("capacity.title") }]}
        title={t("capacity.title")}
        description={t("capacity.desc")}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {demoReady ? <DemoModeToggle demoMode={demoMode} onToggle={toggleDemoMode} /> : null}
            {demoMode ? <GenerateSnapshotsButton warehouseId={warehouseId ? Number(warehouseId) : undefined} /> : null}
            <Button type="button" variant="secondary" onClick={() => void savePng()} disabled={loading}>
              <ImageDown className="h-4 w-4" />
              {t("common.savePng")}
            </Button>
          </div>
        }
      />
      <DashboardTabs />
      {demoReady ? <DemoModeBanner demoMode={demoMode} /> : null}

      <div ref={captureRef} className="mb-4 space-y-4">
      <Card className="border-amber-200 bg-amber-50">
        <CardHeader className="py-3">
          <CardTitle className="flex items-center gap-2 text-amber-800">
            <AlertTriangle className="h-4 w-4" />
            Alerts
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!alertRows.length ? (
            <p className="text-sm text-amber-800">All warehouses are currently in ok status.</p>
          ) : (
            <div className="space-y-2">
              {alertRows.map((row) => (
                <div
                  key={`alert-${row.warehouse_id}`}
                  className="flex items-center justify-between rounded-md border border-amber-200 bg-white px-3 py-2 text-sm"
                >
                  <div className="flex items-center gap-2">
                    <StatusCell status={row.status} />
                    <span>
                      Warehouse {row.warehouse_id} · {formatCbm(row.used_cbm)} / {row.capacity_cbm == null ? "-" : formatCbm(row.capacity_cbm)} CBM
                      {row.capacity_cbm == null ? "" : ` (${formatPct(row.usage_pct_cbm)})`}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {loading ? <CardsSkeleton count={2} /> : null}
      {!loading && (
        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Average CBM Usage</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <span className="text-2xl font-semibold">{formatPct(avgUsageToday)}</span>
                {avgUsageDelta == null ? (
                  <Badge variant="default">Δ -</Badge>
                ) : avgUsageDelta > 0 ? (
                  <Badge variant="danger">Δ +{formatPct(Math.abs(avgUsageDelta))}</Badge>
                ) : avgUsageDelta < 0 ? (
                  <Badge variant="success">Δ -{formatPct(Math.abs(avgUsageDelta))}</Badge>
                ) : (
                  <Badge variant="default">Δ {formatPct(0)}</Badge>
                )}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>At-Risk Warehouses</CardTitle>
            </CardHeader>
            <CardContent className="text-2xl font-semibold">{alertRows.length.toLocaleString()}</CardContent>
          </Card>
        </div>
      )}
      </div>

      {loading && !data ? <FilterBarSkeleton /> : null}
      <FilterBar
        mode="date"
        values={{ date, warehouseId, search }}
        loading={loading}
        validationError={validationError}
        onChange={(next) => {
          setDate(next.date ?? "");
          setWarehouseId(next.warehouseId ?? "");
        }}
        onSubmit={applyFilters}
        onReset={reset}
        hideClient
        syncToUrl={false}
      />

      {error && (
        <div className="mb-4">
          <ErrorState title="Failed to load capacity" message={error} onRetry={() => void load()} />
        </div>
      )}

      <Card>
        <CardHeader className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <CardTitle>Warehouses</CardTitle>
          <div className="flex w-full flex-col gap-2 md:w-auto md:flex-row">
            <Input
              placeholder="Search warehouse_id"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="md:w-56"
            />
            <Button type="button" variant="secondary" onClick={exportCsv} disabled={!tableRows.length}>
              <Download className="h-4 w-4" />
              {t("common.downloadCsv")}
            </Button>
            <Button type="button" variant="secondary" onClick={() => void copyTable()} disabled={!tableRows.length}>
              <Copy className="h-4 w-4" />
              {t("common.copyTable")}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <TableSkeleton rows={8} cols={8} />
          ) : !tableRows.length ? (
            <EmptyState
              title="No warehouse capacity rows"
              description="Try a different date or generate recent snapshots for demo data."
              actions={<GenerateSnapshotsButton warehouseId={warehouseId ? Number(warehouseId) : undefined} />}
            />
          ) : (
            <StickyTableContainer>
              <Table className={stickyTableClass}>
                <TableHeader>
                  <TableRow>
                    <TableHead className={`${stickyHeaderClass} ${stickyLeftClass} ${stickyIntersectionClass} left-0 w-32`}>
                      warehouse_id
                    </TableHead>
                    <TableHead className={`${stickyHeaderClass} text-right`}>
                      <button type="button" className="inline-flex items-center gap-1" onClick={() => toggleSort("used_cbm")}>
                        used_cbm
                        <ArrowDownUp className="h-3.5 w-3.5" />
                      </button>
                    </TableHead>
                    <TableHead className={`${stickyHeaderClass} text-right`}>
                      <button type="button" className="inline-flex items-center gap-1" onClick={() => toggleSort("capacity_cbm")}>
                        capacity_cbm
                        <ArrowDownUp className="h-3.5 w-3.5" />
                      </button>
                    </TableHead>
                    <TableHead className={`${stickyHeaderClass} text-right`}>
                      <button type="button" className="inline-flex items-center gap-1" onClick={() => toggleSort("usage_pct_cbm")}>
                        usage_pct_cbm
                        <ArrowDownUp className="h-3.5 w-3.5" />
                      </button>
                    </TableHead>
                    <TableHead className={stickyHeaderClass}>status</TableHead>
                    <TableHead className={`${stickyHeaderClass} text-right`}>used_pallet</TableHead>
                    <TableHead className={`${stickyHeaderClass} text-right`}>capacity_pallet</TableHead>
                    <TableHead className={`${stickyHeaderClass} text-right`}>usage_pct_pallet</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {tableRows.map((row) => (
                    <TableRow key={row.warehouse_id}>
                      <TableCell className={`${stickyLeftClass} left-0 w-32`}>{row.warehouse_id}</TableCell>
                      <TableCell className="text-right">{formatCbm(row.used_cbm)}</TableCell>
                      <TableCell className="text-right">{row.capacity_cbm == null ? "-" : formatCbm(row.capacity_cbm)}</TableCell>
                      <TableCell className="text-right">
                        <UsageProgress
                          usagePct={row.usage_pct_cbm}
                          capacityCbm={row.capacity_cbm}
                          deltaPct={
                            row.usage_pct_cbm == null || previousUsageByWarehouse.get(row.warehouse_id) == null
                              ? null
                              : safeNumber(row.usage_pct_cbm) - safeNumber(previousUsageByWarehouse.get(row.warehouse_id))
                          }
                        />
                      </TableCell>
                      <TableCell>
                        <StatusCell status={row.status} />
                      </TableCell>
                      <TableCell className="text-right">{formatCbm(row.used_pallet)}</TableCell>
                      <TableCell className="text-right">{row.capacity_pallet == null ? "-" : formatCbm(row.capacity_pallet)}</TableCell>
                      <TableCell className="text-right">{formatPct(row.usage_pct_pallet)}</TableCell>
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

