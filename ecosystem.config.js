const fs = require("fs");
const dotenv = require("dotenv");
const legacyRoot = "/root/distiny/nexusflow";
const currentLink = process.env.NEXUSFLOW_CURRENT_LINK || "/root/distiny/nexusflow-current";
let root = process.env.NEXUSFLOW_APP_ROOT;

if (!root) {
  try {
    root = fs.realpathSync(currentLink);
  } catch (error) {
    if (error && error.code !== "ENOENT") {
      throw error;
    }
    root = legacyRoot;
  }
}

if (!fs.existsSync(`${root}/backend/dist/index.js`) || !fs.existsSync(`${root}/frontend/.next/BUILD_ID`)) {
  throw new Error(`NexusFlow release is incomplete: ${root}`);
}

const nextBinary = [
  `${root}/frontend/node_modules/next/dist/bin/next`,
  `${root}/node_modules/next/dist/bin/next`,
].find((candidate) => fs.existsSync(candidate));

if (!nextBinary) {
  throw new Error(`NexusFlow release has no Next.js runtime binary: ${root}`);
}

const backendRuntimeEnv = dotenv.parse(
  fs.readFileSync(`${root}/backend/.env`, "utf8")
);
const providerOutboundHostAllowlist =
  backendRuntimeEnv.PROVIDER_OUTBOUND_HOST_ALLOWLIST;
const providerOutboundEndpointAllowlist =
  backendRuntimeEnv.PROVIDER_OUTBOUND_ENDPOINT_ALLOWLIST;
if (!providerOutboundHostAllowlist) {
  throw new Error("NexusFlow production provider outbound allowlist is missing");
}
if (!providerOutboundEndpointAllowlist) {
  throw new Error("NexusFlow production provider outbound endpoint allowlist is missing");
}

module.exports = {
  apps: [
    {
      name: "quadrant-backend",
      cwd: `${root}/backend`,
      script: "dist/index.js",
      instances: 2,
      exec_mode: "cluster",
      autorestart: true,
      watch: false,
      max_memory_restart: "1G",
      env: {
        NODE_ENV: "production",
        NEXUSFLOW_RELEASE_RUNTIME: "true",
        ENABLE_MOCK_PAYMENT: "false",
        ENABLE_SEED_API_KEYS: "false",
        USE_PG_MEM: "false",
        PROVIDER_OUTBOUND_HOST_ALLOWLIST: providerOutboundHostAllowlist,
        PROVIDER_OUTBOUND_ENDPOINT_ALLOWLIST: providerOutboundEndpointAllowlist,
        PORT: process.env.BACKEND_PORT || 3001,
        BUILD_SHA: process.env.BUILD_SHA || "unknown",
        BUILD_TIME: process.env.BUILD_TIME || "unknown",
      },
    },
    {
      name: "quadrant-frontend",
      cwd: `${root}/frontend`,
      // npm workspaces may hoist Next to the repository root or keep it under
      // frontend/node_modules. Resolve the runtime binary from the artifact.
      script: nextBinary,
      args: `start -p ${process.env.FRONTEND_PORT || 19999} -H 127.0.0.1`,
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      watch: false,
      max_memory_restart: "1G",
      env: {
        NODE_ENV: "production",
        PORT: process.env.FRONTEND_PORT || 19999,
      },
    },
  ],
};
