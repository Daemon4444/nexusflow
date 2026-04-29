export function formatCny(value: number | null | undefined): string {
  const amount = Number(value || 0);
  const cents = Number(amount.toFixed(2));

  if (Math.abs(amount - cents) >= 0.000001) {
    const precise = amount.toFixed(6).replace(/0+$/, "").replace(/\.$/, "");
    return `¥${precise}`;
  }

  return `¥${amount.toFixed(2)}`;
}
