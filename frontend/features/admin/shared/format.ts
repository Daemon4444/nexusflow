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
  const amount = Number(value);
  // Put the sign before the currency symbol: -¥74.25, not ¥-74.25.
  const text = precise ? formatCnyPrecise(Math.abs(amount)) : formatCnyAuto(Math.abs(amount));
  return amount < 0 ? `-${text}` : text;
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

/**
 * Ledger rows store consumption as a positive amount (the type carries the
 * direction); recharges are positive and admin/credit adjustments are signed.
 * Return the balance effect so the table never shows a charge as income.
 */
export function ledgerAmount(type: string | null | undefined, amount: NullableNumber | undefined): NullableNumber | undefined {
  if (amount === null || amount === undefined || !Number.isFinite(Number(amount))) return amount;
  return type === "consumption" ? -Math.abs(Number(amount)) : Number(amount);
}

export function displayLedgerAmount(type: string | null | undefined, amount: NullableNumber | undefined): string {
  const value = ledgerAmount(type, amount);
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return "unknown";
  const text = displayMoney(Math.abs(Number(value)), true);
  return Number(value) > 0 ? `+${text}` : Number(value) < 0 ? `-${text}` : text;
}

export function ledgerAmountClass(type: string | null | undefined, amount: NullableNumber | undefined): string | undefined {
  const value = Number(ledgerAmount(type, amount));
  if (!Number.isFinite(value) || value === 0) return undefined;
  return value > 0 ? "nf-admin-amount-in" : "nf-admin-amount-out";
}
