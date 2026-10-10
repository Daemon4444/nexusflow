/** Calendar dates for customer usage are always Beijing time, independent of the host. */
export function shanghaiDate(now: Date): string {
  return new Date(now.getTime() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/** Date-only filters use Shanghai calendar days; timestamps must name their offset. */
export function parseUsageDate(value: unknown, endOfDay = false): Date | null {
  if (typeof value !== "string") return null;
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value);
  if (!dateOnly && !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/.test(value)) return null;
  const day = value.slice(0, 10);
  if (day.startsWith("0000-") || (!dateOnly && Number(value.slice(11, 13)) > 23)) return null;
  const calendar = new Date(`${day}T00:00:00Z`);
  if (!Number.isFinite(calendar.getTime()) || calendar.toISOString().slice(0, 10) !== day) return null;
  const parsed = new Date(dateOnly ? `${day}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}+08:00` : value);
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}

export function fillUsageDays(rows: Array<{ fullDate: string; requests: number; tokens: number; cost: number }>, now: Date) {
  const today = new Date(`${shanghaiDate(now)}T00:00:00Z`);
  const byDate = new Map(rows.map(row => [row.fullDate, row]));
  return Array.from({ length: 7 }, (_, index) => {
    const fullDate = new Date(today.getTime() - (6 - index) * 86400000).toISOString().slice(0, 10);
    const row = byDate.get(fullDate);
    return { fullDate, date: fullDate.slice(5), requests: Number(row?.requests || 0), tokens: Number(row?.tokens || 0), cost: Number(row?.cost || 0) };
  });
}
