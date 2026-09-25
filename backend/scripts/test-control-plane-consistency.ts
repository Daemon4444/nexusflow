/**
 * P1a: control-plane consistency rules. Offline only (fixtures + synthetic).
 */
import assert from "node:assert/strict";
import path from "node:path";
import { getStaticModels } from "../src/data/models";
import {
  findCapabilityMismatches,
  findInvalidProviderUrls,
  findRedundantOverrides,
  findRoutesToUnknownModels,
  findSellableModelsWithoutRoute,
  renderCleanupSql,
  renderConsistencyMarkdown,
  runConsistencyChecks,
  type CapacityRow,
  type ConsistencyInput,
} from "../src/control-plane/consistency";
import { loadOfflineInput } from "../src/cli/control-plane-consistency";

const fixtures = path.resolve(__dirname, "fixtures/bailian-2026-09-25");

function route(provider_id: string, model_id: string, is_enabled = true): CapacityRow {
  return { provider_id, model_id, rpm_limit: 1000, tpm_limit: 1_000_000, daily_limit: 0, concurrent_limit: 0, is_enabled };
}

function main(): void {
  const input = loadOfflineInput(fixtures);
  const subjects = (findings: Array<{ subject: string }>) => findings.map((finding) => finding.subject).sort();

  // Rule 1: sold but no enabled route (fixture examples).
  const rule1 = subjects(findSellableModelsWithoutRoute(input));
  for (const id of ["seedance-1.0-pro", "seedance-1.0-pro-fast", "seedance-1.5-pro"]) {
    assert.ok(rule1.includes(id), `rule 1 must flag ${id}`);
  }
  // Synthetic: an override that disables a model removes it from rule 1.
  const synthetic: ConsistencyInput = {
    staticModels: getStaticModels().filter((model) => ["qwen3.8-max", "glm-5.2"].includes(model.id)),
    overrides: [],
    capacity: [route("dashscope", "qwen3.8-max")],
    providers: null,
  };
  assert.deepEqual(subjects(findSellableModelsWithoutRoute(synthetic)), ["glm-5.2"]);
  assert.deepEqual(
    subjects(findSellableModelsWithoutRoute({ ...synthetic, overrides: [{ id: "glm-5.2", doc: null, action: "disable", enabled: true }] })),
    []
  );
  // A route on a disabled provider does not count (online mode).
  assert.deepEqual(
    subjects(findSellableModelsWithoutRoute({
      ...synthetic,
      providers: [{ id: "dashscope", status: "disabled", api_base_url: "https://dashscope.aliyuncs.com/compatible-mode/v1", has_api_key: true }],
    })),
    ["glm-5.2", "qwen3.8-max"]
  );

  // Rule 2: routes to unknown models (fixture examples), SQL only for enabled ones.
  const rule2 = findRoutesToUnknownModels(input);
  for (const subject of ["dashscope/MiniMax-M2.7", "dashscope/qwen3-tts-flash-realtime", "himodels/claude-fable-5", "anthropic/claude-opus-4-7"]) {
    assert.ok(rule2.some((finding) => finding.subject === subject), `rule 2 must flag ${subject}`);
  }
  assert.match(rule2.find((finding) => finding.subject === "dashscope/MiniMax-M2.7")!.cleanupSql!, /^UPDATE provider_capacity SET is_enabled = FALSE/);
  assert.equal(rule2.find((finding) => finding.subject === "himodels/claude-fable-5")!.cleanupSql, undefined);

  // Rule 3: redundant override (fixture example differs only in display fields).
  const rule3 = findRedundantOverrides(input);
  assert.deepEqual(subjects(rule3), ["glm-5.2-fast-preview"]);
  assert.match(rule3[0].detail, /display fields \(supported\)/);
  const qwen = getStaticModels().find((model) => model.id === "qwen3.8-max")!;
  assert.equal(
    findRedundantOverrides({ ...synthetic, overrides: [{ id: qwen.id, doc: { ...qwen }, action: "upsert", enabled: true }] })[0].severity,
    "low",
    "a byte-identical override is low severity"
  );
  assert.deepEqual(
    findRedundantOverrides({ ...synthetic, overrides: [{ id: qwen.id, doc: { ...qwen, promptPrice: qwen.promptPrice + 1 }, action: "upsert", enabled: true }] }),
    [],
    "a price change is a real override"
  );
  assert.deepEqual(
    findRedundantOverrides({ ...synthetic, overrides: [{ id: qwen.id, doc: { ...qwen }, action: "upsert", enabled: false }] }),
    [],
    "disabled overrides are ignored"
  );

  // Rule 4: invalid provider URL holding a secret (online only; synthetic rows).
  const rule4 = findInvalidProviderUrls([
    { id: "eab81421-0000-0000-0000-000000000000", status: "enabled", api_base_url: "sk-not-a-url", has_api_key: true },
    { id: "empty-url-no-key", status: "enabled", api_base_url: "", has_api_key: false },
    { id: "http-url", status: "enabled", api_base_url: "http://example.com/v1", has_api_key: true },
    { id: "ok", status: "enabled", api_base_url: "https://dashscope.aliyuncs.com/compatible-mode/v1", has_api_key: true },
    { id: "already-off", status: "disabled", api_base_url: "::::", has_api_key: true },
  ]);
  assert.deepEqual(subjects(rule4), ["already-off", "eab81421-0000-0000-0000-000000000000", "http-url"]);
  assert.match(rule4.find((finding) => finding.subject === "http-url")!.cleanupSql!, /SET status = 'disabled'/);
  assert.equal(rule4.find((finding) => finding.subject === "already-off")!.cleanupSql, undefined);

  // Rule 5: declared capability vs capability model (fixture example).
  const rule5 = findCapabilityMismatches(input);
  const deepseek = rule5.find((finding) => finding.subject === "deepseek-v4.1-flash");
  assert.ok(deepseek, "rule 5 must flag deepseek-v4.1-flash");
  assert.match(deepseek!.detail, /联网搜索.*supports_search/);
  assert.equal(
    findCapabilityMismatches({ ...synthetic, staticModels: [{ ...qwen, supported: ["文本", "联网搜索"] }] }).length,
    0,
    "a model that really supports search is not flagged"
  );

  // Report / SQL rendering.
  const report = runConsistencyChecks(input, { mode: "offline", source: "fixtures", now: new Date("2026-09-25T00:00:00Z") });
  assert.equal(report.skippedRules[0].rule, "provider_invalid_url_with_secret");
  const sql = renderCleanupSql(report);
  const executable = sql.replace(/^--.*$/gm, "");
  assert.doesNotMatch(executable, /\bDELETE\b|\bDROP\b|\bTRUNCATE\b|\bINSERT\b/i);
  for (const statement of executable.split(";").map((part) => part.trim()).filter(Boolean)) {
    assert.ok(/^(BEGIN|COMMIT|UPDATE )/.test(statement), `unexpected statement: ${statement}`);
  }
  const statementCount = (executable.match(/^UPDATE /gm) || []).length;
  const commentCount = (sql.match(/^-- \[/gm) || []).length;
  assert.equal(statementCount, commentCount, "every statement has a reason comment");
  assert.match(renderConsistencyMarkdown(report), /seedance-1\.5-pro/);
  console.log("control-plane consistency tests passed");
}

main();
