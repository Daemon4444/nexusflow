/**
 * Route probe (P5). For people only: sends real (minimal, few-token)
 * requests to every active route of the current control-plane version.
 *
 *   ts-node src/cli/route-probe.ts [--model <id>] [--route <id>] [--write] [--dry-run]
 *
 * --dry-run  print the planned probes without sending anything
 * --write    store results in cp_route_probe_results
 * A declared capability that fails its probe triggers a notification and
 * exit code 2. Credentials are read from the providers table (secret_ref
 * legacy_provider:<id>) and never printed.
 */
import { getCurrentVersion } from "../control-plane/store";
import { indexContent } from "../control-plane/runtime";
import { planProbes, probeMismatches, runProbe, storeProbeResults, type ProbeResult } from "../control-plane/probe";
import { notify } from "../services/notifier";
import { decryptProviderSecret } from "../utils/provider-secrets";

function parseArgs(argv: string[]) {
  const options: { model?: string; route?: string; write: boolean; dryRun: boolean } = { write: false, dryRun: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--model") options.model = argv[++index];
    else if (arg === "--route") options.route = argv[++index];
    else if (arg === "--write") options.write = true;
    else if (arg === "--dry-run") options.dryRun = true;
    else throw new Error(`unknown argument: ${arg}`);
  }
  return options;
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const { db, closeDb } = await import("../db/client");
  try {
    const version = await getCurrentVersion();
    if (!version) throw new Error("no control-plane version published yet");
    const snapshot = indexContent(version.version, version.contentSha256, version.content);
    const plans = planProbes(snapshot, { modelId: options.model, routeId: options.route });
    console.error(`[route-probe] version ${version.version}: ${plans.length} probes`);
    if (options.dryRun) {
      for (const plan of plans) console.log(`${plan.route.id}\t${plan.protocol}\t${plan.capability}`);
      return;
    }
    const keys = new Map<string, string>();
    const results: ProbeResult[] = [];
    for (const plan of plans) {
      const providerId = plan.account.secret_ref.replace(/^legacy_provider:/, "");
      if (!keys.has(providerId)) {
        const row = await db.queryOne<{ api_key: string | null }>("SELECT api_key FROM providers WHERE id = ?", [providerId]);
        keys.set(providerId, row?.api_key ? decryptProviderSecret(row.api_key) : "");
      }
      const result = await runProbe(plan, keys.get(providerId) || "");
      results.push(result);
      console.log(`${result.ok ? "ok  " : "FAIL"} ${result.routeId} ${result.protocol} ${result.capability} ${result.httpStatus ?? "-"} ${result.error ?? ""}`);
    }
    if (options.write) await storeProbeResults((sql, params) => db.execute(sql, params as any[]), results);
    const mismatches = probeMismatches(results);
    if (mismatches.length) {
      await notify({
        severity: "warning",
        kind: "route_probe_mismatch",
        title: `路由探测：${mismatches.length} 项与声明不一致`,
        body: mismatches.map((item) => `${item.routeId} ${item.protocol} ${item.capability}: ${item.error ?? "failed"}`).join("\n").slice(0, 3000),
        dedupeKey: `route_probe:${version.version}`,
      });
      process.exitCode = 2;
    }
  } finally {
    await closeDb();
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`[route-probe] ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
