/**
 * Model catalog override layer.
 *
 * The static catalog in ./models.ts is always the seed/fallback. Rows in the
 * `model_overrides` table are merged on top of it to add new models, override
 * existing ones, or hide (disable) static models — all without a code deploy.
 *
 * Safety guarantees:
 *  - When the table is empty (or the DB is unreachable), the effective catalog
 *    equals the static seed exactly. refreshModels() never throws into callers.
 *  - Every override doc is validated/sanitized before it can enter the catalog,
 *    so a malformed row can never inject NaN prices or crash billing.
 */

import { db } from "../db/client";
import { AIModel, TokenPricingTier, models, getStaticModels } from "./models";

export type OverrideAction = "upsert" | "disable";

export interface ModelOverrideRow {
  id: string;
  doc: AIModel | null;
  action: OverrideAction;
  enabled: boolean;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

// ============ Validation ============

// 允许斜杠：DashScope 第三方模型 ID 带厂商前缀（如 kimi/kimi-k3）
const ID_RE = /^[A-Za-z0-9._:\-\/]+$/;
const PRICING_TYPES = new Set(["token", "per-image", "per-second", "per-10k-characters"]);

function isFiniteNonNegative(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v) && v >= 0;
}

function asStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === "string").map((x) => x.trim()).filter(Boolean);
}

export type ValidationResult =
  | { ok: true; model: AIModel }
  | { ok: false; error: string };

/**
 * Validate + sanitize an arbitrary object into a safe AIModel. Rejects anything
 * that could break billing (non-finite / negative prices, missing id/name).
 */
export function sanitizeModelDoc(input: unknown): ValidationResult {
  if (!input || typeof input !== "object") return { ok: false, error: "模型数据必须是一个对象" };
  const o = input as Record<string, unknown>;

  const id = typeof o.id === "string" ? o.id.trim() : "";
  if (!id) return { ok: false, error: "id 必填" };
  if (id.length > 128 || !ID_RE.test(id)) return { ok: false, error: "id 仅允许字母数字和 . _ : - / ，且不超过 128 字符" };

  const name = typeof o.name === "string" ? o.name.trim() : "";
  if (!name || name.length > 200) return { ok: false, error: "name 必填且不超过 200 字符" };

  const provider = typeof o.provider === "string" ? o.provider.trim() : "";
  if (!provider || provider.length > 100) return { ok: false, error: "provider 必填且不超过 100 字符" };

  const category = typeof o.category === "string" && o.category.trim() ? o.category.trim() : "其他";
  const description = typeof o.description === "string" ? o.description : "";

  const contextLength = Number(o.contextLength ?? 0);
  if (!isFiniteNonNegative(contextLength)) return { ok: false, error: "contextLength 必须是 ≥0 的数字" };

  const maxOutput = Number(o.maxOutput ?? 4096);
  if (!isFiniteNonNegative(maxOutput)) return { ok: false, error: "maxOutput 必须是 ≥0 的数字" };

  const promptPrice = Number(o.promptPrice ?? 0);
  if (!isFiniteNonNegative(promptPrice)) return { ok: false, error: "promptPrice 必须是 ≥0 的数字" };

  const completionPrice = Number(o.completionPrice ?? 0);
  if (!isFiniteNonNegative(completionPrice)) return { ok: false, error: "completionPrice 必须是 ≥0 的数字" };

  const model: AIModel = {
    id,
    name,
    provider,
    description,
    contextLength: Math.floor(contextLength),
    promptPrice,
    completionPrice,
    category,
    tags: asStringArray(o.tags),
    maxOutput: Math.floor(maxOutput),
    supported: asStringArray(o.supported),
  };

  if (o.pricingType !== undefined && o.pricingType !== null && o.pricingType !== "") {
    if (typeof o.pricingType !== "string" || !PRICING_TYPES.has(o.pricingType)) {
      return { ok: false, error: "pricingType 只能是 token / per-image / per-second / per-10k-characters" };
    }
    model.pricingType = o.pricingType as AIModel["pricingType"];
  }

  if (o.cacheReadPrice !== undefined && o.cacheReadPrice !== null) {
    const v = Number(o.cacheReadPrice);
    if (!isFiniteNonNegative(v)) return { ok: false, error: "cacheReadPrice 必须是 ≥0 的数字" };
    model.cacheReadPrice = v;
  }

  if (o.cacheReadExplicitPrice !== undefined && o.cacheReadExplicitPrice !== null) {
    const v = Number(o.cacheReadExplicitPrice);
    if (!isFiniteNonNegative(v)) return { ok: false, error: "cacheReadExplicitPrice 必须是 ≥0 的数字" };
    model.cacheReadExplicitPrice = v;
  }

  if (o.thinkingCompletionPrice !== undefined && o.thinkingCompletionPrice !== null) {
    const v = Number(o.thinkingCompletionPrice);
    if (!isFiniteNonNegative(v)) return { ok: false, error: "thinkingCompletionPrice 必须是 ≥0 的数字" };
    model.thinkingCompletionPrice = v;
  }

  if (o.anthropicPassThrough !== undefined && o.anthropicPassThrough !== null) {
    model.anthropicPassThrough = !!o.anthropicPassThrough;
  }

  if (o.audioInputPrice !== undefined && o.audioInputPrice !== null) {
    const v = Number(o.audioInputPrice);
    if (!isFiniteNonNegative(v)) return { ok: false, error: "audioInputPrice 必须是 ≥0 的数字" };
    model.audioInputPrice = v;
  }
  if (o.audioOutputPrice !== undefined && o.audioOutputPrice !== null) {
    const v = Number(o.audioOutputPrice);
    if (!isFiniteNonNegative(v)) return { ok: false, error: "audioOutputPrice 必须是 ≥0 的数字" };
    model.audioOutputPrice = v;
  }

  if (o.pricingTiers !== undefined && o.pricingTiers !== null) {
    if (!Array.isArray(o.pricingTiers)) return { ok: false, error: "pricingTiers 必须是数组" };
    const tiers = [];
    for (const t of o.pricingTiers as any[]) {
      const label = typeof t?.label === "string" ? t.label.trim() : "";
      const price = Number(t?.price);
      if (!label) return { ok: false, error: "pricingTiers[].label 必填" };
      if (!isFiniteNonNegative(price)) return { ok: false, error: "pricingTiers[].price 必须是 ≥0 的数字" };
      tiers.push({ label, price });
    }
    if (tiers.length > 0) model.pricingTiers = tiers;
  }

  if (o.tokenPricingTiers !== undefined && o.tokenPricingTiers !== null) {
    if (!Array.isArray(o.tokenPricingTiers)) return { ok: false, error: "tokenPricingTiers 必须是数组" };
    const tiers = [];
    for (const t of o.tokenPricingTiers as any[]) {
      const label = typeof t?.label === "string" ? t.label.trim() : "";
      const maxTokens = Number(t?.maxTokens);
      const pp = Number(t?.promptPrice);
      const cp = Number(t?.completionPrice);
      if (!label) return { ok: false, error: "tokenPricingTiers[].label 必填" };
      if (!isFiniteNonNegative(maxTokens)) return { ok: false, error: "tokenPricingTiers[].maxTokens 必须是 ≥0 的数字" };
      if (!isFiniteNonNegative(pp)) return { ok: false, error: "tokenPricingTiers[].promptPrice 必须是 ≥0 的数字" };
      if (!isFiniteNonNegative(cp)) return { ok: false, error: "tokenPricingTiers[].completionPrice 必须是 ≥0 的数字" };
      const tier: TokenPricingTier =
        { label, maxTokens: Math.floor(maxTokens), promptPrice: pp, completionPrice: cp };
      if (t?.cacheReadPrice !== undefined && t?.cacheReadPrice !== null) {
        const crp = Number(t.cacheReadPrice);
        if (!isFiniteNonNegative(crp)) return { ok: false, error: "tokenPricingTiers[].cacheReadPrice 必须是 ≥0 的数字" };
        tier.cacheReadPrice = crp;
      }
      if (t?.cacheReadExplicitPrice !== undefined && t?.cacheReadExplicitPrice !== null) {
        const crp = Number(t.cacheReadExplicitPrice);
        if (!isFiniteNonNegative(crp)) return { ok: false, error: "tokenPricingTiers[].cacheReadExplicitPrice 必须是 ≥0 的数字" };
        tier.cacheReadExplicitPrice = crp;
      }
      if (t?.thinkingCompletionPrice !== undefined && t?.thinkingCompletionPrice !== null) {
        const tcp = Number(t.thinkingCompletionPrice);
        if (!isFiniteNonNegative(tcp)) return { ok: false, error: "tokenPricingTiers[].thinkingCompletionPrice 必须是 ≥0 的数字" };
        tier.thinkingCompletionPrice = tcp;
      }
      tiers.push(tier);
    }
    if (tiers.length > 0) model.tokenPricingTiers = tiers;
  }

  if (o.isNew !== undefined) model.isNew = !!o.isNew;
  if (o.isFeatured !== undefined) model.isFeatured = !!o.isFeatured;

  return { ok: true, model };
}

// ============ DB access ============

export async function listOverrides(): Promise<ModelOverrideRow[]> {
  const rows = await db.queryMany<any>("SELECT * FROM model_overrides ORDER BY updated_at DESC");
  return rows.map((r) => ({
    id: r.id,
    doc: r.doc || null,
    action: (r.action === "disable" ? "disable" : "upsert") as OverrideAction,
    enabled: r.enabled !== false,
    updated_by: r.updated_by || null,
    created_at: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
    updated_at: r.updated_at instanceof Date ? r.updated_at.toISOString() : String(r.updated_at),
  }));
}

export async function upsertOverride(model: AIModel, updatedBy: string | null): Promise<void> {
  await db.execute(
    `INSERT INTO model_overrides (id, doc, action, enabled, updated_by, created_at, updated_at)
     VALUES (?, ?::jsonb, 'upsert', TRUE, ?, NOW(), NOW())
     ON CONFLICT (id) DO UPDATE SET doc = EXCLUDED.doc, action = 'upsert', enabled = TRUE, updated_by = EXCLUDED.updated_by, updated_at = NOW()`,
    [model.id, JSON.stringify(model), updatedBy]
  );
}

export async function disableStaticModel(id: string, updatedBy: string | null): Promise<void> {
  await db.execute(
    `INSERT INTO model_overrides (id, doc, action, enabled, updated_by, created_at, updated_at)
     VALUES (?, NULL, 'disable', TRUE, ?, NOW(), NOW())
     ON CONFLICT (id) DO UPDATE SET doc = NULL, action = 'disable', enabled = TRUE, updated_by = EXCLUDED.updated_by, updated_at = NOW()`,
    [id, updatedBy]
  );
}

/** Remove an override row entirely (reverts to static behavior for that id). */
export async function deleteOverride(id: string): Promise<boolean> {
  const changed = await db.execute("DELETE FROM model_overrides WHERE id = ?", [id]);
  return changed > 0;
}

// ============ Merge + refresh ============

export function computeEffectiveModels(overrides: ModelOverrideRow[]): AIModel[] {
  const map = new Map<string, AIModel>();
  for (const m of getStaticModels()) map.set(m.id, { ...m });

  for (const ov of overrides) {
    if (!ov.enabled) continue;
    if (ov.action === "disable") {
      map.delete(ov.id);
      continue;
    }
    if (ov.action === "upsert" && ov.doc) {
      const result = sanitizeModelDoc(ov.doc);
      if (result.ok) map.set(result.model.id, result.model);
      // invalid stored docs are ignored (fail safe — static entry, if any, remains)
    }
  }

  return Array.from(map.values());
}

let refreshTimer: ReturnType<typeof setInterval> | null = null;

/**
 * Rebuild the live `models` array from static seed + DB overrides, mutating in
 * place. Never throws: on any error the current catalog is left untouched.
 */
export async function refreshModels(): Promise<{ total: number; overrides: number } | null> {
  try {
    const overrides = await listOverrides();
    const effective = computeEffectiveModels(overrides);
    if (effective.length === 0) return null; // never wipe the catalog
    models.length = 0;
    models.push(...effective);
    return { total: effective.length, overrides: overrides.length };
  } catch (err) {
    console.warn(`[Models] refresh skipped: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}

/** Start periodic refresh so all cluster instances converge after admin edits. */
export function startModelRefreshLoop(intervalMs = 10_000): void {
  if (refreshTimer) return;
  refreshTimer = setInterval(() => { void refreshModels(); }, intervalMs);
  if (typeof refreshTimer.unref === "function") refreshTimer.unref();
}
