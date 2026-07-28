import assert from "node:assert/strict";
import express from "express";
import type { Server } from "node:http";
import { closeDb, db } from "../src/db/client";
import {
  auditAdminWrite,
  setAdminAuditTestHooks,
} from "../src/middleware/admin-audit";

if (process.env.USE_PG_MEM !== "true") {
  throw new Error("test requires USE_PG_MEM=true");
}

const sessionToken = "sess-local-test";

async function main(): Promise<void> {
  process.env.ADMIN_EMAILS = "local-test@nexusflow.test";
  let mutations = 0;
  const app = express();
  app.use(express.json());
  app.post("/mutate", auditAdminWrite, (_req, res) => {
    mutations += 1;
    res.json({ success: true, data: { mutation: mutations } });
  });
  const server: Server = await new Promise((resolve) => {
    const listening = app.listen(0, "127.0.0.1", () => resolve(listening));
  });
  const address = server.address();
  assert(address && typeof address === "object");
  const url = `http://127.0.0.1:${address.port}/mutate`;

  const call = () => fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${sessionToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ reason: "audit intent test" }),
  });

  try {
    setAdminAuditTestHooks({
      beforeIntentInsert: () => {
        throw new Error("injected intent insert failure");
      },
    });
    const blocked = await call();
    assert.equal(blocked.status, 503);
    assert.equal(mutations, 0, "mutation must not run without a durable intent");

    setAdminAuditTestHooks({});
    const successful = await call();
    assert.equal(successful.status, 200);
    await new Promise((resolve) => setTimeout(resolve, 20));
    const successIntent = await db.queryOne<{ status: string; response_status: number }>(
      "SELECT status, response_status FROM admin_audit_intents ORDER BY created_at DESC LIMIT 1"
    );
    assert.equal(successIntent?.status, "success");
    assert.equal(Number(successIntent?.response_status), 200);

    setAdminAuditTestHooks({
      beforeIntentComplete: () => {
        throw new Error("injected completion failure");
      },
    });
    const completionUnknown = await call();
    assert.equal(completionUnknown.status, 200);
    await new Promise((resolve) => setTimeout(resolve, 20));
    const pending = await db.queryOne<{ status: string }>(
      "SELECT status FROM admin_audit_intents ORDER BY created_at DESC LIMIT 1"
    );
    assert.equal(pending?.status, "pending");
    assert.equal(mutations, 2);

    console.log("durable admin audit intent checks passed");
  } finally {
    setAdminAuditTestHooks({});
    await new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
  }
}

main()
  .then(async () => {
    await closeDb();
    process.exit(0);
  })
  .catch(async (error) => {
    console.error(error);
    await closeDb();
    process.exit(1);
  });
