import { Router, Request, Response } from "express";
import { z } from "zod";
import { validateSession, User } from "../data/users";
import {
  addOrganizationMember,
  createOrganization,
  createOrganizationOffer,
  createOrganizationProject,
  getOrganizationAccess,
  addProjectPrincipal,
  listOrganizationMembers,
  listOrganizationOffers,
  listOrganizationProjects,
  listOrganizationServiceAccounts,
  listProjectPrincipals,
  listOrganizationsForUser,
  updateOrganization,
  updateOrganizationMember,
  updateOrganizationProject,
  updateProjectPrincipal,
  removeOrganizationMember,
  removeProjectPrincipal,
  type OrganizationRole,
} from "../data/enterprise";

const router = Router();

async function requireUser(req: Request, res: Response): Promise<User | null> {
  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer ")) {
    res.status(401).json({ success: false, message: "未登录" });
    return null;
  }
  const user = await validateSession(auth.slice(7).trim());
  if (!user) {
    res.status(401).json({ success: false, message: "登录已过期，请重新登录" });
    return null;
  }
  return user;
}

async function requireOrganizationRole(
  req: Request,
  res: Response,
  roles?: OrganizationRole[]
): Promise<{ user: User; role: OrganizationRole } | null> {
  const user = await requireUser(req, res);
  if (!user) return null;
  const access = await getOrganizationAccess(String(req.params.id), user.id);
  if (!access || (roles && !roles.includes(access.role))) {
    res.status(403).json({ success: false, code: "organization_forbidden", message: "无权访问该企业" });
    return null;
  }
  return { user, role: access.role };
}

router.get("/organizations", async (req, res) => {
  const user = await requireUser(req, res);
  if (!user) return;
  res.json({ success: true, data: await listOrganizationsForUser(user.id) });
});

const CreateOrganizationSchema = z.object({
  name: z.string().min(2).max(80),
  slug: z.string().max(48).optional(),
  legalName: z.string().max(120).nullable().optional(),
});

router.post("/organizations", async (req, res) => {
  const user = await requireUser(req, res);
  if (!user) return;
  const parsed = CreateOrganizationSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, message: "企业信息格式不正确" });
    return;
  }
  const result = await createOrganization({ ownerUserId: user.id, ...parsed.data });
  if ("error" in result) {
    res.status(result.status || 400).json({ success: false, message: result.error });
    return;
  }
  res.status(201).json({ success: true, data: result.organization, message: "企业已创建" });
});

router.get("/organizations/:id", async (req, res) => {
  const access = await requireOrganizationRole(req, res);
  if (!access) return;
  const organization = (await listOrganizationsForUser(access.user.id)).find((item) => item.id === req.params.id);
  if (!organization) {
    res.status(404).json({ success: false, message: "企业不存在" });
    return;
  }
  const [members, serviceAccounts, projects, offers] = await Promise.all([
    listOrganizationMembers(organization.id),
    listOrganizationServiceAccounts(organization.id),
    listOrganizationProjects(organization.id),
    listOrganizationOffers(organization.id),
  ]);
  const principals = Object.fromEntries(await Promise.all(
    projects.map(async (project) => [project.id, await listProjectPrincipals(organization.id, project.id)] as const)
  ));
  res.json({ success: true, data: { organization, members, serviceAccounts, projects, principals, offers } });
});

const UpdateOrganizationSchema = z.object({
  name: z.string().min(2).max(80).optional(),
  legalName: z.string().max(120).nullable().optional(),
  plan: z.enum(["team", "business", "enterprise"]).optional(),
  billingMode: z.enum(["shared_balance", "invoiced"]).optional(),
  resellerEnabled: z.boolean().optional(),
  brandName: z.string().max(80).nullable().optional(),
  customDomain: z.string().max(253).nullable().optional(),
}).strict();

router.patch("/organizations/:id", async (req, res) => {
  const access = await requireOrganizationRole(req, res, ["owner", "admin"]);
  if (!access) return;
  const parsed = UpdateOrganizationSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, message: "企业配置格式不正确" });
    return;
  }
  const updated = await updateOrganization(String(req.params.id), parsed.data);
  res.json({ success: true, data: { updated }, message: "企业配置已保存" });
});

const AddMemberSchema = z.object({
  identity: z.string().min(3).max(254),
  role: z.enum(["admin", "billing", "developer", "viewer"]),
}).strict();

router.post("/organizations/:id/members", async (req, res) => {
  const access = await requireOrganizationRole(req, res, ["owner", "admin"]);
  if (!access) return;
  const parsed = AddMemberSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, message: "成员信息格式不正确" });
    return;
  }
  const result = await addOrganizationMember({
    organizationId: String(req.params.id),
    actorUserId: access.user.id,
    ...parsed.data,
  });
  if ("error" in result) {
    res.status(result.status).json({ success: false, message: result.error });
    return;
  }
  res.status(201).json({ success: true, message: "成员已加入企业" });
});

const UpdateMemberSchema = z.object({
  role: z.enum(["admin", "billing", "developer", "viewer"]).optional(),
  status: z.enum(["active", "suspended"]).optional(),
}).strict().refine((value) => value.role !== undefined || value.status !== undefined);

router.patch("/organizations/:id/members/:userId", async (req, res) => {
  const access = await requireOrganizationRole(req, res, ["owner", "admin"]);
  if (!access) return;
  const parsed = UpdateMemberSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, message: "成员配置格式不正确" });
    return;
  }
  const result = await updateOrganizationMember({
    organizationId: String(req.params.id),
    userId: String(req.params.userId),
    ...parsed.data,
  });
  if ("error" in result) {
    res.status(result.status).json({ success: false, message: result.error });
    return;
  }
  res.json({ success: true, message: "成员配置已保存" });
});

router.delete("/organizations/:id/members/:userId", async (req, res) => {
  const access = await requireOrganizationRole(req, res, ["owner", "admin"]);
  if (!access) return;
  const result = await removeOrganizationMember(String(req.params.id), String(req.params.userId));
  if ("error" in result) {
    res.status(result.status).json({ success: false, message: result.error });
    return;
  }
  res.json({ success: true, message: "成员已移出工作区" });
});

const ProjectSchema = z.object({
  name: z.string().min(2).max(80),
  code: z.string().min(3).max(40).optional(),
  description: z.string().max(300).optional(),
  environment: z.enum(["production", "sandbox", "customer"]).optional(),
  monthlyBudget: z.number().min(0).nullable().optional(),
  modelScope: z.array(z.string().max(160)).max(200).optional(),
  region: z.string().min(2).max(80).optional(),
  slaTier: z.enum(["standard", "business", "premium"]).optional(),
  rpmLimit: z.number().int().min(0).max(10_000_000).optional(),
  tpmLimit: z.number().int().min(0).max(10_000_000_000).optional(),
}).strict();

router.post("/organizations/:id/projects", async (req, res) => {
  const access = await requireOrganizationRole(req, res, ["owner", "admin"]);
  if (!access) return;
  const parsed = ProjectSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, message: "项目配置格式不正确" });
    return;
  }
  const result = await createOrganizationProject({
    organizationId: String(req.params.id),
    actorUserId: access.user.id,
    ...parsed.data,
  });
  if ("error" in result) {
    res.status(result.status).json({ success: false, message: result.error });
    return;
  }
  res.status(201).json({ success: true, data: result.project, message: "项目已创建" });
});

const ProjectPatchSchema = ProjectSchema.omit({ code: true }).partial();

router.patch("/organizations/:id/projects/:projectId", async (req, res) => {
  const access = await requireOrganizationRole(req, res, ["owner", "admin"]);
  if (!access) return;
  const parsed = ProjectPatchSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, message: "项目配置格式不正确" });
    return;
  }
  const updated = await updateOrganizationProject(
    String(req.params.id),
    String(req.params.projectId),
    parsed.data
  );
  if (!updated) {
    res.status(404).json({ success: false, message: "项目不存在或没有变更" });
    return;
  }
  res.json({ success: true, message: "项目策略已保存" });
});

const ProjectPrincipalSchema = z.object({
  userId: z.string().min(1).max(80),
  principalType: z.enum(["member", "service_account"]),
  role: z.enum(["manager", "developer", "viewer"]),
}).strict();

router.post("/organizations/:id/projects/:projectId/principals", async (req, res) => {
  const access = await requireOrganizationRole(req, res, ["owner", "admin"]);
  if (!access) return;
  const parsed = ProjectPrincipalSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, message: "项目身份配置格式不正确" });
    return;
  }
  const result = await addProjectPrincipal({
    organizationId: String(req.params.id),
    projectId: String(req.params.projectId),
    actorUserId: access.user.id,
    ...parsed.data,
  });
  if ("error" in result) {
    res.status(result.status).json({ success: false, message: result.error });
    return;
  }
  res.status(201).json({ success: true, message: "身份已加入项目" });
});

const UpdateProjectPrincipalSchema = z.object({
  role: z.enum(["manager", "developer", "viewer"]),
}).strict();

router.patch("/organizations/:id/projects/:projectId/principals/:userId", async (req, res) => {
  const access = await requireOrganizationRole(req, res, ["owner", "admin"]);
  if (!access) return;
  const parsed = UpdateProjectPrincipalSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, message: "项目角色格式不正确" });
    return;
  }
  const result = await updateProjectPrincipal({
    organizationId: String(req.params.id),
    projectId: String(req.params.projectId),
    userId: String(req.params.userId),
    role: parsed.data.role,
  });
  if ("error" in result) {
    res.status(result.status).json({ success: false, message: result.error });
    return;
  }
  res.json({ success: true, message: "项目角色已更新" });
});

router.delete("/organizations/:id/projects/:projectId/principals/:userId", async (req, res) => {
  const access = await requireOrganizationRole(req, res, ["owner", "admin"]);
  if (!access) return;
  const result = await removeProjectPrincipal({
    organizationId: String(req.params.id),
    projectId: String(req.params.projectId),
    userId: String(req.params.userId),
  });
  if ("error" in result) {
    res.status(result.status).json({ success: false, message: result.error });
    return;
  }
  res.json({ success: true, message: "身份已从项目移除" });
});

const CreateOfferSchema = z.object({
  name: z.string().min(2).max(80),
  publicSlug: z.string().min(3).max(48),
  description: z.string().max(500).optional(),
  markupPercent: z.number().min(0).max(1000).optional(),
  modelScope: z.array(z.string().max(160)).max(200).optional(),
}).strict();

router.post("/organizations/:id/offers", async (req, res) => {
  const access = await requireOrganizationRole(req, res, ["owner", "admin"]);
  if (!access) return;
  const parsed = CreateOfferSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, message: "售卖方案格式不正确" });
    return;
  }
  const organizations = await listOrganizationsForUser(access.user.id);
  const organization = organizations.find((item) => item.id === req.params.id);
  if (!organization?.resellerEnabled) {
    res.status(409).json({ success: false, code: "reseller_not_enabled", message: "请先开启企业转售能力" });
    return;
  }
  const result = await createOrganizationOffer({
    organizationId: String(req.params.id),
    actorUserId: access.user.id,
    ...parsed.data,
  });
  if ("error" in result) {
    res.status(result.status || 400).json({ success: false, message: result.error });
    return;
  }
  res.status(201).json({ success: true, message: "售卖方案草稿已创建" });
});

export default router;
