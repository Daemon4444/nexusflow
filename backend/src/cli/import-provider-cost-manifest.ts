import fs from "node:fs";
import { closeDb } from "../db/client";
import {
  deactivateProviderCostBook,
  importProviderCostManifest,
} from "../services/provider-cost-import";

const MAX_MANIFEST_BYTES = 1_000_000;

function usage(): never {
  throw new Error(
    "Usage: import-provider-cost-manifest --manifest /private/file.json [--apply] "
    + "| --deactivate-price-book pb-<id> [--apply]"
  );
}

function parseArgs(argv: string[]): {
  manifestPath?: string;
  deactivatePriceBook?: string;
  apply: boolean;
} {
  let manifestPath: string | undefined;
  let deactivatePriceBook: string | undefined;
  let apply = false;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--apply") {
      apply = true;
    } else if (arg === "--manifest") {
      manifestPath = argv[++index];
    } else if (arg === "--deactivate-price-book") {
      deactivatePriceBook = argv[++index];
    } else {
      usage();
    }
  }
  if (!!manifestPath === !!deactivatePriceBook) usage();
  return { manifestPath, deactivatePriceBook, apply };
}

async function readPrivateManifest(path: string): Promise<unknown> {
  if (!path || !path.startsWith("/")) {
    throw new Error("manifest path must be absolute");
  }
  const noFollow = fs.constants.O_NOFOLLOW || 0;
  const handle = await fs.promises.open(path, fs.constants.O_RDONLY | noFollow);
  try {
    const stat = await handle.stat();
    if (!stat.isFile()) throw new Error("manifest must be a regular file");
    if (
      typeof process.geteuid === "function"
      && stat.uid !== process.geteuid()
    ) {
      throw new Error("manifest must be owned by the current release operator");
    }
    if ((stat.mode & 0o077) !== 0) {
      throw new Error("manifest permissions must be 0600 or stricter");
    }
    if (stat.size <= 0 || stat.size > MAX_MANIFEST_BYTES) {
      throw new Error("manifest size is invalid");
    }
    const raw = await handle.readFile({ encoding: "utf8" });
    try {
      return JSON.parse(raw);
    } catch {
      throw new Error("manifest is not valid JSON");
    }
  } finally {
    await handle.close();
  }
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const actorId = process.env.PROVIDER_COST_IMPORT_ACTOR_ID || null;
  if (args.manifestPath) {
    const manifest = await readPrivateManifest(args.manifestPath);
    const result = await importProviderCostManifest(manifest, {
      apply: args.apply,
      actorId,
    });
    console.log(JSON.stringify(result));
    return;
  }
  const result = await deactivateProviderCostBook(args.deactivatePriceBook!, {
    apply: args.apply,
    actorId,
    reason: process.env.PROVIDER_COST_ROLLBACK_REASON || "Release rollback",
  });
  console.log(JSON.stringify(result));
}

main()
  .catch((error) => {
    console.error(
      "[provider-cost-import] failed:",
      error instanceof Error ? error.message : "unknown error"
    );
    process.exitCode = 1;
  })
  .finally(() => closeDb());
