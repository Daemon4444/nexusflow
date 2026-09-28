#!/usr/bin/env node
// Writes the recent first-parent commit history of a release into the
// artifact (backend/release-history.json) so the admin release centre can show
// what each release changed without running git at runtime.
//
//   node scripts/write-release-history.mjs --sha <full-sha> --out <file> [--repo <dir>] [--limit 300]
//
// Only commit metadata and messages are written: sha, author name, date,
// subject and body (trailers such as Co-Authored-By removed). No diffs.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const FIELD = "\u001f";
const RECORD = "\u001e";
const TRAILER = /^(co-authored-by|signed-off-by|reviewed-by|change-id):/i;
const MAX_BODY = 4000;

export function parseGitLog(raw) {
  return raw
    .split(RECORD)
    .map((record) => record.replace(/^\n+/, ""))
    .filter((record) => record.trim())
    .map((record) => {
      const [sha, author, date, subject, body = ""] = record.split(FIELD);
      const cleanBody = body
        .split("\n")
        .filter((line) => !TRAILER.test(line.trim()))
        .join("\n")
        .trim()
        .slice(0, MAX_BODY);
      return { sha: sha.trim(), author: author.trim(), date: date.trim(), subject: subject.trim(), body: cleanBody };
    })
    .filter((commit) => /^[0-9a-f]{40}$/.test(commit.sha));
}

export function readHistory({ repo, sha, limit }) {
  if (!/^[0-9a-f]{40}$/.test(sha)) throw new Error("--sha must be a full 40-character commit SHA");
  const raw = execFileSync(
    "git",
    ["-C", repo, "log", "--first-parent", `-n${limit}`, `--format=%H${FIELD}%an${FIELD}%aI${FIELD}%s${FIELD}%b${RECORD}`, sha],
    { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 }
  );
  return { schemaVersion: 1, head: sha, commits: parseGitLog(raw) };
}

function main() {
  const args = process.argv.slice(2);
  const value = (name, fallback) => {
    const index = args.indexOf(name);
    return index >= 0 ? args[index + 1] : fallback;
  };
  const sha = value("--sha");
  const out = value("--out");
  const repo = value("--repo", process.cwd());
  const limit = Number(value("--limit", "300"));
  if (!sha || !out) throw new Error("usage: write-release-history.mjs --sha <sha> --out <file> [--repo <dir>] [--limit 300]");
  if (!Number.isInteger(limit) || limit < 1 || limit > 2000) throw new Error("--limit must be 1..2000");
  const history = readHistory({ repo, sha, limit });
  if (history.commits[0]?.sha !== sha) throw new Error("history does not start at the release SHA");
  fs.mkdirSync(path.dirname(out), { recursive: true });
  const temporary = `${out}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(history)}\n`, { mode: 0o644 });
  fs.renameSync(temporary, out);
  console.log(`[release-history] wrote ${history.commits.length} commits for ${sha.slice(0, 12)}`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  try {
    main();
  } catch (error) {
    console.error(`[release-history] ${error.message}`);
    process.exitCode = 1;
  }
}
