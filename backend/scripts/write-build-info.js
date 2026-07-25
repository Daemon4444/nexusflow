const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const UNKNOWN = "unknown";
const FULL_GIT_SHA = /^[0-9a-f]{40}$/i;

function readGitSha() {
  try {
    const root = path.resolve(__dirname, "../..");
    const sha = execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    return FULL_GIT_SHA.test(sha) ? sha : UNKNOWN;
  } catch {
    return UNKNOWN;
  }
}

const envSha = (process.env.BUILD_SHA || "").trim();
const envTime = (process.env.BUILD_TIME || "").trim();
const buildInfo = {
  sha: FULL_GIT_SHA.test(envSha) ? envSha : readGitSha(),
  builtAt: envTime && envTime !== UNKNOWN ? envTime : new Date().toISOString(),
};

const outputPath = path.resolve(__dirname, "../dist/build-info.json");
const temporaryPath = `${outputPath}.${process.pid}.tmp`;
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(temporaryPath, `${JSON.stringify(buildInfo)}\n`, {
  encoding: "utf8",
  mode: 0o644,
});
fs.renameSync(temporaryPath, outputPath);

console.log(`[build-info] wrote ${buildInfo.sha === UNKNOWN ? UNKNOWN : buildInfo.sha.slice(0, 12)} at ${buildInfo.builtAt}`);
