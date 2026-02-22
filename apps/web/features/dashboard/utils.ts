export type SortDirection = "asc" | "desc";

export type CsvColumn<Row extends Record<string, unknown>> = {
  key: keyof Row | string;
  label: string;
  format?: (value: unknown, row: Row) => string;
};

export function safeNumber(value: unknown) {
  const numeric =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value)
        : 0;
  return Number.isFinite(numeric) ? numeric : 0;
}

function formatWithDigits(value: unknown, minimumFractionDigits: number, maximumFractionDigits: number) {
  return safeNumber(value).toLocaleString(undefined, {
    minimumFractionDigits,
    maximumFractionDigits,
  });
}

export function formatCbm(value: unknown) {
  return formatWithDigits(value, 4, 4);
}

export function formatMoney(value: unknown) {
  return formatWithDigits(value, 2, 2);
}

export function formatPct(value: unknown) {
  if (value == null) return "-";
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return "-";
  return `${numeric.toLocaleString(undefined, {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })}%`;
}

function escapeCsvField(value: unknown) {
  const text = String(value ?? "");
  if (text.includes(",") || text.includes('"') || text.includes("\n") || text.includes("\r")) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

export function toCsv<Row extends Record<string, unknown>>(rows: Row[], columns: CsvColumn<Row>[]) {
  const header = columns.map((column) => escapeCsvField(column.label)).join(",");
  const lines = rows.map((row) =>
    columns
      .map((column) => {
        const raw = row[column.key as keyof Row];
        const value = column.format ? column.format(raw, row) : raw;
        return escapeCsvField(value);
      })
      .join(",")
  );
  return [header, ...lines].join("\n");
}

function escapeTsvField(value: unknown) {
  const text = String(value ?? "");
  return text.replace(/\t/g, " ").replace(/\r?\n/g, " ");
}

export function toTsv<Row extends Record<string, unknown>>(rows: Row[], columns: CsvColumn<Row>[]) {
  const header = columns.map((column) => escapeTsvField(column.label)).join("\t");
  const lines = rows.map((row) =>
    columns
      .map((column) => {
        const raw = row[column.key as keyof Row];
        const value = column.format ? column.format(raw, row) : raw;
        return escapeTsvField(value);
      })
      .join("\t")
  );
  return [header, ...lines].join("\n");
}

export function downloadCsv(filename: string, csvString: string) {
  const blob = new Blob([csvString], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export async function copyToClipboard(text: string) {
  if (!text) return;
  try {
    await navigator.clipboard.writeText(text);
    return;
  } catch {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    document.execCommand("copy");
    document.body.removeChild(textarea);
  }
}

export function compareNumber(a: number | null | undefined, b: number | null | undefined, direction: SortDirection) {
  const av = Number.isFinite(Number(a)) ? Number(a) : -Infinity;
  const bv = Number.isFinite(Number(b)) ? Number(b) : -Infinity;
  if (direction === "asc") return av - bv;
  return bv - av;
}

export function readFiltersFromSearchParams<T extends Record<string, string>>(
  searchParams: URLSearchParams | ReadonlyURLSearchParams,
  defaults: T
) {
  const next = { ...defaults };
  for (const key of Object.keys(defaults) as Array<keyof T>) {
    const value = searchParams.get(String(key));
    if (value != null) {
      next[key] = value as T[keyof T];
    }
  }
  return next;
}

export function writeFiltersToUrl(
  router: { replace: (href: string, options?: { scroll?: boolean }) => void },
  pathname: string,
  filters: Record<string, string | number | null | undefined>
) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value == null) continue;
    const text = String(value).trim();
    if (!text) continue;
    params.set(key, text);
  }
  const query = params.toString();
  router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
}

type ReadonlyURLSearchParams = {
  get(name: string): string | null;
};
