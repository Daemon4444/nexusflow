import fs from "fs";
import path from "path";

export interface BuildInfo {
  sha: string;
  builtAt: string;
}

const UNKNOWN = "unknown";
const FULL_GIT_SHA = /^[0-9a-f]{40}$/i;

function validSha(value: unknown): value is string {
  return typeof value === "string" && FULL_GIT_SHA.test(value);
}

function validBuildTime(value: unknown): value is string {
  return typeof value === "string" && value !== UNKNOWN && Number.isFinite(Date.parse(value));
}

function readBuildArtifact(): Partial<BuildInfo> {
  try {
    const artifactPath = path.resolve(__dirname, "../build-info.json");
    return JSON.parse(fs.readFileSync(artifactPath, "utf8")) as Partial<BuildInfo>;
  } catch {
    return {};
  }
}

export function getBuildInfo(): BuildInfo {
  const artifact = readBuildArtifact();
  return {
    // The artifact describes the code that was actually compiled. Environment
    // variables remain a compatibility fallback for older deployments.
    sha: validSha(artifact.sha)
      ? artifact.sha
      : validSha(process.env.BUILD_SHA)
        ? process.env.BUILD_SHA
        : UNKNOWN,
    builtAt: validBuildTime(artifact.builtAt)
      ? artifact.builtAt
      : validBuildTime(process.env.BUILD_TIME)
        ? process.env.BUILD_TIME
        : UNKNOWN,
  };
}
