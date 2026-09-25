/**
 * Runs the inference characterization test against a private, empty
 * redis-server on a random loopback port so rate-limit windows and managed
 * capacity state are deterministic. Extra arguments (e.g. --update) are
 * forwarded.
 */
import { spawn } from "node:child_process";
import path from "node:path";
import { RedisMemoryServer } from "redis-memory-server";

async function run(): Promise<void> {
  const redisServer = new RedisMemoryServer({ binary: { version: "7.2.7" } });
  try {
    const host = await redisServer.getHost();
    const port = await redisServer.getPort();
    const tsNodeBin = require.resolve("ts-node/dist/bin.js");
    const testScript = path.resolve(__dirname, "test-inference-characterization.ts");
    const exitCode = await new Promise<number>((resolve, reject) => {
      const child = spawn(process.execPath, [tsNodeBin, testScript, ...process.argv.slice(2)], {
        cwd: path.resolve(__dirname, ".."),
        env: {
          ...process.env,
          NODE_ENV: "test",
          REDIS_HOST: host,
          REDIS_PORT: String(port),
          REDIS_PASSWORD: "",
        },
        stdio: "inherit",
      });
      child.once("error", reject);
      child.once("exit", (code, signal) => {
        if (signal) {
          reject(new Error(`characterization test terminated by ${signal}`));
          return;
        }
        resolve(code ?? 1);
      });
    });
    if (exitCode !== 0) throw new Error(`characterization test exited with code ${exitCode}`);
  } finally {
    await redisServer.stop();
  }
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
