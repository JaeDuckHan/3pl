import { toCsv as toCsvWithColumns } from "@/features/dashboard/utils";

export { compareNumber, downloadCsv, type SortDirection } from "@/features/dashboard/utils";

export function toCsv(rows: Array<Record<string, unknown>>, columns: string[]) {
  const mapped = columns.map((key) => ({ key, label: key }));
  return toCsvWithColumns(rows, mapped);
}
