"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ArrowDownUp, Copy, Download, ImageDown } from "lucide-react";
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
import { Badge } from "@/components/ui/badge";
import {
  stickyHeaderClass,
  stickyIntersectionClass,
  stickyLeftClass,
  stickyTableClass,
  StickyTableContainer,
} from "@/components/dashboard/StickyTable";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { generateSnapshotsForDate, getStorageTrend, type GroupBy, type StorageTrendResponse } from "@/features/dashboard/api";
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

function thirtyDaysAgo() {
  const d = new Date();
  d.setDate(d.getDate() - 30);
  return d.toISOString().slice(0, 10);
}

function enumerateDates(from: string, to: string) {
  const items: string[] = [];
  let cursor = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${to}T00:00:00Z`);
  while (cursor <= end) {
    items.push(cursor.toISOString().slice(0, 10));
    cursor = new Date(cursor.getTime() + 86_400_000);
  }
  return items;
}

function TrendLineChart({ points }: { points: Array<{ x: string; y: number }> }) {
  const width = 640;
  const height = 220;
  const pad = 24;
  const maxY = Math.max(...points.map((p) => p.y), 0);

  if (!points.length || maxY <= 0) {
    return <EmptyState title="No chart data" description="Load data with non-zero CBM values." />;
  }

  const xy = points.map((point, idx) => {
    const x = pad + (idx * (width - pad * 2)) / Math.max(points.length - 1, 1);
    const y = height - pad - (point.y / maxY) * (height - pad * 2);
    return { x, y, label: point.x };
  });
  const polyline = xy.map((p) => `${p.x},${p.y}`).join(" ");

  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${width} ${height}`} className="h-[220px] w-full min-w-[480px]">
        <line x1={pad} y1={height - pad} x2={width - pad} y2={height - pad} stroke="#cbd5e1" />
        <line x1={pad} y1={pad} x2={pad} y2={height - pad} stroke="#cbd5e1" />
        <polyline fill="none" stroke="#0f172a" strokeWidth="2.5" points={polyline} />
        {xy.map((p) => (
          <g key={p.label}>
            <circle cx={p.x} cy={p.y} r="3" fill="#0f172a" />
          </g>
        ))}
      </svg>
    </div>
  );
}

type TrendSortKey = "total_cbm" | "total_pallet" | "total_sku" | "delta_pct";

type TrendFilters = {
  from: string;
  to: string;
  groupBy: GroupBy;
  warehouseId: string;
  clientId: string;
};

const trendColumns = [
  { key: "period", label: "period" },
  { key: "total_cbm", label: "total_cbm" },
  { key: "total_pallet", label: "total_pallet" },
  { key: "total_sku", label: "total_sku" },
  { key: "delta_pct", label: "delta_pct" },
] satisfies CsvColumn<Record<string, unknown>>[];

function dateByOffset(offset: number) {
  const date = new Date();
  date.setDate(date.getDate() - offset);
  return date.toISOString().slice(0, 10);
}

export function StorageTrendPage() {
  const { t } = useI18n();
  const { toastError, toastSuccess } = useDashboardToast();
  const { demoMode, ready: demoReady, toggleDemoMode } = useDemoMode();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [generatingSnapshots, setGeneratingSnapshots] = useState(false);
  const [bootstrapped, setBootstrapped] = useState(false);
  const captureRef = useRef<HTMLDivElement | null>(null);

  const defaultFilters = useMemo(
    () => ({
      from: thirtyDaysAgo(),
      to: today(),
      groupBy: "day",
      warehouseId: "",
      clientId: "",
    }),
    []
  );
  const initialFilters = useMemo(() => readFiltersFromSearchParams(searchParams, defaultFilters), [defaultFilters, searchParams]);
  const hasExplicitFilterQuery = useMemo(() => {
    return ["from", "to", "groupBy", "warehouseId", "clientId"].some((key) => !!searchParams.get(key));
  }, [searchParams]);

  const [from, setFrom] = useState(initialFilters.from);
  const [to, setTo] = useState(initialFilters.to);
  const [groupBy, setGroupBy] = useState<GroupBy>(initialFilters.groupBy as GroupBy);
  const [warehouseId, setWarehouseId] = useState(initialFilters.warehouseId);
  const [clientId, setClientId] = useState(initialFilters.clientId);
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<TrendSortKey>("total_cbm");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<StorageTrendResponse | null>(null);

  const buildFilters = useCallback(
    (next?: Partial<TrendFilters>) => ({
      from: next?.from ?? from,
      to: next?.to ?? to,
      groupBy: next?.groupBy ?? groupBy,
      warehouseId: next?.warehouseId ?? warehouseId,
      clientId: next?.clientId ?? clientId,
    }),
    [clientId, from, groupBy, to, warehouseId]
  );

  const getValidationError = useCallback((filters: TrendFilters) => {
    const fromText = normalizeDate(filters.from);
    const toText = normalizeDate(filters.to);
    if (!fromText || !toText) return "from/to must use YYYY-MM-DD format.";
    if (fromText > toText) return "from cannot be later than to.";
    if (filters.warehouseId && !normalizeInt(filters.warehouseId)) return "warehouseId must be a positive integer.";
    if (filters.clientId && !normalizeInt(filters.clientId)) return "clientId must be a positive integer.";
    return null;
  }, []);

  const validationError = useMemo(() => {
    return getValidationError(buildFilters());
  }, [buildFilters, getValidationError]);

  const loadWithFilters = useCallback(async (filters: TrendFilters) => {
    const fromText = normalizeDate(filters.from);
    const toText = normalizeDate(filters.to);
    if (!fromText || !toText) return;

    setLoading(true);
    setError(null);
    try {
      const result = await getStorageTrend({
        from: fromText,
        to: toText,
        groupBy: filters.groupBy,
        warehouseId: filters.warehouseId ? Number(normalizeInt(filters.warehouseId)) : undefined,
        clientId: filters.clientId ? Number(normalizeInt(filters.clientId)) : undefined,
      });
      setData(result);
    } catch (e) {
      const message = e instanceof Error ? e.message : "Failed to load trend.";
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
        from: dateByOffset(6),
        to: dateByOffset(0),
        groupBy: "day" as GroupBy,
        warehouseId: "",
        clientId: "",
      };
      setFrom(preset.from);
      setTo(preset.to);
      setGroupBy(preset.groupBy);
      setWarehouseId("");
      setClientId("");
      writeFiltersToUrl(router, pathname, preset);
      void loadWithFilters(preset);
      setBootstrapped(true);
      return;
    }
    void load();
    setBootstrapped(true);
  }, [bootstrapped, demoMode, demoReady, hasExplicitFilterQuery, load, loadWithFilters, pathname, router]);

  const filledSeries = useMemo(() => {
    if (!data?.series?.length) return [];
    const sorted = [...data.series].sort((a, b) => a.period.localeCompare(b.period));
    if (groupBy !== "day") return sorted;

    const byPeriod = new Map(sorted.map((row) => [row.period, row]));
    return enumerateDates(from, to).map((period) => {
      const row = byPeriod.get(period);
      return (
        row ?? {
          period,
          total_cbm: 0,
          total_pallet: 0,
          total_sku: 0,
        }
      );
    });
  }, [data?.series, from, groupBy, to]);

  const seriesWithDelta = useMemo(() => {
    return filledSeries.map((row, index) => {
      if (index === 0) return { ...row, delta_pct: null as number | null };
      const prev = safeNumber(filledSeries[index - 1]?.total_cbm);
      const current = safeNumber(row.total_cbm);
      if (prev <= 0) {
        return { ...row, delta_pct: null };
      }
      return {
        ...row,
        delta_pct: ((current - prev) / prev) * 100,
      };
    });
  }, [filledSeries]);

  const displayTotals = useMemo(() => {
    return filledSeries.reduce(
      (acc, row) => ({
        total_cbm: acc.total_cbm + safeNumber(row.total_cbm),
        total_pallet: acc.total_pallet + safeNumber(row.total_pallet),
        total_sku: acc.total_sku + safeNumber(row.total_sku),
      }),
      { total_cbm: 0, total_pallet: 0, total_sku: 0 }
    );
  }, [filledSeries]);

  const trendDelta = useMemo(() => {
    if (!filledSeries.length) return { deltaAbs: null as number | null, deltaPct: null as number | null };
    const first = safeNumber(filledSeries[0]?.total_cbm);
    const last = safeNumber(filledSeries[filledSeries.length - 1]?.total_cbm);
    const deltaAbs = last - first;
    const deltaPct = first > 0 ? (deltaAbs / first) * 100 : null;
    return { deltaAbs, deltaPct };
  }, [filledSeries]);

  const tableRows = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    const filtered = keyword
      ? seriesWithDelta.filter((row) => row.period.toLowerCase().includes(keyword))
      : seriesWithDelta;

    return [...filtered].sort((a, b) => {
      return compareNumber(a[sortKey] as number | null, b[sortKey] as number | null, sortDirection);
    });
  }, [search, seriesWithDelta, sortDirection, sortKey]);

  const toggleSort = (next: TrendSortKey) => {
    if (sortKey === next) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
      return;
    }
    setSortKey(next);
    setSortDirection("desc");
  };

  const reset = () => {
    const next = {
      from: defaultFilters.from,
      to: defaultFilters.to,
      groupBy: defaultFilters.groupBy as GroupBy,
      warehouseId: defaultFilters.warehouseId,
      clientId: defaultFilters.clientId,
    };
    setFrom(next.from);
    setTo(next.to);
    setGroupBy(next.groupBy);
    setWarehouseId(next.warehouseId);
    setClientId(next.clientId);
    setSearch("");
    writeFiltersToUrl(router, pathname, {});
    void loadWithFilters(next);
  };

  const applyFilters = () => {
    const next = buildFilters();
    if (getValidationError(next)) return;
    const nextFrom = normalizeDate(next.from);
    const nextTo = normalizeDate(next.to);
    const nextWarehouse = normalizeInt(next.warehouseId);
    const nextClient = normalizeInt(next.clientId);
    setFrom(nextFrom);
    setTo(nextTo);
    setWarehouseId(nextWarehouse);
    setClientId(nextClient);
    writeFiltersToUrl(router, pathname, {
      from: nextFrom,
      to: nextTo,
      groupBy: next.groupBy,
      warehouseId: nextWarehouse,
      clientId: nextClient,
    });
    void loadWithFilters({
      from: nextFrom,
      to: nextTo,
      groupBy: next.groupBy,
      warehouseId: nextWarehouse,
      clientId: nextClient,
    });
  };

  const exportCsv = () => {
    const rows = tableRows.map((row) => ({
      period: row.period,
      total_cbm: safeNumber(row.total_cbm),
      total_pallet: safeNumber(row.total_pallet),
      total_sku: safeNumber(row.total_sku),
      delta_pct: row.delta_pct ?? "",
    }));
    const csv = toCsv(rows, trendColumns);
    downloadCsv(`storage-trend-${from}-${to}.csv`, csv);
    toastSuccess("CSV downloaded");
  };

  const copyTable = async () => {
    if (!tableRows.length) return;
    try {
      const rows = tableRows.map((row) => ({
        period: row.period,
        total_cbm: safeNumber(row.total_cbm),
        total_pallet: safeNumber(row.total_pallet),
        total_sku: safeNumber(row.total_sku),
        delta_pct: row.delta_pct ?? "",
      }));
      await copyToClipboard(toTsv(rows, trendColumns));
      toastSuccess("Copied to clipboard");
    } catch {
      toastError("Copy failed");
    }
  };

  const savePng = async () => {
    if (!captureRef.current) return;
    try {
      await captureElementToPng(captureRef.current, `trend_${from || "from"}_to_${to || "to"}.png`);
      toastSuccess("PNG saved");
    } catch {
      toastError("PNG save failed");
    }
  };

  const generateLast7Days = async () => {
    setGeneratingSnapshots(true);
    try {
      for (let i = 0; i <= 6; i += 1) {
        await generateSnapshotsForDate(dateByOffset(i));
      }
      toastSuccess("Generated demo snapshots for last 7 days");
      await load();
    } catch (error) {
      toastError(error instanceof Error ? error.message : "Failed to generate snapshots");
    } finally {
      setGeneratingSnapshots(false);
    }
  };

  const applyLast7DaysPreset = () => {
    const next = {
      from: dateByOffset(6),
      to: dateByOffset(0),
      groupBy,
      warehouseId,
      clientId,
    };
    setFrom(next.from);
    setTo(next.to);
    writeFiltersToUrl(router, pathname, next);
    void loadWithFilters(next);
  };

  return (
    <section>
      <PageHeader
        breadcrumbs={[{ label: t("nav.dashboard"), href: "/dashboard" }, { label: t("trend.title") }]}
        title={t("trend.title")}
        description={t("trend.desc")}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {demoReady ? <DemoModeToggle demoMode={demoMode} onToggle={toggleDemoMode} /> : null}
            {demoMode && process.env.NODE_ENV !== "production" ? (
              <Button type="button" variant="secondary" onClick={() => void generateLast7Days()} disabled={generatingSnapshots}>
                {generatingSnapshots ? t("demo.generating") : t("demo.generateLast7days")}
              </Button>
            ) : null}
            <Button type="button" variant="secondary" onClick={() => void savePng()} disabled={loading}>
              <ImageDown className="h-4 w-4" />
              {t("common.savePng")}
            </Button>
          </div>
        }
      />
      <DashboardTabs />
      {demoReady ? <DemoModeBanner demoMode={demoMode} /> : null}

      {loading && !data ? <FilterBarSkeleton /> : null}
      <FilterBar
        mode="date-range"
        values={{ from, to, warehouseId, clientId, groupBy, search }}
        loading={loading}
        validationError={validationError}
        onChange={(next) => {
          setFrom(next.from ?? "");
          setTo(next.to ?? "");
          setWarehouseId(next.warehouseId ?? "");
          setClientId(next.clientId ?? "");
        }}
        onSubmit={applyFilters}
        onReset={reset}
        syncToUrl={false}
      >
        <select
          className="h-9 rounded-md border border-slate-200 bg-white px-3 text-sm"
          value={groupBy}
          onChange={(e) => setGroupBy(e.target.value as GroupBy)}
        >
          <option value="day">day</option>
          <option value="week">week</option>
          <option value="month">month</option>
        </select>
        <Button type="button" variant="secondary" onClick={applyLast7DaysPreset} disabled={loading}>
          {t("trend.last7days")}
        </Button>
      </FilterBar>

      {error && (
        <div className="mb-4">
          <ErrorState title="Failed to load storage trend" message={error} onRetry={() => void load()} />
        </div>
      )}

      {loading ? <CardsSkeleton count={3} /> : null}
      {!loading && (
        <div ref={captureRef} className="mb-4 space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader>
              <CardTitle>Total CBM</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold">{formatCbm(displayTotals.total_cbm)}</p>
              <div className="mt-2">
                {trendDelta.deltaAbs == null ? (
                  <Badge variant="default">-</Badge>
                ) : trendDelta.deltaAbs > 0 ? (
                  <Badge variant="success">
                    ▲ {formatCbm(trendDelta.deltaAbs)} ({formatPct(trendDelta.deltaPct)})
                  </Badge>
                ) : trendDelta.deltaAbs < 0 ? (
                  <Badge variant="danger">
                    ▼ {formatCbm(Math.abs(trendDelta.deltaAbs))} ({formatPct(trendDelta.deltaPct)})
                  </Badge>
                ) : (
                  <Badge variant="default">- {formatCbm(0)} ({formatPct(0)})</Badge>
                )}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Total Pallet</CardTitle>
            </CardHeader>
            <CardContent className="text-2xl font-semibold">{formatCbm(displayTotals.total_pallet)}</CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Total SKU</CardTitle>
            </CardHeader>
            <CardContent className="text-2xl font-semibold">{safeNumber(displayTotals.total_sku).toLocaleString()}</CardContent>
          </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>CBM Trend</CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <TableSkeleton rows={4} cols={4} />
              ) : filledSeries.length ? (
                <TrendLineChart points={filledSeries.map((item) => ({ x: item.period, y: safeNumber(item.total_cbm) }))} />
              ) : (
                <EmptyState
                  title="No trend data yet"
                  description="Try widening the date range or generate recent snapshots for demo data."
                  actions={
                    <GenerateSnapshotsButton
                      warehouseId={warehouseId ? Number(warehouseId) : undefined}
                      clientId={clientId ? Number(clientId) : undefined}
                    />
                  }
                />
              )}
            </CardContent>
          </Card>
        </div>
      )}

      <Card>
        <CardHeader className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <CardTitle>Trend Table</CardTitle>
          <div className="flex w-full flex-col gap-2 md:w-auto md:flex-row">
            <Input
              placeholder="Search period"
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
            <TableSkeleton rows={8} cols={5} />
          ) : !tableRows.length ? (
            <EmptyState
              title="No rows"
              description="No trend rows to display for current filters."
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
                    <TableHead className={`${stickyHeaderClass} ${stickyLeftClass} ${stickyIntersectionClass} left-0 w-40`}>Period</TableHead>
                    <TableHead className={`${stickyHeaderClass} text-right`}>
                      <button type="button" className="inline-flex items-center gap-1" onClick={() => toggleSort("total_cbm")}>
                        CBM
                        <ArrowDownUp className="h-3.5 w-3.5" />
                      </button>
                    </TableHead>
                    <TableHead className={`${stickyHeaderClass} text-right`}>
                      <button type="button" className="inline-flex items-center gap-1" onClick={() => toggleSort("total_pallet")}>
                        Pallet
                        <ArrowDownUp className="h-3.5 w-3.5" />
                      </button>
                    </TableHead>
                    <TableHead className={`${stickyHeaderClass} text-right`}>
                      <button type="button" className="inline-flex items-center gap-1" onClick={() => toggleSort("total_sku")}>
                        SKU
                        <ArrowDownUp className="h-3.5 w-3.5" />
                      </button>
                    </TableHead>
                    <TableHead className={`${stickyHeaderClass} text-right`}>
                      <button type="button" className="inline-flex items-center gap-1" onClick={() => toggleSort("delta_pct")}>
                        Delta
                        <ArrowDownUp className="h-3.5 w-3.5" />
                      </button>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {tableRows.map((row) => (
                    <TableRow key={row.period}>
                      <TableCell className={`${stickyLeftClass} left-0 w-40`}>{row.period}</TableCell>
                      <TableCell className="text-right">{formatCbm(row.total_cbm)}</TableCell>
                      <TableCell className="text-right">{formatCbm(row.total_pallet)}</TableCell>
                      <TableCell className="text-right">{safeNumber(row.total_sku).toLocaleString()}</TableCell>
                      <TableCell className="text-right">{formatPct(row.delta_pct)}</TableCell>
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


