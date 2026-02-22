function isValidDateParts(year: number, month: number, day: number) {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return false;
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

export function normalizeDate(input: string) {
  const text = input.trim();
  if (!text) return "";
  const match = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (!match) return "";
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!isValidDateParts(year, month, day)) return "";
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function normalizeMonth(input: string) {
  const text = input.trim();
  if (!text) return "";
  const match = text.match(/^(\d{4})-(\d{1,2})$/);
  if (!match) return "";
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (!Number.isInteger(year) || month < 1 || month > 12) return "";
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}`;
}

export function normalizeInt(input: string) {
  const text = input.trim();
  if (!text) return "";
  if (/^[+-]/.test(text)) return "";
  if (!/^\d+$/.test(text)) return "";
  return text;
}
