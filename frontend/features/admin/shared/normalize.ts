export type UnknownRecord = Record<string, unknown>;

export function asRecord(value: unknown): UnknownRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as UnknownRecord
    : {};
}

export function pickValue(record: UnknownRecord, ...keys: string[]): unknown {
  for (const key of keys) {
    if (record[key] !== undefined && record[key] !== null) return record[key];
  }
  return undefined;
}

export function textValue(value: unknown, fallback = ""): string {
  return typeof value === "string" && value.trim() ? value : fallback;
}

export function optionalText(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

export function numberValue(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function booleanValue(value: unknown): boolean {
  return value === true || value === 1 || value === "1" || value === "true";
}

export function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}
