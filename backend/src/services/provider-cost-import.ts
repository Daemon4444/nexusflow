import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import { db } from "../db/client";
import { models as catalogModels } from "../data/models";

const SHA256 = /^[0-9a-f]{64}$/;
const SAFE_REFERENCE = /^[^/\\\0]{1,240}$/;

const optionalRate = z.number().finite().nonnegative().nullable();
const manifestRowSchema = z.object({
  modelId: z.string().min(1).max(160),
  inputTierMinTokens: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  inputTierMaxTokens: z.number().int().positive().max(Number.MAX_SAFE_INTEGER).nullable(),
  promptCost: z.number().finite().nonnegative(),
  completionCost: z.number().finite().nonnegative(),
  cacheReadImplicitCost: optionalRate,
  cacheReadExplicitCost: optionalRate,
  cacheCreation5mCost: optionalRate,
  sourceRowReference: z.string().min(1).max(500),
  conditionFingerprint: z.string().regex(SHA256),
  decision: z.enum(["ELIGIBLE_FULL", "ELIGIBLE_PARTIAL"]),
}).strict();

export const providerCostManifestSchema = z.object({
  schemaVersion: z.literal(1),
  providerId: z.literal("dashscope"),
  providerSlug: z.literal("dashscope"),
  currency: z.literal("CNY"),
  pricingType: z.literal("token"),
  effectiveFrom: z.string().datetime({ offset: true }),
  effectiveTo: z.string().datetime({ offset: true }).nullable().optional(),
  source: z.object({
    reference: z.string().regex(SAFE_REFERENCE),
    sha256: z.string().regex(SHA256),
  }).strict(),
  rows: z.array(manifestRowSchema).min(1).max(1_000),
}).strict();

export type ProviderCostManifest = z.infer<typeof providerCostManifestSchema>;
type ProviderCostManifestRow = ProviderCostManifest["rows"][number];

export interface ProviderCostImportSummary {
  dryRun: boolean;
  idempotent: boolean;
  reactivationRequired: boolean;
  reactivated: boolean;
  priceBookId: string;
  providerId: string;
  models: number;
  tiers: number;
  fullTiers: number;
  partialTiers: number;
  inactiveRoutes: number;
  sourceSha256: string;
  manifestSha256: string;
}

export interface ProviderCostDeactivationSummary {
  dryRun: boolean;
  priceBookId: string;
  activeRows: number;
  pendingRows: number;
  futureRows: number;
  models: number;
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`);
  return `{${entries.join(",")}}`;
}

export function manifestSha256(manifest: ProviderCostManifest): string {
  return createHash("sha256").update(canonicalJson(manifest)).digest("hex");
}

export function priceBookIdForManifest(manifest: ProviderCostManifest): string {
  return `pb-${manifest.source.sha256.slice(0, 24)}`;
}

function rowId(priceBookId: string, row: ProviderCostManifestRow): string {
  const digest = createHash("sha256")
    .update(priceBookId)
    .update("\0")
    .update(row.modelId)
    .update("\0")
    .update(String(row.inputTierMinTokens))
    .update("\0")
    .update(row.inputTierMaxTokens === null ? "infinity" : String(row.inputTierMaxTokens))
    .digest("hex");
  return `pcv-${digest.slice(0, 32)}`;
}

function validateCoverage(row: ProviderCostManifestRow): void {
  const cacheRates = [
    row.cacheReadImplicitCost,
    row.cacheReadExplicitCost,
    row.cacheCreation5mCost,
  ];
  if (row.decision === "ELIGIBLE_FULL" && cacheRates.some((rate) => rate === null)) {
    throw new Error(`${row.modelId}: ELIGIBLE_FULL requires every cache rate`);
  }
  if (row.decision === "ELIGIBLE_PARTIAL" && cacheRates.every((rate) => rate !== null)) {
    throw new Error(`${row.modelId}: ELIGIBLE_PARTIAL must identify at least one unavailable cache rate`);
  }
  if (
    row.inputTierMaxTokens !== null
    && row.inputTierMaxTokens <= row.inputTierMinTokens
  ) {
    throw new Error(`${row.modelId}: invalid input token tier`);
  }
}

function validateTierTopology(rows: ProviderCostManifestRow[]): void {
  const byModel = new Map<string, ProviderCostManifestRow[]>();
  for (const row of rows) {
    validateCoverage(row);
    const current = byModel.get(row.modelId) || [];
    current.push(row);
    byModel.set(row.modelId, current);
  }

  for (const [modelId, modelRows] of byModel) {
    const sorted = [...modelRows].sort(
      (a, b) => a.inputTierMinTokens - b.inputTierMinTokens
    );
    if (sorted[0].inputTierMinTokens !== 0) {
      throw new Error(`${modelId}: the first input tier must start at zero`);
    }
    for (let index = 1; index < sorted.length; index += 1) {
      const previous = sorted[index - 1];
      const current = sorted[index];
      if (
        previous.inputTierMaxTokens === null
        || current.inputTierMinTokens !== previous.inputTierMaxTokens
      ) {
        throw new Error(`${modelId}: token tiers overlap or contain a gap`);
      }
    }
  }
}

function normalizeManifest(input: unknown): ProviderCostManifest {
  const parsed = providerCostManifestSchema.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const path = issue?.path.length ? issue.path.join(".") : "manifest";
    throw new Error(`invalid provider cost manifest at ${path}: ${issue?.message || "schema mismatch"}`);
  }
  const manifest = parsed.data;
  if (
    manifest.effectiveTo
    && Date.parse(manifest.effectiveTo) <= Date.parse(manifest.effectiveFrom)
  ) {
    throw new Error("effectiveTo must be later than effectiveFrom");
  }
  const now = Date.now();
  if (Date.parse(manifest.effectiveFrom) > now) {
    throw new Error("price-book imports must be immediately effective");
  }
  if (manifest.effectiveTo && Date.parse(manifest.effectiveTo) <= now) {
    throw new Error("price-book effective window has already ended");
  }
  validateTierTopology(manifest.rows);

  const knownModels = new Set(catalogModels.map((model) => model.id));
  for (const row of manifest.rows) {
    if (!knownModels.has(row.modelId)) {
      throw new Error(`${row.modelId}: model does not exist in the application catalog`);
    }
  }
  return manifest;
}

interface ExistingCostRow {
  id: string;
  provider_id: string;
  model_id: string;
  input_tier_min_tokens: string | number;
  input_tier_max_tokens: string | number | null;
  prompt_cost_amount: string | number | null;
  completion_cost_amount: string | number | null;
  cache_read_implicit_cost_amount: string | number | null;
  cache_read_explicit_cost_amount: string | number | null;
  cache_creation_5m_cost_amount: string | number | null;
  source_reference: string | null;
  source_sha256: string | null;
  source_row_reference: string | null;
  condition_fingerprint: string | null;
  coverage_status: string | null;
  effective_from: string | Date;
  effective_to: string | Date | null;
}

function equalNumber(a: unknown, b: unknown): boolean {
  if (a === null || a === undefined || b === null || b === undefined) {
    return a == null && b == null;
  }
  return Number(a) === Number(b);
}

function timestampMillis(value: string | Date): number {
  // node-postgres returns TIMESTAMPTZ as a Date. Converting that Date through
  // String() drops its millisecond component, so exact manifest replay must
  // read the Date directly instead of comparing a lossy display string.
  const millis = value instanceof Date ? value.getTime() : Date.parse(value);
  if (!Number.isFinite(millis)) {
    throw new Error("existing price book contains an invalid effective timestamp");
  }
  return millis;
}

function assertExistingBookMatches(
  existing: ExistingCostRow[],
  manifest: ProviderCostManifest,
  priceBookId: string
): void {
  if (existing.length !== manifest.rows.length) {
    throw new Error("existing price book has a different tier count");
  }
  const expected = new Map(
    manifest.rows.map((row) => [rowId(priceBookId, row), row])
  );
  for (const actual of existing) {
    const row = expected.get(actual.id);
    if (!row) throw new Error("existing price book contains an unexpected tier");
    const matches =
      actual.provider_id === manifest.providerId
      && actual.model_id === row.modelId
      && Number(actual.input_tier_min_tokens) === row.inputTierMinTokens
      && equalNumber(actual.input_tier_max_tokens, row.inputTierMaxTokens)
      && equalNumber(actual.prompt_cost_amount, row.promptCost)
      && equalNumber(actual.completion_cost_amount, row.completionCost)
      && equalNumber(actual.cache_read_implicit_cost_amount, row.cacheReadImplicitCost)
      && equalNumber(actual.cache_read_explicit_cost_amount, row.cacheReadExplicitCost)
      && equalNumber(actual.cache_creation_5m_cost_amount, row.cacheCreation5mCost)
      && actual.source_reference === manifest.source.reference
      && actual.source_sha256 === manifest.source.sha256
      && actual.source_row_reference === row.sourceRowReference
      && actual.condition_fingerprint === row.conditionFingerprint
      && timestampMillis(actual.effective_from) === timestampMillis(manifest.effectiveFrom)
      && actual.coverage_status === (
        row.decision === "ELIGIBLE_FULL" ? "full" : "partial"
      );
    if (!matches) {
      throw new Error("existing price book content differs from the signed manifest");
    }
  }
}

async function validateDatabaseTargets(manifest: ProviderCostManifest): Promise<{
  inactiveRoutes: number;
}> {
  const provider = await db.queryOne<{
    id: string;
    slug: string;
    status: string;
  }>(
    "SELECT id, slug, status FROM providers WHERE id = ?",
    [manifest.providerId]
  );
  if (!provider || provider.slug !== manifest.providerSlug) {
    throw new Error("manifest provider does not match the configured provider");
  }
  if (provider.status !== "enabled") {
    throw new Error("manifest provider is not enabled");
  }

  const modelIds = [...new Set(manifest.rows.map((row) => row.modelId))];
  let inactiveRoutes = 0;
  for (const modelId of modelIds) {
    const route = await db.queryOne<{ is_enabled: boolean }>(
      `SELECT is_enabled
         FROM provider_capacity
        WHERE provider_id = ? AND model_id = ?`,
      [manifest.providerId, modelId]
    );
    if (!route) throw new Error(`${modelId}: provider route does not exist`);
    if (!route.is_enabled) inactiveRoutes += 1;
  }
  return { inactiveRoutes };
}

async function getExistingBook(priceBookId: string): Promise<ExistingCostRow[]> {
  return db.queryMany<ExistingCostRow>(
    `SELECT id, provider_id, model_id, input_tier_min_tokens,
            input_tier_max_tokens, prompt_cost_amount, completion_cost_amount,
            cache_read_implicit_cost_amount, cache_read_explicit_cost_amount,
            cache_creation_5m_cost_amount, source_reference, source_sha256,
            source_row_reference, condition_fingerprint, coverage_status,
            effective_from, effective_to
       FROM provider_cost_versions
      WHERE price_book_id = ?
      ORDER BY model_id, input_tier_min_tokens, id`,
    [priceBookId]
  );
}

function bookNeedsReactivation(
  existing: ExistingCostRow[],
  manifest: ProviderCostManifest
): boolean {
  if (existing.length === 0) return false;
  const now = Date.now();
  const ended = existing.map((row) => (
    row.effective_to !== null
    && timestampMillis(row.effective_to) <= now
  ));
  if (ended.some(Boolean) && !ended.every(Boolean)) {
    throw new Error("existing price book has a mixed active/deactivated state");
  }
  if (ended.every(Boolean)) {
    if (manifest.effectiveTo && Date.parse(manifest.effectiveTo) <= now) {
      throw new Error("manifest effective window has already ended");
    }
    return true;
  }

  const intendedEnd = manifest.effectiveTo
    ? Date.parse(manifest.effectiveTo)
    : null;
  for (const row of existing) {
    const actualEnd = row.effective_to === null
      ? null
      : timestampMillis(row.effective_to);
    if (actualEnd !== intendedEnd) {
      throw new Error("existing price book effective window differs from manifest");
    }
  }
  return false;
}

async function recordPriceBookAudit(
  tx: { execute: (sql: string, params?: any[]) => Promise<number> },
  manifest: ProviderCostManifest,
  priceBookId: string,
  digest: string,
  actorId: string | null | undefined,
  action: "provider_cost_book_imported" | "provider_cost_book_reactivated",
  createdAt: string
): Promise<void> {
  const byModel = new Map<string, number>();
  for (const row of manifest.rows) {
    byModel.set(row.modelId, (byModel.get(row.modelId) || 0) + 1);
  }
  for (const [modelId, tierCount] of byModel) {
    await tx.execute(
      `INSERT INTO route_change_audits (
         id, provider_id, model_id, action, before_config, after_config,
         actor_id, reason, created_at
       ) VALUES (?, ?, ?, ?, NULL, ?, ?, ?, ?)`,
      [
        randomUUID(),
        manifest.providerId,
        modelId,
        action,
        JSON.stringify({
          priceBookId,
          sourceSha256: manifest.source.sha256,
          manifestSha256: digest,
          tierCount,
        }),
        actorId || null,
        action === "provider_cost_book_imported"
          ? "Verified private upstream price-book import"
          : "Verified private upstream price-book reactivation",
        createdAt,
      ]
    );
  }
}

export async function importProviderCostManifest(
  input: unknown,
  options: {
    apply: boolean;
    actorId?: string | null;
  }
): Promise<ProviderCostImportSummary> {
  const manifest = normalizeManifest(input);
  const priceBookId = priceBookIdForManifest(manifest);
  const digest = manifestSha256(manifest);
  const { inactiveRoutes } = await validateDatabaseTargets(manifest);
  const existingBefore = await getExistingBook(priceBookId);
  if (existingBefore.length > 0) {
    assertExistingBookMatches(existingBefore, manifest, priceBookId);
  }

  let reactivationRequired = bookNeedsReactivation(existingBefore, manifest);
  let reactivated = false;
  let idempotent = existingBefore.length > 0 && !reactivationRequired;
  if (options.apply && (!idempotent || reactivationRequired)) {
    await db.transaction(async (tx) => {
      const lockedProvider = await tx.queryOne<{ id: string }>(
        "SELECT id FROM providers WHERE id = ? FOR UPDATE",
        [manifest.providerId]
      );
      if (!lockedProvider) throw new Error("provider disappeared during import");

      const concurrentRows = await tx.query<ExistingCostRow>(
        `SELECT id, provider_id, model_id, input_tier_min_tokens,
                input_tier_max_tokens, prompt_cost_amount, completion_cost_amount,
                cache_read_implicit_cost_amount, cache_read_explicit_cost_amount,
                cache_creation_5m_cost_amount, source_reference, source_sha256,
                source_row_reference, condition_fingerprint, coverage_status,
                effective_from, effective_to
           FROM provider_cost_versions
          WHERE price_book_id = ?
          ORDER BY model_id, input_tier_min_tokens, id`,
        [priceBookId]
      );
      if (concurrentRows.rows.length > 0) {
        assertExistingBookMatches(concurrentRows.rows, manifest, priceBookId);
        reactivationRequired = bookNeedsReactivation(
          concurrentRows.rows,
          manifest
        );
        if (reactivationRequired) {
          await tx.execute(
            `UPDATE provider_cost_versions
                SET effective_to = ?
              WHERE price_book_id = ?
                AND source = 'import'`,
            [manifest.effectiveTo || null, priceBookId]
          );
          const reactivatedAt = new Date().toISOString();
          await recordPriceBookAudit(
            tx,
            manifest,
            priceBookId,
            digest,
            options.actorId,
            "provider_cost_book_reactivated",
            reactivatedAt
          );
          reactivationRequired = false;
          reactivated = true;
          idempotent = false;
        } else {
          idempotent = true;
        }
        return;
      }

      const createdAt = new Date().toISOString();
      for (const row of manifest.rows) {
        const coverage = row.decision === "ELIGIBLE_FULL" ? "full" : "partial";
        await tx.execute(
          `INSERT INTO provider_cost_versions (
             id, price_book_id, provider_id, model_id, version_label,
             pricing_type, prompt_cost, completion_cost, fixed_cost,
             prompt_cost_amount, completion_cost_amount, fixed_cost_amount,
             input_tier_min_tokens, input_tier_max_tokens,
             cache_read_implicit_cost_amount, cache_read_explicit_cost_amount,
             cache_creation_5m_cost_amount, currency, effective_from,
             effective_to, notes, source, source_reference, source_sha256,
             source_row_reference, condition_fingerprint, coverage_status,
             created_by, created_at
           ) VALUES (
             ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?,
             ?, 'import', ?, ?, ?, ?, ?, ?, ?
           )`,
          [
            rowId(priceBookId, row),
            priceBookId,
            manifest.providerId,
            row.modelId,
            `upstream-${manifest.source.sha256.slice(0, 12)}`,
            manifest.pricingType,
            row.promptCost,
            row.completionCost,
            row.promptCost,
            row.completionCost,
            row.inputTierMinTokens,
            row.inputTierMaxTokens,
            row.cacheReadImplicitCost,
            row.cacheReadExplicitCost,
            row.cacheCreation5mCost,
            manifest.currency,
            manifest.effectiveFrom,
            manifest.effectiveTo || null,
            `Verified upstream import (${row.decision})`,
            manifest.source.reference,
            manifest.source.sha256,
            row.sourceRowReference,
            row.conditionFingerprint,
            coverage,
            options.actorId || null,
            createdAt,
          ]
        );
      }

      await recordPriceBookAudit(
        tx,
        manifest,
        priceBookId,
        digest,
        options.actorId,
        "provider_cost_book_imported",
        createdAt
      );
    });
  }

  const modelCount = new Set(manifest.rows.map((row) => row.modelId)).size;
  return {
    dryRun: !options.apply,
    idempotent,
    reactivationRequired,
    reactivated,
    priceBookId,
    providerId: manifest.providerId,
    models: modelCount,
    tiers: manifest.rows.length,
    fullTiers: manifest.rows.filter((row) => row.decision === "ELIGIBLE_FULL").length,
    partialTiers: manifest.rows.filter((row) => row.decision === "ELIGIBLE_PARTIAL").length,
    inactiveRoutes,
    sourceSha256: manifest.source.sha256,
    manifestSha256: digest,
  };
}

export async function deactivateProviderCostBook(
  priceBookId: string,
  options: { apply: boolean; actorId?: string | null; reason?: string }
): Promise<ProviderCostDeactivationSummary> {
  if (!/^pb-[0-9a-f]{24}$/.test(priceBookId)) {
    throw new Error("invalid provider cost price-book id");
  }
  type PendingRow = {
    provider_id: string;
    model_id: string;
    is_active: boolean;
  };
  const selectPending = `
    SELECT provider_id, model_id, effective_from < NOW() AS is_active
      FROM provider_cost_versions
     WHERE price_book_id = ?
       AND source = 'import'
       AND (effective_to IS NULL OR effective_to > NOW())`;
  const summarize = (
    rows: PendingRow[],
    dryRun: boolean
  ): ProviderCostDeactivationSummary => {
    const activeRows = rows.filter((row) => row.is_active).length;
    return {
      dryRun,
      priceBookId,
      activeRows,
      pendingRows: rows.length,
      futureRows: rows.length - activeRows,
      models: new Set(
        rows.map((row) => `${row.provider_id}:${row.model_id}`)
      ).size,
    };
  };

  if (!options.apply) {
    return summarize(
      await db.queryMany<PendingRow>(selectPending, [priceBookId]),
      true
    );
  }

  return db.transaction(async (tx) => {
    const pending = (
      await tx.query<PendingRow>(`${selectPending} FOR UPDATE`, [priceBookId])
    ).rows;
    const summary = summarize(pending, false);
    if (summary.futureRows > 0) {
      throw new Error(
        "provider cost price book contains future-effective pending rows; refusing deactivation"
      );
    }

    if (summary.activeRows > 0) {
      const updated = await tx.execute(
        `UPDATE provider_cost_versions
            SET effective_to = NOW()
          WHERE price_book_id = ?
            AND source = 'import'
            AND effective_from < NOW()
            AND (effective_to IS NULL OR effective_to > NOW())`,
        [priceBookId]
      );
      if (updated !== summary.activeRows) {
        throw new Error(
          "provider cost price book changed during deactivation; transaction rolled back"
        );
      }
      const models = new Set(
        pending.map((row) => `${row.provider_id}:${row.model_id}`)
      );
      for (const key of models) {
        const [providerId, modelId] = key.split(":", 2);
        await tx.execute(
          `INSERT INTO route_change_audits (
             id, provider_id, model_id, action, before_config, after_config,
             actor_id, reason, created_at
           ) VALUES (?, ?, ?, 'provider_cost_book_deactivated', ?, NULL, ?, ?, NOW())`,
          [
            randomUUID(),
            providerId,
            modelId,
            JSON.stringify({ priceBookId }),
            options.actorId || null,
            options.reason || "Release rollback",
          ]
        );
      }
    }
    return summary;
  });
}
