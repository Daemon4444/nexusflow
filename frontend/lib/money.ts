// The overseas (nexusflow.vip) backend stores prices, billing cost and balances
// already in USD (the data layer was converted from CNY). So display is a plain
// USD format with no conversion. The only place FX matters is recharge: Alipay
// settles in CNY, so a USD top-up is charged at USD * USD_CNY_RATE (see usdToCny).
export const USD_CNY_RATE = (() => {
  const r = Number(process.env.NEXT_PUBLIC_USD_CNY_RATE);
  return Number.isFinite(r) && r > 0 ? r : 7;
})();

/** Convert a USD amount (balance/price unit) into the CNY amount to charge via Alipay. */
export function usdToCny(usd: number | null | undefined): number {
  return Number(usd || 0) * USD_CNY_RATE;
}

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
  return `$${amount.toFixed(2)}`;
}

/** @deprecated Use formatUsd instead */
export const formatCny = formatUsd;
/** @deprecated Use formatUsdPrecise instead */
export const formatCnyPrecise = formatUsdPrecise;
