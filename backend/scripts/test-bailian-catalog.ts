/**
 * P1b: Bailian official catalog sync. Fully offline (fixtures + synthetic HTML).
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import zlib from "node:zlib";
import { expandTable, extractTables } from "../src/services/upstream-catalog/html-grid";
import {
  normalizeRegion,
  parseLimitNumber,
  parsePrice,
  parseRateLimitPage,
  parseTokenRange,
  poolIdFor,
} from "../src/services/upstream-catalog/bailian/parse";
import {
  bailianSnapshotSchema,
  buildSnapshot,
  compareWithRef,
  diffAgainstPrevious,
  GOLDEN_LIMITS,
  selfCheck,
  type BailianSnapshot,
} from "../src/services/upstream-catalog/bailian/snapshot";
import { fetchModelList, loadOfflineSources } from "../src/services/upstream-catalog/bailian/sources";
import { runSync } from "../src/cli/bailian-catalog-sync";
import { REF } from "../src/data/official-pricing-ref";

const fixtures = path.resolve(__dirname, "fixtures/bailian-2026-09-25");
const repositoryRoot = path.resolve(__dirname, "../..");

function gridTexts(html: string): string[][] {
  const [table] = extractTables(html);
  return [...table.headerRows, ...table.bodyRows].map((row) => row.map((cell) => cell.text));
}

async function main(): Promise<void> {
  // --- table grid expansion (rowspan + colspan) --------------------------
  const grid = gridTexts(`
    <h3>Family</h3><h4>华北2（北京）</h4>
    <table><thead>
      <tr><th rowspan="2">模型名称</th><th colspan="2">限流条件</th></tr>
      <tr><th>每分钟调用次数（RPM）</th><th>每分钟消耗Token数（TPM）</th></tr>
    </thead><tbody>
      <tr><td>a-1</td><td rowspan="2">500 共享</td><td>1,000</td></tr>
      <tr><td>b-2</td><td>2,000</td></tr>
      <tr><td>c-3</td><td colspan="2">动态限流</td></tr>
    </tbody></table>`);
  assert.deepEqual(grid, [
    ["模型名称", "限流条件", "限流条件"],
    ["模型名称", "每分钟调用次数（RPM）", "每分钟消耗Token数（TPM）"],
    ["a-1", "500 共享", "1,000"],
    ["b-2", "500 共享", "2,000"],
    ["c-3", "动态限流", "动态限流"],
  ]);
  const [table] = extractTables("<h4>新加坡</h4><table><tr><th>x</th></tr><tr><td>1</td></tr></table>");
  assert.equal(table.headings.h4, "新加坡");
  assert.equal(table.headerRows.length, 1, "leading all-<th> rows are headers without a thead");
  // A rowspan that overruns the table is clipped rather than inventing rows.
  const clipped = expandTable({ nodeName: "table", childNodes: [] } as never);
  assert.equal(clipped.rows.length, 0);

  // --- regions / numbers / prices -----------------------------------------
  assert.equal(normalizeRegion("华北 2（北京）"), "cn-beijing");
  assert.equal(normalizeRegion("美国（弗吉尼亚）"), "us-east-1");
  assert.equal(normalizeRegion("新加坡"), "ap-southeast-1");
  assert.equal(normalizeRegion("德国（法兰克福）"), "eu-central-1");
  assert.equal(normalizeRegion("日本（东京）"), "ap-northeast-1");
  assert.equal(normalizeRegion("中国香港"), "cn-hongkong");
  assert.equal(normalizeRegion("Qwen3-TTS-Flash"), null);
  assert.equal(parseLimitNumber("3,000,000 同一个 API Key 下共享"), 3_000_000);
  assert.equal(parseLimitNumber("1,200万"), 12_000_000);
  assert.equal(parseLimitNumber("动态限流"), null);
  assert.deepEqual(parsePrice("原价2元（限时8折）"), { value: 2, promotion: "限时8折" });
  assert.deepEqual(parsePrice("0.8元"), { value: 0.8 });
  assert.equal(parsePrice("-"), null);
  assert.deepEqual(parseTokenRange("0<Token≤32K"), { minTokens: 0, maxTokens: 32768 });
  assert.deepEqual(parseTokenRange("256K<Token≤1M"), { minTokens: 262144, maxTokens: 1_000_000 });
  assert.deepEqual(parseTokenRange("无阶梯计价"), { minTokens: 0, maxTokens: null });

  // --- shared pools and dynamic limits (synthetic) -------------------------
  const synthetic = parseRateLimitPage(`
    <h3>Kimi</h3><h4>华北2（北京）</h4>
    <table><thead><tr><th>模型名称</th><th>每分钟调用次数（RPM）</th><th>每分钟消耗Token数（TPM）</th></tr></thead>
    <tbody>
      <tr><td><p>m/x-1</p></td><td rowspan="2">500 在 2 个模型中共享</td><td rowspan="2">3,000,000 共享</td></tr>
      <tr><td><p>m/y-2</p></td></tr>
      <tr><td><p>z-3</p></td><td colspan="2">动态限流</td></tr>
    </tbody></table>
    <h4>2026年5月13日下线</h4>
    <table><thead><tr><th>模型名称</th><th>每分钟调用次数（RPM）</th></tr></thead><tbody><tr><td>old-1</td><td>1</td></tr></tbody></table>`);
  const poolId = poolIdFor("cn-beijing", ["m/y-2", "m/x-1"]);
  assert.equal(poolId, poolIdFor("cn-beijing", ["m/x-1", "m/y-2"]), "pool id is order independent");
  assert.deepEqual(synthetic.pools[poolId], { region: "cn-beijing", members: ["m/x-1", "m/y-2"], rpm: 500, tpm: 3_000_000 });
  assert.equal(synthetic.limits["m/y-2"]["cn-beijing"]?.poolId, poolId);
  assert.deepEqual(synthetic.limits["z-3"]["cn-beijing"], { dynamic: true });
  assert.equal(synthetic.limits["old-1"], undefined, "retired sections are skipped");

  // --- fixtures: snapshot + golden assertions ----------------------------
  const sources = loadOfflineSources(fixtures);
  const snapshot = buildSnapshot(sources, { fetchedAt: "2026-09-25T05:58:43.003Z", mode: "offline" });
  bailianSnapshotSchema.parse(snapshot);
  for (const golden of GOLDEN_LIMITS) {
    const limit = snapshot.models[golden.model].regions[golden.region]!;
    assert.equal(limit.rpm, golden.rpm, `${golden.model} rpm`);
    assert.equal(limit.tpm, golden.tpm, `${golden.model} tpm`);
  }
  const kimiPool = snapshot.pools[snapshot.models["kimi/kimi-k3"].regions["cn-beijing"]!.poolId!];
  assert.equal(kimiPool.members.length, 5);
  assert.ok(kimiPool.members.includes("kimi/kimi-k2.7-code-highspeed"));
  assert.equal(snapshot.models["qwen3.8-max"].regions["cn-beijing"]?.dynamic, true);
  assert.deepEqual(
    snapshot.models["qwen3.7-plus"].pricing?.tiers.map((tier) => [tier.maxTokens, tier.input, tier.output]),
    [[262144, 2, 8], [1_000_000, 6, 24]],
    "list prices are recorded, not the temporary promotion"
  );
  assert.equal(snapshot.models["qwen-plus"].pricing?.tiers[0].thinkingOutput, 8);
  assert.equal(snapshot.models["deepseek-v4-flash"].listed, true);

  const check = selfCheck(snapshot, { ref: REF });
  assert.deepEqual(check.failures, []);
  assert.ok(check.priceModelsCompared >= 40, "most REF Bailian models overlap the parsed prices");

  // --- self-check failures ------------------------------------------------
  const clone = (): BailianSnapshot => JSON.parse(JSON.stringify(snapshot));
  const broken = clone();
  broken.models["glm-5.2"].regions["cn-beijing"] = { rpm: 1000, tpm: 2_000_000 };
  assert.match(selfCheck(broken, { ref: REF }).failures.join("\n"), /glm-5\.2 cn-beijing expected 500 RPM/);
  const shrunk = clone();
  for (const id of Object.keys(shrunk.models).slice(0, 200)) delete shrunk.models[id];
  assert.match(selfCheck(shrunk, { ref: REF, previous: snapshot }).failures.join("\n"), /dropped|minimum/);
  const repriced = clone();
  repriced.models["qwen3.8-max"].pricing!.tiers[0].input = 99;
  const refIssues = compareWithRef(repriced, REF).issues;
  assert.deepEqual(refIssues.map((issue) => [issue.model, issue.classification]), [["qwen3.8-max", "ref_outdated"]]);
  const retiered = clone();
  retiered.models["qwen3-max"].pricing!.tiers.pop();
  assert.equal(compareWithRef(retiered, REF).issues[0].classification, "parser_issue");

  // --- snapshot vs previous -------------------------------------------------
  assert.deepEqual(diffAgainstPrevious(snapshot, null), []);
  const changed = clone();
  changed.models["glm-5.2"].regions["cn-beijing"] = { rpm: 600, tpm: 2_000_000 };
  changed.models["deepseek-v4-flash"].listed = false;
  assert.deepEqual(
    diffAgainstPrevious(changed, snapshot).map((change) => [change.model, change.field]),
    [["deepseek-v4-flash", "listed"], ["glm-5.2", "limits"]]
  );

  // --- model list pagination ---------------------------------------------
  const requested: string[] = [];
  const pages: Record<string, unknown> = {
    "": { data: [{ id: "a" }, { id: "b" }], has_more: true, last_id: "b" },
    b: { data: [{ id: "c" }], has_more: true, last_id: "c" },
    c: { data: [{ id: "d" }], has_more: false },
  };
  const list = await fetchModelList("sk-test", async (url, init) => {
    requested.push(url);
    assert.equal((init?.headers as Record<string, string>).Authorization, "Bearer sk-test");
    const after = new URL(url).searchParams.get("after") || "";
    return new Response(JSON.stringify(pages[after]), { status: 200 });
  });
  assert.deepEqual(list.ids, ["a", "b", "c", "d"]);
  assert.equal(requested.length, 3);
  assert.ok(requested.every((url) => url.startsWith("https://dashscope.aliyuncs.com/compatible-mode/v1/models")));
  await assert.rejects(
    fetchModelList("sk-test", async () => new Response(JSON.stringify({ data: [], has_more: true }), { status: 200 })),
    /did not advance/
  );
  await assert.rejects(fetchModelList(""), /DASHSCOPE_API_KEY/);

  // --- end to end on fixtures (no write) ------------------------------------
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "bailian-sync-test-"));
  try {
    const { report, written } = await runSync({
      offline: fixtures, online: false, out: scratch, write: false, notify: false, failOnDiff: false,
    });
    assert.deepEqual(written, []);
    const above = report.diffs.filter((diff) => diff.category === "limit_above_upstream").map((diff) => diff.model);
    assert.ok(above.includes("glm-5.2"), "glm-5.2 is configured at 1000 RPM vs upstream 500");
    assert.ok(above.includes("MiniMax/MiniMax-M3"));
    assert.ok(report.diffs.some((diff) => diff.category === "pool_not_modeled" && diff.model.includes("kimi/kimi-k2.7-code-highspeed")));
    assert.equal(report.counts.price_mismatch, 0);
    // The committed report is exactly what the fixtures reproduce.
    const committed = JSON.parse(fs.readFileSync(path.join(repositoryRoot, "docs/upstream-sync/bailian-2026-09-25.json"), "utf8"));
    assert.deepEqual(committed, JSON.parse(JSON.stringify(report)), "docs/upstream-sync/bailian-2026-09-25.json is stale; re-run the offline sync");

    // A failing self-check writes nothing.
    const brokenFixtures = path.join(scratch, "fixtures");
    fs.mkdirSync(brokenFixtures);
    for (const name of fs.readdirSync(fixtures)) fs.copyFileSync(path.join(fixtures, name), path.join(brokenFixtures, name));
    fs.writeFileSync(path.join(brokenFixtures, "rate-limit.html.gz"), zlib.gzipSync("<html><body><h4>华北2（北京）</h4></body></html>"));
    const out = path.join(scratch, "out");
    await assert.rejects(
      runSync({ offline: brokenFixtures, online: false, out, write: true, notify: false, failOnDiff: false }),
      /self-check failed; nothing was written/
    );
    assert.equal(fs.existsSync(out), false, "no report or snapshot on self-check failure");
  } finally {
    fs.rmSync(scratch, { recursive: true, force: true });
  }

  console.log("bailian catalog sync tests passed");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
