import fs from "node:fs";
import path from "node:path";

/**
 * Commit history embedded in the release artifact by
 * scripts/write-release-history.mjs (backend/release-history.json). Lets the
 * admin release centre list what each release changed without running git.
 */
export interface ReleaseCommit {
  sha: string;
  author: string;
  date: string;
  subject: string;
  body: string;
}

export interface ReleaseChanges {
  /** false when the history file is missing or does not contain this release. */
  available: boolean;
  baseSha: string | null;
  commits: ReleaseCommit[];
  /** true when the previous release is outside the embedded history window. */
  truncated: boolean;
}

const MAX_COMMITS_PER_RELEASE = 50;
const HISTORY_PATH = path.resolve(__dirname, "../../release-history.json");

let cache: { mtimeMs: number; commits: ReleaseCommit[] } | null = null;

export function loadReleaseHistory(file = HISTORY_PATH): ReleaseCommit[] {
  try {
    const stat = fs.statSync(file);
    if (cache && cache.mtimeMs === stat.mtimeMs) return cache.commits;
    const parsed = JSON.parse(fs.readFileSync(file, "utf8")) as { commits?: ReleaseCommit[] };
    const commits = Array.isArray(parsed.commits)
      ? parsed.commits.filter((item) => typeof item?.sha === "string" && /^[0-9a-f]{40}$/.test(item.sha))
      : [];
    cache = { mtimeMs: stat.mtimeMs, commits };
    return commits;
  } catch {
    return [];
  }
}

/**
 * Commits in `sha` that were not in `baseSha` (the previous successful
 * release), newest first. History is first-parent and newest first, so this
 * is the slice from `sha` down to (excluding) `baseSha`.
 */
export function changesBetween(history: ReleaseCommit[], sha: string | null, baseSha: string | null): ReleaseChanges {
  const start = sha ? history.findIndex((item) => item.sha === sha) : -1;
  if (start < 0) return { available: false, baseSha, commits: [], truncated: false };
  if (baseSha === sha) return { available: true, baseSha, commits: [], truncated: false };
  const end = baseSha ? history.findIndex((item) => item.sha === baseSha) : -1;
  if (end > start) {
    const slice = history.slice(start, end);
    return { available: true, baseSha, commits: slice.slice(0, MAX_COMMITS_PER_RELEASE), truncated: slice.length > MAX_COMMITS_PER_RELEASE };
  }
  // The previous release is unknown or older than the embedded window.
  return { available: true, baseSha, commits: history.slice(start, start + MAX_COMMITS_PER_RELEASE), truncated: true };
}
