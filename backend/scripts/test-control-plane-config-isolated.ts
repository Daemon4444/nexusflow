import { spawn } from "node:child_process";
import path from "node:path";
import { RedisMemoryServer } from "redis-memory-server";

async function main(): Promise<void> {
  const redisServer = new RedisMemoryServer({
    binary: { version: "7.2.7" },
  });
  try {
    const child = spawn(
      process.execPath,
      [
        require.resolve("ts-node/dist/bin.js"),
        path.resolve(__dirname, "test-control-plane-config.ts"),
      ],
      {
        cwd: path.resolve(__dirname, ".."),
        env: {
          ...process.env,
          NODE_ENV: "test",
          USE_PG_MEM: "true",
          REDIS_HOST: await redisServer.getHost(),
          REDIS_PORT: String(await redisServer.getPort()),
          REDIS_PASSWORD: "",
        },
        stdio: "inherit",
      }
    );
    const code = await new Promise<number>((resolve, reject) => {
      child.once("error", reject);
      child.once("exit", (exitCode, signal) => {
        if (signal) reject(new Error(`control-plane config test terminated by ${signal}`));
        else resolve(exitCode ?? 1);
      });
    });
    if (code !== 0) {
      throw new Error(`control-plane config test exited with ${code}`);
    }
  } finally {
    await redisServer.stop();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
