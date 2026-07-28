import assert from "node:assert/strict";
import { isDemoAdminSession } from "../src/middleware/demo-admin";
import { buildDemoAdminOverview } from "../src/routes/demo-admin";

process.env.DEMO_ADMIN_EMAILS = " demo.one@example.com,DEMO.TWO@EXAMPLE.COM ";

assert.equal(isDemoAdminSession({ email: "demo.one@example.com" }), true);
assert.equal(isDemoAdminSession({ email: "demo.two@example.com" }), true);
assert.equal(isDemoAdminSession({ email: "other@example.com" }), false);
assert.equal(isDemoAdminSession({ email: null }), false);

const overview = buildDemoAdminOverview(new Date("2026-07-28T12:00:00.000Z"));
assert.equal(overview.isDemoData, true);
assert.equal(overview.generatedAt, "2026-07-28T12:00:00.000Z");
assert.ok(overview.metrics.length >= 4);
assert.ok(overview.models.length >= 4);
assert.ok(overview.users.every((user) => user.account.endsWith(".invalid")));
assert.ok(!JSON.stringify(overview).includes("@qq.com"));
assert.ok(!JSON.stringify(overview).includes("@outlook.com"));

console.log("demo admin isolation checks passed");
