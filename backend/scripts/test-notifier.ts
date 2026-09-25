import assert from "node:assert/strict";
import {
  createNotifierFromEnv,
  FeishuDirectMessageNotifier,
  LogNotifier,
  notify,
  setNotifier,
  type Notifier,
} from "../src/services/notifier";

async function main(): Promise<void> {
  // Default: log only.
  assert.equal(createNotifierFromEnv({}).channel, "log");
  assert.equal(createNotifierFromEnv({ NF_NOTIFIER: "webhook" }).channel, "log");
  assert.throws(() => createNotifierFromEnv({ NF_NOTIFIER: "feishu_dm" }), /app id/);

  const lines: string[] = [];
  setNotifier(new LogNotifier((line) => lines.push(line)));
  const first = await notify({
    severity: "warning",
    kind: "test",
    title: "t",
    body: "b",
    dedupeKey: "k1",
  });
  assert.deepEqual(first, { delivered: true, channel: "log" });
  const second = await notify({ severity: "warning", kind: "test", title: "t", body: "b", dedupeKey: "k1" });
  assert.equal(second.deduped, true);
  assert.equal(lines.length, 1);
  assert.equal(JSON.parse(lines[0]).kind, "test");

  // Feishu DM: token then one message per recipient, never a webhook URL.
  const calls: Array<{ url: string; body: any; auth?: string }> = [];
  const fetcher = async (url: string, init: RequestInit) => {
    const headers = init.headers as Record<string, string>;
    calls.push({ url, body: JSON.parse(String(init.body)), auth: headers.Authorization });
    const payload = url.includes("tenant_access_token")
      ? { code: 0, tenant_access_token: "t-123", expire: 7200 }
      : { code: 0 };
    return new Response(JSON.stringify(payload), { status: 200 });
  };
  const feishu = new FeishuDirectMessageNotifier({
    appId: "cli_x",
    appSecret: "secret",
    openIds: ["ou_a", "ou_b"],
    fetcher,
  });
  await feishu.send({ severity: "critical", kind: "backup_stale", title: "Backup", body: "old", dedupeKey: "x" });
  await feishu.send({ severity: "info", kind: "k", title: "again", body: "", dedupeKey: "y" });
  assert.equal(calls.filter((call) => call.url.includes("tenant_access_token")).length, 1, "token is cached");
  const messages = calls.filter((call) => call.url.includes("/im/v1/messages"));
  assert.equal(messages.length, 4);
  assert.ok(messages.every((call) => call.url.startsWith("https://open.feishu.cn/open-apis/im/v1/messages?receive_id_type=open_id")));
  assert.deepEqual(messages.slice(0, 2).map((call) => call.body.receive_id), ["ou_a", "ou_b"]);
  assert.equal(messages[0].auth, "Bearer t-123");
  assert.match(JSON.parse(messages[0].body.content).text, /^\[CRITICAL\] Backup/);
  assert.throws(
    () => new FeishuDirectMessageNotifier({ appId: "a", appSecret: "b", openIds: ["oc_group"], fetcher }),
    /open_ids/
  );

  // A failing channel never throws to the caller and falls back to the log.
  const failing: Notifier = {
    channel: "feishu_dm",
    async send() {
      throw new Error("boom");
    },
  };
  setNotifier(failing);
  const failed = await notify({ severity: "critical", kind: "x", title: "t", body: "b", dedupeKey: "k2" });
  assert.equal(failed.delivered, false);
  assert.equal(failed.error, "boom");
  setNotifier(null);
  console.log("notifier tests passed");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
