/** 千分位 + 固定小数位，例如 12345.6 → "12,345.60"。 */
function grouped(amount: number, minDigits: number, maxDigits = minDigits): string {
  return amount.toLocaleString("en-US", { minimumFractionDigits: minDigits, maximumFractionDigits: maxDigits });
}

export function formatCny(value: number | null | undefined): string {
  const amount = Number(value || 0);
  return `¥${grouped(amount, 2)}`;
}

export function formatCnyPrecise(value: number | null | undefined): string {
  const amount = Number(value || 0);
  const cents = Number(amount.toFixed(2));
  if (Math.abs(amount - cents) >= 0.000001) {
    return `¥${grouped(amount, 2, 6)}`;
  }
  return formatCny(amount);
}

/**
 * 按金额量级自动选择小数精度，统一各处成本展示：
 * 0 或极小额 → ¥0；<0.01 → 4 位；<1 → 3 位；否则 2 位。
 */
export function formatCnyAuto(value: number | null | undefined): string {
  const amount = Number(value || 0);
  const abs = Math.abs(amount);
  if (abs < 0.0001) return "¥0";
  if (abs < 0.01) return `¥${amount.toFixed(4)}`;
  if (abs < 1) return `¥${amount.toFixed(3)}`;
  return `¥${grouped(amount, 2)}`;
}
