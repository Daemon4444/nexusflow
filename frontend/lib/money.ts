// Overseas (nexusflow.vip) displays prices in USD, while the backend bills and
// settles entirely in CNY. We apply a single FX rate at the display layer (CNY → USD)
// and the reverse at the recharge layer (USD → CNY, what Alipay actually charges).
// Configure the rate (CNY per 1 USD) via NEXT_PUBLIC_USD_CNY_RATE; default 7.
export const USD_CNY_RATE = (() => {
  const r = Number(process.env.NEXT_PUBLIC_USD_CNY_RATE);
  return Number.isFinite(r) && r > 0 ? r : 7;
})();

/** Convert a CNY amount (backend unit) into USD for display. */
export function cnyToUsd(cny: number | null | undefined): number {
  return Number(cny || 0) / USD_CNY_RATE;
}

/** Convert a USD amount (user input) into the CNY amount to charge via Alipay. */
export function usdToCny(usd: number | null | undefined): number {
  return Number(usd || 0) * USD_CNY_RATE;
}

export function formatUsd(value: number | null | undefined): string {
  const amount = cnyToUsd(value);
  return `$${amount.toFixed(2)}`;
}

export function formatUsdPrecise(value: number | null | undefined): string {
  const amount = cnyToUsd(value);
  const cents = Number(amount.toFixed(2));
  if (Math.abs(amount - cents) >= 0.000001) {
    const precise = amount.toFixed(6).replace(/0+$/, "").replace(/\.$/, "");
    return `$${precise}`;
  }
  return `$${amount.toFixed(2)}`;
}

/** @deprecated Use formatUsd instead */
export const formatCny = formatUsd;
/** @deprecated Use formatUsdPrecise instead */
export const formatCnyPrecise = formatUsdPrecise;
