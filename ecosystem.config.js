const root = "/root/nexusflow";

module.exports = {
  apps: [
    {
      name: "quadrant-backend",
      cwd: `${root}/backend`,
      script: "/usr/bin/node",
      args: "dist/index.js",
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: "1G",
      env: {
        NODE_ENV: "production",
        PORT: 3001,
      },
    },
    {
      name: "quadrant-frontend",
      cwd: `${root}/frontend`,
      script: "node_modules/next/dist/bin/next",
      args: "start -p 19999 -H 0.0.0.0",
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: "1G",
      env: {
        NODE_ENV: "production",
        PORT: 19999,
      },
    },
  ],
};
