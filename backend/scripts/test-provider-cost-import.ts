import assert from "node:assert/strict";
import fs from "node:fs";
import { closeDb, db } from "../src/db/client";
import {
  calculateProviderCostFromTiers,
  getActiveProviderCostTiers,
  type ProviderCostTier,
} from "../src/services/provider-costs";
import {
  deactivateProviderCostBook,
  importProviderCostManifest,
  priceBookIdForManifest,
  providerCostManifestSchema,
} from "../src/services/provider-cost-import";

function tier(overrides: Partial<ProviderCostTier> = {}): ProviderCostTier {
  return {
    id: "tier-low",
    priceBookId: "pb-test",
    providerId: "dashscope",
    modelId: "qwen3.7-plus",
    versionLabel: "test",
    pricingType: "token",
    inputTierMinTokens: 0,
    inputTierMaxTokens: 100,
    promptCost: 1,
    completionCost: 2,
    fixedCost: 0,
    cacheReadImplicitCost: 0.2,
    cacheReadExplicitCost: 0.1,
    cacheCreation5mCost: 1.25,
    currency: "CNY",
    effectiveFrom: "2026-01-01T00:00:00.000Z",
    effectiveTo: null,
    source: "import",
    sourceReference: "synthetic.xlsx",
    sourceSha256: "a".repeat(64),
    sourceRowReference: "test-row",
    conditionFingerprint: "b".repeat(64),
    coverageStatus: "full",
    notes: "synthetic test fixture",
    createdBy: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

async function main(): Promise<void> {
  const tiers = [
    tier(),
    tier({
      id: "tier-high",
      inputTierMinTokens: 100,
      inputTierMaxTokens: 200,
      promptCost: 3,
      completionCost: 4,
    }),
  ];
  assert.equal(calculateProviderCostFromTiers(tiers, {
    promptTokens: 99,
    completionTokens: 1,
  }).costVersionId, "tier-low");
  assert.equal(calculateProviderCostFromTiers(tiers, {
    promptTokens: 100,
    completionTokens: 1,
  }).costVersionId, "tier-high");
  assert.equal(calculateProviderCostFromTiers(tiers, {
    promptTokens: 200,
    completionTokens: 1,
  }).resolution, "missing_tier");
  assert.equal(calculateProviderCostFromTiers([
    tier({ inputTierMaxTokens: 150 }),
    tier({ id: "overlap", inputTierMinTokens: 100, inputTierMaxTokens: 200 }),
  ], {
    promptTokens: 120,
    completionTokens: 0,
  }).resolution, "ambiguous_tier");

  const cached = calculateProviderCostFromTiers(tiers, {
    promptTokens: 100,
    completionTokens: 0,
    cachedTokens: 20,
    cacheCreationTokens: 10,
    providerCacheMode: "explicit",
    providerInputIncludesCache: true,
  });
  assert.equal(cached.resolution, "exact");
  assert.equal(cached.costVersionId, "tier-high");
  assert.equal(cached.amount, 0.000225);
  assert.equal(calculateProviderCostFromTiers(tiers, {
    promptTokens: 70,
    completionTokens: 0,
    cachedTokens: 20,
    cacheCreationTokens: 10,
    providerCacheMode: "explicit",
    providerInputIncludesCache: false,
  }).costVersionId, "tier-high");
  assert.equal(calculateProviderCostFromTiers(tiers, {
    promptTokens: 100,
    completionTokens: 0,
    cachedTokens: 1,
    providerInputIncludesCache: true,
  }).resolution, "missing_cache_mode");
  assert.equal(calculateProviderCostFromTiers(tiers, {
    promptTokens: 1,
    completionTokens: 0,
    cachedTokens: 2,
    providerCacheMode: "implicit",
    providerInputIncludesCache: true,
  }).resolution, "inconsistent_usage");
  assert.equal(calculateProviderCostFromTiers([
    tier({ cacheReadExplicitCost: null }),
  ], {
    promptTokens: 50,
    completionTokens: 0,
    cachedTokens: 1,
    providerCacheMode: "explicit",
    providerInputIncludesCache: true,
  }).resolution, "missing_cache_rate");

  await db.execute(
    `INSERT INTO providers (
       id, name, slug, description, api_base_url, api_key, contact_name,
       contact_email, status, created_at, updated_at
     ) VALUES (?, ?, ?, '', ?, '', 'test', 'test@example.invalid', 'enabled', NOW(), NOW())`,
    ["dashscope", "DashScope test", "dashscope", "https://example.invalid"]
  );
  await db.execute(
    `INSERT INTO provider_capacity (
       id, provider_id, model_id, rpm_limit, tpm_limit, daily_limit,
       concurrent_limit, priority, weight, is_enabled, created_at, updated_at
     ) VALUES (?, 'dashscope', 'qwen3.7-plus', 60, 100000, 10000, 10, 0, 100, TRUE, NOW(), NOW())`,
    ["capacity-provider-cost-test"]
  );

  const manifest = providerCostManifestSchema.parse({
    schemaVersion: 1,
    providerId: "dashscope",
    providerSlug: "dashscope",
    currency: "CNY",
    pricingType: "token",
    effectiveFrom: "2026-01-01T00:00:00.000Z",
    effectiveTo: null,
    source: {
      reference: "synthetic-upstream.xlsx",
      sha256: "c".repeat(64),
    },
    rows: [
      {
        modelId: "qwen3.7-plus",
        inputTierMinTokens: 0,
        inputTierMaxTokens: 100,
        promptCost: 1,
        completionCost: 2,
        cacheReadImplicitCost: 0.2,
        cacheReadExplicitCost: 0.1,
        cacheCreation5mCost: 1.25,
        sourceRowReference: "1,2,3",
        conditionFingerprint: "d".repeat(64),
        decision: "ELIGIBLE_FULL",
      },
      {
        modelId: "qwen3.7-plus",
        inputTierMinTokens: 100,
        inputTierMaxTokens: 1_000_000,
        promptCost: 3,
        completionCost: 4,
        cacheReadImplicitCost: null,
        cacheReadExplicitCost: 0.3,
        cacheCreation5mCost: null,
        sourceRowReference: "4,5",
        conditionFingerprint: "e".repeat(64),
        decision: "ELIGIBLE_PARTIAL",
      },
    ],
  });
  const dryRun = await importProviderCostManifest(manifest, { apply: false });
  assert.equal(dryRun.dryRun, true);
  assert.equal(dryRun.idempotent, false);
  assert.equal(dryRun.tiers, 2);

  const applied = await importProviderCostManifest(manifest, { apply: true });
  assert.equal(applied.dryRun, false);
  assert.equal(applied.idempotent, false);
  const replay = await importProviderCostManifest(manifest, { apply: true });
  assert.equal(replay.idempotent, true);

  const activeTiers = await getActiveProviderCostTiers(
    "dashscope",
    "qwen3.7-plus"
  );
  assert.equal(activeTiers.length, 2);
  assert.equal(activeTiers[1].coverageStatus, "partial");

  const priceBookId = priceBookIdForManifest(manifest);
  const deactivated = await deactivateProviderCostBook(priceBookId, {
    apply: true,
    reason: "synthetic rollback test",
  });
  assert.equal(deactivated.activeRows, 2);
  assert.equal(deactivated.pendingRows, 2);
  assert.equal(deactivated.futureRows, 0);
  assert.equal((
    await getActiveProviderCostTiers("dashscope", "qwen3.7-plus")
  ).length, 0);
  const reactivationDryRun = await importProviderCostManifest(manifest, {
    apply: false,
  });
  assert.equal(reactivationDryRun.idempotent, false);
  assert.equal(reactivationDryRun.reactivationRequired, true);
  assert.equal(reactivationDryRun.reactivated, false);
  const reactivated = await importProviderCostManifest(manifest, {
    apply: true,
  });
  assert.equal(reactivated.idempotent, false);
  assert.equal(reactivated.reactivationRequired, false);
  assert.equal(reactivated.reactivated, true);
  assert.equal((
    await getActiveProviderCostTiers("dashscope", "qwen3.7-plus")
  ).length, 2);
  const afterReactivationReplay = await importProviderCostManifest(manifest, {
    apply: true,
  });
  assert.equal(afterReactivationReplay.idempotent, true);
  assert.equal(afterReactivationReplay.reactivated, false);

  await db.execute(
    `UPDATE provider_cost_versions
        SET effective_from = '2099-01-01T00:00:00.000Z',
            effective_to = NULL
      WHERE id = (
        SELECT id
          FROM provider_cost_versions
         WHERE price_book_id = ?
         ORDER BY id
         LIMIT 1
      )`,
    [priceBookId]
  );
  const futurePending = await deactivateProviderCostBook(priceBookId, {
    apply: false,
    reason: "future pending fail-closed test",
  });
  assert.equal(futurePending.activeRows, 1);
  assert.equal(futurePending.pendingRows, 2);
  assert.equal(futurePending.futureRows, 1);
  await assert.rejects(
    deactivateProviderCostBook(priceBookId, {
      apply: true,
      reason: "future pending fail-closed test",
    }),
    /future-effective pending rows/
  );
  await db.execute(
    `UPDATE provider_cost_versions
        SET effective_from = ?
      WHERE price_book_id = ?
        AND effective_from = '2099-01-01T00:00:00.000Z'`,
    [manifest.effectiveFrom, priceBookId]
  );

  await deactivateProviderCostBook(priceBookId, {
    apply: true,
    reason: "mixed state fail-closed test",
  });
  await db.execute(
    `UPDATE provider_cost_versions
        SET effective_to = NULL
      WHERE id = (
        SELECT id
          FROM provider_cost_versions
         WHERE price_book_id = ?
         ORDER BY id
         LIMIT 1
      )`,
    [priceBookId]
  );
  await assert.rejects(
    importProviderCostManifest(manifest, { apply: false }),
    /mixed active\/deactivated state/
  );

  await assert.rejects(
    importProviderCostManifest({
      ...manifest,
      source: { ...manifest.source, sha256: "f".repeat(64) },
      rows: [
        manifest.rows[0],
        {
          ...manifest.rows[1],
          inputTierMinTokens: 50,
        },
      ],
    }, { apply: false }),
    /overlap or contain a gap/
  );
  await assert.rejects(
    importProviderCostManifest({
      ...manifest,
      effectiveFrom: new Date(Date.now() + 60_000).toISOString(),
      source: { ...manifest.source, sha256: "1".repeat(64) },
    }, { apply: false }),
    /immediately effective/
  );

  const privateManifestPath = process.env.PROVIDER_COST_PRIVATE_MANIFEST;
  if (privateManifestPath) {
    const privateManifest = providerCostManifestSchema.parse(
      JSON.parse(fs.readFileSync(privateManifestPath, "utf8"))
    );
    const privateModelIds = new Set(
      privateManifest.rows.map((row) => row.modelId)
    );
    for (const modelId of privateModelIds) {
      await db.execute(
        `INSERT INTO provider_capacity (
           id, provider_id, model_id, rpm_limit, tpm_limit, daily_limit,
           concurrent_limit, priority, weight, is_enabled, created_at, updated_at
         ) VALUES (?, 'dashscope', ?, 60, 100000, 10000, 10, 0, 100, TRUE, NOW(), NOW())
         ON CONFLICT(provider_id, model_id) DO NOTHING`,
        [`private-cost-${modelId}`, modelId]
      );
    }
    const privateDryRun = await importProviderCostManifest(privateManifest, {
      apply: false,
    });
    const expectedPrivateTiers = privateManifest.rows.length;
    const expectedPrivateModels = privateModelIds.size;
    assert.equal(privateDryRun.tiers, expectedPrivateTiers);
    assert.equal(privateDryRun.models, expectedPrivateModels);
    const privateApply = await importProviderCostManifest(privateManifest, {
      apply: true,
    });
    assert.equal(privateApply.tiers, expectedPrivateTiers);
    assert.equal(privateApply.reactivated, false);
    const privatePriceBookId = priceBookIdForManifest(privateManifest);
    const countActivePrivateRows = async (): Promise<number> => {
      const row = await db.queryOne<{ count: string | number }>(
        `SELECT COUNT(*) AS count
           FROM provider_cost_versions
          WHERE price_book_id = ?
            AND effective_from <= NOW()
            AND (effective_to IS NULL OR effective_to > NOW())`,
        [privatePriceBookId]
      );
      return Number(row?.count || 0);
    };
    for (const modelId of privateModelIds) {
      const modelTiers = await getActiveProviderCostTiers("dashscope", modelId);
      assert.ok(modelTiers.length > 0);
      for (const currentTier of modelTiers) {
        const uncached = calculateProviderCostFromTiers(modelTiers, {
          promptTokens: currentTier.inputTierMinTokens,
          completionTokens: 1,
        });
        assert.equal(uncached.resolution, "exact");
      }
    }
    assert.equal(await countActivePrivateRows(), expectedPrivateTiers);

    const privateDeactivation = await deactivateProviderCostBook(
      privatePriceBookId,
      {
        apply: true,
        reason: "private manifest release rollback test",
      }
    );
    assert.equal(privateDeactivation.activeRows, expectedPrivateTiers);
    assert.equal(privateDeactivation.pendingRows, expectedPrivateTiers);
    assert.equal(privateDeactivation.futureRows, 0);
    assert.equal(await countActivePrivateRows(), 0);

    const privateReactivationDryRun = await importProviderCostManifest(
      privateManifest,
      { apply: false }
    );
    assert.equal(privateReactivationDryRun.idempotent, false);
    assert.equal(privateReactivationDryRun.reactivationRequired, true);
    assert.equal(privateReactivationDryRun.reactivated, false);
    const privateReactivation = await importProviderCostManifest(
      privateManifest,
      { apply: true }
    );
    assert.equal(privateReactivation.idempotent, false);
    assert.equal(privateReactivation.reactivationRequired, false);
    assert.equal(privateReactivation.reactivated, true);
    assert.equal(await countActivePrivateRows(), expectedPrivateTiers);
    console.log(
      `private provider cost manifest validated (${expectedPrivateTiers} tiers / ${expectedPrivateModels} models)`
    );
  }

  console.log("provider cost import tests passed");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
