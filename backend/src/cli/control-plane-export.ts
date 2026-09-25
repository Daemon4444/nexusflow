/**
 * Daily YAML snapshot of the current control-plane version (P6, D3).
 *
 *   ts-node src/cli/control-plane-export.ts [--out config/snapshots] [--from-file <content.json>]
 *
 * Writes one file per entity (models, accounts, pools, routes, policies),
 * each a list sorted by id, plus version.yaml. Output is deterministic, so
 * unchanged configuration produces no file changes. Secrets are never part
 * of the content (accounts carry secret_ref only). Read-only on the
 * database. Cron template: ops/cron/nexusflow-cp-export.cron (install by
 * hand).
 */
import fs from "node:fs";
import path from "node:path";
import { controlPlaneContentSchema, normalizeContent, type ControlPlaneContent } from "../control-plane/schema";
import { toYaml } from "../control-plane/yaml";

const repositoryRoot = path.resolve(__dirname, "../../..");

export function renderSnapshot(content: ControlPlaneContent, meta: { version: number | null; sha256: string; publishedAt: string | null; publishedBy: string | null }): Record<string, string> {
  const normalized = normalizeContent(controlPlaneContentSchema.parse(content));
  return {
    "version.yaml": toYaml({ version: meta.version, content_sha256: meta.sha256, published_at: meta.publishedAt, published_by: meta.publishedBy, schema_version: 1 }),
    "models.yaml": toYaml(normalized.models),
    "accounts.yaml": toYaml(normalized.accounts),
    "pools.yaml": toYaml(normalized.pools),
    "routes.yaml": toYaml(normalized.routes),
    "policies.yaml": toYaml(normalized.policies),
  };
}

export function writeSnapshot(outDir: string, files: Record<string, string>): string[] {
  fs.mkdirSync(outDir, { recursive: true });
  const changed: string[] = [];
  for (const [name, text] of Object.entries(files)) {
    const file = path.join(outDir, name);
    const previous = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : null;
    if (previous === text) continue;
    fs.writeFileSync(file, text);
    changed.push(name);
  }
  return changed;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  let outDir = path.join(repositoryRoot, "config/snapshots");
  let fromFile: string | null = null;
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === "--out") outDir = path.resolve(args[++index]);
    else if (args[index] === "--from-file") fromFile = path.resolve(args[++index]);
    else throw new Error(`unknown argument: ${args[index]}`);
  }
  let files: Record<string, string>;
  if (fromFile) {
    const { contentSha256 } = await import("../control-plane/store");
    const content = JSON.parse(fs.readFileSync(fromFile, "utf8")) as ControlPlaneContent;
    files = renderSnapshot(content, { version: null, sha256: contentSha256(content), publishedAt: null, publishedBy: null });
  } else {
    const { getCurrentVersion } = await import("../control-plane/store");
    const { closeDb } = await import("../db/client");
    try {
      const current = await getCurrentVersion();
      if (!current) throw new Error("no control-plane version published yet");
      files = renderSnapshot(current.content, { version: current.version, sha256: current.contentSha256, publishedAt: current.publishedAt, publishedBy: current.publishedBy });
    } finally {
      await closeDb();
    }
  }
  const changed = writeSnapshot(outDir, files);
  console.error(`[cp-export] ${changed.length ? `updated ${changed.join(", ")}` : "no changes"} in ${outDir}`);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`[cp-export] ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
