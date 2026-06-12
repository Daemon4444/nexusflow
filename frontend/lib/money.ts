export function formatUsd(value: number | null | undefined): string {
  const amount = Number(value || 0);
  return `$${amount.toFixed(2)}`;
}

export function formatUsdPrecise(value: number | null | undefined): string {
  const amount = Number(value || 0);
  const cents = Number(amount.toFixed(2));
  if (Math.abs(amount - cents) >= 0.000001) {
    const precise = amount.toFixed(6).replace(/0+$/, "").replace(/\.$/, "");
    return `$${precise}`;
  }
  return formatUsd(amount);
}

/** @deprecated Use formatUsd instead. Kept as an alias to avoid breaking imports. */
export const formatCny = formatUsd;

/** @deprecated Use formatUsdPrecise instead. Kept as an alias to avoid breaking imports. */
export const formatCnyPrecise = formatUsdPrecise;
