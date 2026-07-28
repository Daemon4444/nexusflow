import { formatCnyAuto, formatCnyPrecise } from "@/lib/money";
import type { NullableNumber } from "../contracts";

export function displayNumber(value: NullableNumber | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return "unknown";
  return Number(value).toLocaleString("zh-CN");
}

export function displayCompact(value: NullableNumber | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return "unknown";
  return new Intl.NumberFormat("zh-CN", { notation: "compact", maximumFractionDigits: 1 }).format(Number(value));
}

export function displayMoney(value: NullableNumber | undefined, precise = false): string {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return "unknown";
  return precise ? formatCnyPrecise(Number(value)) : formatCnyAuto(Number(value));
}

export function displayPercent(value: NullableNumber | undefined, scale: "ratio" | "percent" = "percent"): string {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return "unknown";
  const amount = scale === "ratio" ? Number(value) * 100 : Number(value);
  return `${amount.toFixed(amount >= 10 ? 1 : 2)}%`;
}

export function displayDate(value?: string | null): string {
  if (!value) return "unknown";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "unknown";
  return date.toLocaleString("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function displayLatency(value: NullableNumber | undefined): string {
  return value === null || value === undefined ? "unknown" : `${Number(value).toLocaleString("zh-CN")} ms`;
}
