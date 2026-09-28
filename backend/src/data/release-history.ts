import fs from "node:fs";
import path from "node:path";

/**
 * Commit history embedded in the release artifact by
 * scripts/write-release-history.mjs (backend/release-history.json). Lets the
 * admin release centre list what each release changed without running git.
 */
export interface ReleaseNote {
  type: "feature" | "fix" | "improve" | "ops" | "docs" | "internal";
  audience: "customer" | "admin" | "internal";
  title: string;
  points: string[];
}

export interface ReleaseCommit {
  sha: string;
  author: string;
  date: string;
  subject: string;
  body: string;
  /** Curated Chinese note from config/release-notes.json, when present. */
  note?: ReleaseNote | null;
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
// Repository file shipped in the artifact (git archive): <root>/config/release-notes.json.
const NOTES_PATH = path.resolve(__dirname, "../../../config/release-notes.json");
const NOTE_TYPES = new Set(["feature", "fix", "improve", "ops", "docs", "internal"]);
const NOTE_AUDIENCES = new Set(["customer", "admin", "internal"]);

let notesCache: { mtimeMs: number; notes: Map<string, ReleaseNote> } | null = null;

export function parseReleaseNotes(raw: unknown): Map<string, ReleaseNote> {
  const notes = new Map<string, ReleaseNote>();
  const entries = raw && typeof raw === "object" ? (raw as { notes?: unknown }).notes : null;
  if (!entries || typeof entries !== "object") return notes;
  for (const [key, value] of Object.entries(entries as Record<string, unknown>)) {
    // Keys are a full commit SHA, or "subject:<commit subject>" for notes
    // written before a rebase-merge assigns the final SHA.
    const valid = /^[0-9a-f]{40}$/.test(key) || (key.startsWith("subject:") && key.length > 8);
    if (!valid || !value || typeof value !== "object") continue;
    const note = value as Record<string, unknown>;
    if (typeof note.title !== "string" || !note.title.trim()) continue;
    notes.set(key, {
      type: NOTE_TYPES.has(String(note.type)) ? note.type as ReleaseNote["type"] : "improve",
      audience: NOTE_AUDIENCES.has(String(note.audience)) ? note.audience as ReleaseNote["audience"] : "internal",
      title: note.title.trim(),
      points: Array.isArray(note.points) ? note.points.filter((item): item is string => typeof item === "string" && item.trim() !== "").slice(0, 10) : [],
    });
  }
  return notes;
}

export function loadReleaseNotes(file = NOTES_PATH): Map<string, ReleaseNote> {
  try {
    const stat = fs.statSync(file);
    if (notesCache && notesCache.mtimeMs === stat.mtimeMs) return notesCache.notes;
    const notes = parseReleaseNotes(JSON.parse(fs.readFileSync(file, "utf8")));
    notesCache = { mtimeMs: stat.mtimeMs, notes };
    return notes;
  } catch {
    return new Map();
  }
}

export function attachNotes(changes: ReleaseChanges, notes: Map<string, ReleaseNote>): ReleaseChanges {
  return {
    ...changes,
    commits: changes.commits.map((commit) => ({
      ...commit,
      note: notes.get(commit.sha) ?? notes.get(`subject:${commit.subject}`) ?? null,
    })),
  };
}

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
