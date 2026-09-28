// Tests scripts/write-release-history.mjs against a throwaway git repository.
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { parseGitLog } from "./write-release-history.mjs";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nf-release-history-"));
const git = (...args) => execFileSync("git", ["-C", dir, ...args], {
  encoding: "utf8",
  env: { ...process.env, GIT_AUTHOR_NAME: "Tester", GIT_AUTHOR_EMAIL: "t@example.com", GIT_COMMITTER_NAME: "Tester", GIT_COMMITTER_EMAIL: "t@example.com" },
}).trim();
git("init", "-q", "-b", "main");
const commit = (file, message) => {
  fs.writeFileSync(path.join(dir, file), file);
  git("add", file);
  git("commit", "-q", "-m", message);
  return git("rev-parse", "HEAD");
};
const first = commit("a.txt", "First commit");
const second = commit("b.txt", "Fix billing sign\n\nConsumption now shows as negative.\n\nCo-Authored-By: Bot <bot@example.com>");
const third = commit("c.txt", "Add provider buckets");

const out = path.join(dir, "out", "release-history.json");
const script = path.join(import.meta.dirname, "write-release-history.mjs");
const run = spawnSync(process.execPath, [script, "--sha", third, "--out", out, "--repo", dir], { encoding: "utf8" });
assert.equal(run.status, 0, run.stderr);
const history = JSON.parse(fs.readFileSync(out, "utf8"));
assert.equal(history.head, third);
assert.deepEqual(history.commits.map((c) => c.sha), [third, second, first]);
assert.equal(history.commits[1].subject, "Fix billing sign");
assert.equal(history.commits[1].body, "Consumption now shows as negative.", "trailers are removed");
assert.equal(history.commits[1].author, "Tester");

const bad = spawnSync(process.execPath, [script, "--sha", "abc", "--out", out, "--repo", dir], { encoding: "utf8" });
assert.equal(bad.status, 1);
assert.match(bad.stderr, /full 40-character/);

assert.deepEqual(parseGitLog("not-a-sha\u001fx\u001fy\u001fz\u001f\u001e"), []);

fs.rmSync(dir, { recursive: true, force: true });
console.log("release history tests passed");
