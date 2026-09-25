/**
 * Minimal deterministic YAML emitter for control-plane snapshots: keys
 * sorted, strings always double-quoted (JSON escaping is valid YAML), so
 * the same content always produces byte-identical files and diffs stay
 * readable. Only JSON data types are supported.
 */
function scalar(value: unknown): string {
  if (value === null || value === undefined) return "null";
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "null";
  if (typeof value === "boolean") return value ? "true" : "false";
  throw new Error(`unsupported YAML value: ${typeof value}`);
}

function isEmptyContainer(value: unknown): string | null {
  if (Array.isArray(value) && value.length === 0) return "[]";
  if (value && typeof value === "object" && !Array.isArray(value) && Object.keys(value).filter((key) => (value as any)[key] !== undefined).length === 0) return "{}";
  return null;
}

function emit(value: unknown, indent: string, lines: string[]): void {
  if (Array.isArray(value)) {
    for (const item of value) {
      const empty = isEmptyContainer(item);
      if (item !== null && typeof item === "object" && !empty) {
        const nested: string[] = [];
        emit(item, `${indent}  `, nested);
        lines.push(`${indent}- ${nested[0].trimStart()}`, ...nested.slice(1));
      } else {
        lines.push(`${indent}- ${empty ?? scalar(item)}`);
      }
    }
    return;
  }
  const record = value as Record<string, unknown>;
  for (const key of Object.keys(record).sort()) {
    const item = record[key];
    if (item === undefined) continue;
    const name = /^[A-Za-z_][A-Za-z0-9_.-]*$/.test(key) ? key : JSON.stringify(key);
    const empty = isEmptyContainer(item);
    if (item !== null && typeof item === "object" && !empty) {
      lines.push(`${indent}${name}:`);
      emit(item, `${indent}  `, lines);
    } else {
      lines.push(`${indent}${name}: ${empty ?? scalar(item)}`);
    }
  }
}

export function toYaml(value: unknown): string {
  const empty = isEmptyContainer(value);
  if (empty) return `${empty}\n`;
  if (value === null || typeof value !== "object") return `${scalar(value)}\n`;
  const lines: string[] = [];
  emit(value, "", lines);
  return `${lines.join("\n")}\n`;
}
