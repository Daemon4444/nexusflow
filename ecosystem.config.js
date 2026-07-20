const root = "/root/distiny/nexusflow";

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
        PORT: process.env.BACKEND_PORT || 3001,
        BUILD_SHA: process.env.BUILD_SHA || "unknown",
        BUILD_TIME: process.env.BUILD_TIME || "unknown",
      },
    },
    {
      name: "quadrant-frontend",
      cwd: `${root}/frontend`,
      script: "node_modules/next/dist/bin/next",
      args: `start -p ${process.env.FRONTEND_PORT || 19999} -H 0.0.0.0`,
      instances: 1,
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
