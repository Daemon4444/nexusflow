const fs = require("fs");
const root = "/root/distiny/nexusflow";
const outboundProxyPath = "/etc/nexusflow/egress-proxy-url";

let outboundProxy;
try {
  outboundProxy = fs.readFileSync(outboundProxyPath, "utf8").trim() || undefined;
} catch (error) {
  if (error && error.code !== "ENOENT") {
    throw error;
  }
}

const noProxy = "localhost,127.0.0.1,::1,172.27.0.0/16,100.100.100.200";

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
      node_args: outboundProxy ? "--use-env-proxy" : undefined,
      env: {
        NODE_ENV: "production",
        PORT: process.env.BACKEND_PORT || 3001,
        BUILD_SHA: process.env.BUILD_SHA || "unknown",
        BUILD_TIME: process.env.BUILD_TIME || "unknown",
        ...(outboundProxy
          ? {
              HTTP_PROXY: outboundProxy,
              HTTPS_PROXY: outboundProxy,
              NO_PROXY: noProxy,
            }
          : {}),
      },
    },
    {
      name: "quadrant-frontend",
      cwd: `${root}/frontend`,
      // Use the workspace-local binary explicitly. npm may hoist Next to the
      // repository root or keep it under frontend/node_modules; production
      // must not depend on that incidental layout.
      script: `${root}/frontend/node_modules/next/dist/bin/next`,
      args: `start -p ${process.env.FRONTEND_PORT || 19999} -H 0.0.0.0`,
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
