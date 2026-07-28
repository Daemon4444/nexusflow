import { spawn } from "node:child_process";
import path from "node:path";
import { RedisMemoryServer } from "redis-memory-server";

async function run(): Promise<void> {
  const redisServer = new RedisMemoryServer({
    binary: { version: "7.2.7" },
  });
  try {
    const host = await redisServer.getHost();
    const port = await redisServer.getPort();
    const exitCode = await new Promise<number>((resolve, reject) => {
      const child = spawn(
        process.execPath,
        [
          require.resolve("ts-node/dist/bin.js"),
          path.resolve(__dirname, "test-auth-login-rate-limit.ts"),
        ],
        {
          cwd: path.resolve(__dirname, ".."),
          env: {
            ...process.env,
            NODE_ENV: "test",
            USE_PG_MEM: "true",
            REDIS_HOST: host,
            REDIS_PORT: String(port),
            REDIS_PASSWORD: "",
            LOGIN_IP_CONCURRENCY: "2",
            LOGIN_GLOBAL_CONCURRENCY: "16",
            VERIFICATION_EMAIL_IP_PER_MINUTE: "5",
            VERIFICATION_EMAIL_GLOBAL_PER_MINUTE: "50",
            VERIFICATION_LOGIN_SOURCE_MAX_ATTEMPTS: "3",
            VERIFICATION_LOGIN_CHALLENGE_MAX_ATTEMPTS: "10",
            VERIFICATION_LOGIN_RECIPIENT_MAX_ATTEMPTS: "4",
            VERIFICATION_LOGIN_IP_MAX_ATTEMPTS: "20",
            VERIFICATION_LOGIN_GLOBAL_MAX_ATTEMPTS: "1000",
          },
          stdio: "inherit",
        }
      );
      child.once("error", reject);
      child.once("exit", (code, signal) => {
        if (signal) {
          reject(new Error(`auth rate-limit test terminated by ${signal}`));
          return;
        }
        resolve(code ?? 1);
      });
    });
    if (exitCode !== 0) throw new Error(`auth rate-limit test exited with code ${exitCode}`);
  } finally {
    await redisServer.stop();
  }
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
