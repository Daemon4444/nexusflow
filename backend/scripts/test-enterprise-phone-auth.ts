import assert from "node:assert/strict";
import express from "express";
import type { Server } from "node:http";
import authRouter from "../src/routes/auth";
import enterpriseRouter from "../src/routes/enterprise";
import { closeDb, db } from "../src/db/client";
import {
  addOrganizationMember,
  addProjectPrincipal,
  createOrganization,
  createOrganizationOffer,
  createOrganizationProject,
  getOrganizationAccess,
  listOrganizationMembers,
  listOrganizationOffers,
  listOrganizationProjects,
  listProjectPrincipals,
  listOrganizationsForUser,
  removeOrganizationMember,
  removeProjectPrincipal,
  updateOrganization,
  updateOrganizationMember,
  updateProjectPrincipal,
} from "../src/data/enterprise";

async function main() {
  const now = new Date().toISOString();
  await db.execute(
    `INSERT INTO users (id, email, nickname, balance, credit_balance, status, created_at, updated_at)
     VALUES (?, ?, ?, 0, 0, 'active', ?, ?)`,
    ["enterprise-member", "member@nexusflow.test", "企业成员", now, now]
  );

  const created = await createOrganization({
    ownerUserId: "local-user-1",
    name: "Nexus Test Labs",
    slug: "nexus-test-labs",
  });
  assert(!("error" in created));
  const organizationId = created.organization.id;
  assert.equal(created.organization.role, "owner");
  assert.equal((await listOrganizationsForUser("local-user-1")).length, 1);
  assert.equal(await getOrganizationAccess(organizationId, "enterprise-member"), null);

  const member = await addOrganizationMember({
    organizationId,
    actorUserId: "local-user-1",
    identity: "member@nexusflow.test",
    role: "developer",
  });
  assert("ok" in member);
  assert.equal((await listOrganizationMembers(organizationId)).length, 2);
  assert.equal((await getOrganizationAccess(organizationId, "enterprise-member"))?.role, "developer");

  const project = await createOrganizationProject({
    organizationId,
    actorUserId: "local-user-1",
    name: "生产 API",
    code: "production-api",
    environment: "production",
    monthlyBudget: 50000,
    modelScope: ["qwen-plus"],
    rpmLimit: 2000,
    tpmLimit: 100000,
  });
  assert(!("error" in project));
  assert.equal((await listOrganizationProjects(organizationId)).length, 1);
  const projectMember = await addProjectPrincipal({
    organizationId,
    projectId: project.project.id,
    actorUserId: "local-user-1",
    userId: "enterprise-member",
    principalType: "member",
    role: "developer",
  });
  assert("ok" in projectMember);
  assert.equal((await listProjectPrincipals(organizationId, project.project.id)).length, 2);
  assert("ok" in await updateProjectPrincipal({
    organizationId,
    projectId: project.project.id,
    userId: "enterprise-member",
    role: "viewer",
  }));
  assert.equal((await listProjectPrincipals(organizationId, project.project.id)).find((item) => item.userId === "enterprise-member")?.role, "viewer");
  assert("ok" in await removeProjectPrincipal({ organizationId, projectId: project.project.id, userId: "enterprise-member" }));
  assert.equal((await listProjectPrincipals(organizationId, project.project.id)).length, 1);
  assert("ok" in await addProjectPrincipal({
    organizationId,
    projectId: project.project.id,
    actorUserId: "local-user-1",
    userId: "enterprise-member",
    principalType: "member",
    role: "developer",
  }));
  assert("ok" in await updateOrganizationMember({ organizationId, userId: "enterprise-member", role: "admin" }));
  assert.equal((await getOrganizationAccess(organizationId, "enterprise-member"))?.role, "admin");
  assert("ok" in await updateOrganizationMember({ organizationId, userId: "enterprise-member", status: "suspended" }));
  assert.equal(await getOrganizationAccess(organizationId, "enterprise-member"), null);
  assert.equal((await listProjectPrincipals(organizationId, project.project.id)).length, 1);
  assert("ok" in await updateOrganizationMember({ organizationId, userId: "enterprise-member", role: "developer", status: "active" }));

  const ownerDemotion = await addOrganizationMember({
    organizationId,
    actorUserId: "enterprise-member",
    identity: "local-test@nexusflow.test",
    role: "viewer",
  });
  assert("error" in ownerDemotion);
  assert.equal((await getOrganizationAccess(organizationId, "local-user-1"))?.role, "owner");

  assert.equal(await updateOrganization(organizationId, {
    plan: "business",
    resellerEnabled: true,
  }), true);
  const offer = await createOrganizationOffer({
    organizationId,
    actorUserId: "local-user-1",
    name: "企业 API 标准版",
    publicSlug: "business-api-standard",
    markupPercent: 12.5,
  });
  assert("ok" in offer);
  const offers = await listOrganizationOffers(organizationId);
  assert.equal(offers.length, 1);
  assert.equal(offers[0].markupPercent, 12.5);
  assert("ok" in await removeOrganizationMember(organizationId, "enterprise-member"));
  assert.equal(await getOrganizationAccess(organizationId, "enterprise-member"), null);

  const app = express();
  app.use(express.json());
  app.use("/api/auth", authRouter);
  app.use("/api/enterprise", enterpriseRouter);
  const server: Server = await new Promise((resolve) => {
    const listening = app.listen(0, "127.0.0.1", () => resolve(listening));
  });
  const address = server.address();
  assert(address && typeof address === "object");
  const base = `http://127.0.0.1:${address.port}`;
  const phone = "13800138001";
  let deliveredCode = "";
  const originalLog = console.log;
  console.log = (...args: unknown[]) => {
    const line = args.map(String).join(" ");
    const match = line.match(/验证码:\s*(\d{6})/);
    if (match) deliveredCode = match[1];
  };
  try {
    const send = await fetch(`${base}/api/auth/send-sms-code`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone }),
    });
    const challenge = await send.json() as any;
    assert.equal(send.status, 200);
    assert.match(deliveredCode, /^\d{6}$/);
    assert.match(challenge.data.challengeToken, /^[a-f0-9]{48}$/);

    const login = await fetch(`${base}/api/auth/login-phone`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone, code: deliveredCode, challengeToken: challenge.data.challengeToken }),
    });
    const loginBody = await login.json() as any;
    assert.equal(login.status, 200);
    assert.equal(loginBody.data.user.phone, phone);
    assert.match(loginBody.data.token, /^sess-/);

    const replay = await fetch(`${base}/api/auth/login-phone`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone, code: deliveredCode, challengeToken: challenge.data.challengeToken }),
    });
    assert.equal(replay.status, 401, "consumed SMS challenge must not be replayable");
  } finally {
    console.log = originalLog;
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }

  console.log("enterprise and phone auth tests passed");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
