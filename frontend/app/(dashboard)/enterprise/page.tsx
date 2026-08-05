"use client";

import {
  AppstoreOutlined,
  CheckCircleFilled,
  CloudServerOutlined,
  CodeOutlined,
  PlusOutlined,
  RobotOutlined,
  SearchOutlined,
  SettingOutlined,
  TeamOutlined,
  UserOutlined,
} from "@ant-design/icons";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import UserLayout from "@/components/UserLayout";
import { authHeaders } from "@/lib/auth";
import { fetchAPI } from "@/lib/api";

type Role = "owner" | "admin" | "billing" | "developer" | "viewer";
type Section = "overview" | "projects" | "access" | "usage" | "models" | "billing" | "commerce";

interface Organization {
  id: string; name: string; slug: string; status: string; plan: string; billingMode: string;
  resellerEnabled: boolean; role: Role; memberCount: number; offerCount: number;
}
interface Member { userId: string; nickname: string; email: string | null; phone: string | null; username: string | null; role: Role; status: string; createdAt: string; }
interface ServiceAccount { id: string; username: string | null; nickname: string; status: string; quotaLimit: number | null; quotaUsed: number; allowedModels: string[]; keyCount: number; lastActive: string | null; createdAt: string; }
interface Project { id: string; name: string; code: string; description: string; environment: "production" | "sandbox" | "customer"; status: string; monthlyBudget: number | null; modelScope: string[]; region: string; slaTier: string; rpmLimit: number; tpmLimit: number; principalCount: number; createdAt: string; }
interface Principal { userId: string; principalType: "member" | "service_account"; role: string; nickname: string; username: string | null; email: string | null; status: string; lastActive: string | null; createdAt: string; }
interface Offer { id: string; name: string; publicSlug: string; description: string; markupPercent: number; status: string; }
interface Detail { organization: Organization; members: Member[]; serviceAccounts: ServiceAccount[]; projects: Project[]; principals: Record<string, Principal[]>; offers: Offer[]; }

const roleNames: Record<string, string> = { owner: "所有者", admin: "管理员", billing: "财务", developer: "开发者", viewer: "只读", manager: "项目管理员" };
const sectionNames: Record<Section, string> = { overview: "概览", projects: "项目", access: "成员与身份", usage: "用量", models: "模型策略", billing: "账单", commerce: "商业化" };

type WorkspaceRequestOptions = Omit<RequestInit, "signal" | "headers"> & { signal?: AbortSignal; headers?: Record<string, string> };
async function request(path: string, options?: WorkspaceRequestOptions) {
  return fetchAPI(`/api/enterprise${path}`, { ...options, headers: { ...authHeaders(), ...(options?.headers || {}) } });
}

function sectionFromLocation(): Section {
  if (typeof window === "undefined") return "projects";
  const value = new URLSearchParams(window.location.search).get("section") as Section | null;
  return value && value in sectionNames ? value : "projects";
}

function money(value: number | null) {
  return value == null ? "未设置" : `¥${value.toLocaleString("zh-CN")}`;
}

function time(value: string | null) {
  if (!value) return "尚无调用";
  return new Intl.DateTimeFormat("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

function generatedPassword() {
  const alphabet = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789";
  const values = new Uint32Array(16);
  crypto.getRandomValues(values);
  return Array.from(values, (value) => alphabet[value % alphabet.length]).join("");
}

function CreateWorkspace({ onCreated }: { onCreated: (organization: Organization) => void }) {
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError("");
    const result = await request("/organizations", { method: "POST", body: JSON.stringify({ name, slug: slug || undefined }) });
    setBusy(false);
    if (!result.success) return setError(result.message || "创建失败");
    onCreated(result.data);
  }
  return <div className="workspace-onboarding">
    <div><span className="workspace-eyebrow">NEXUSFLOW FOR BUSINESS</span><h1>建立企业工作区</h1><p>把团队成员、服务账号、项目预算和模型策略放进同一个租户边界。</p></div>
    <form onSubmit={submit}><h2>创建工作区</h2><label>企业名称<input required minLength={2} value={name} onChange={(e) => setName(e.target.value)} placeholder="例如：Nexus Labs" /></label><label>工作区标识<input minLength={3} value={slug} onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))} placeholder="nexus-labs" /></label>{error && <p className="workspace-error">{error}</p>}<button disabled={busy}>{busy ? "创建中…" : "创建工作区"}</button></form>
  </div>;
}

function WorkspaceConsole({ detail, reload }: { detail: Detail; reload: () => Promise<void> }) {
  const { organization } = detail;
  const members = detail.members || [];
  const serviceAccounts = detail.serviceAccounts || [];
  const projects = useMemo(() => detail.projects || [], [detail.projects]);
  const principals = detail.principals || {};
  const offers = detail.offers || [];
  const [section, setSection] = useState<Section>(sectionFromLocation);
  const [selectedId, setSelectedId] = useState(projects[0]?.id || "");
  const [query, setQuery] = useState("");
  const [panel, setPanel] = useState<"" | "project" | "identity" | "policy" | "member" | "service" | "offer">("");
  const [principalTarget, setPrincipalTarget] = useState<Principal | null>(null);
  const [memberTarget, setMemberTarget] = useState<Member | null>(null);
  const [serviceTarget, setServiceTarget] = useState<ServiceAccount | null>(null);
  const [notice, setNotice] = useState("");
  const canManage = organization.role === "owner" || organization.role === "admin";
  const selected = projects.find((project) => project.id === selectedId) || projects[0];
  const selectedPrincipals = selected ? principals[selected.id] || [] : [];
  const filtered = projects.filter((project) => `${project.name} ${project.code}`.toLowerCase().includes(query.toLowerCase()));

  useEffect(() => {
    const handler = () => setSection(sectionFromLocation());
    window.addEventListener("popstate", handler);
    return () => window.removeEventListener("popstate", handler);
  }, []);

  function navigate(next: Section) {
    setSection(next);
    const url = new URL(window.location.href); url.searchParams.set("section", next); window.history.pushState({}, "", url); window.dispatchEvent(new PopStateEvent("popstate"));
  }
  async function mutate(path: string, body: Record<string, unknown>, method = "POST") {
    const result = await request(path, { method, body: JSON.stringify(body) });
    setNotice(result.success ? result.message || "已保存" : result.message || "操作失败");
    if (result.success) { setPanel(""); await reload(); }
    return result;
  }

  return <div className="workspace-page">
    <header className="workspace-header">
      <div><div className="workspace-crumb">工作区 / {organization.slug} / {sectionNames[section]}</div><h1>{section === "projects" ? "项目与成本中心" : sectionNames[section]}</h1><p>{section === "projects" ? "以项目为中心，管理成员、密钥、模型策略与预算。" : `管理 ${organization.name} 的${sectionNames[section]}。`}</p></div>
      <div className="workspace-switch"><span className="workspace-logo">{organization.name.slice(0, 1)}</span><div><strong>{organization.name}</strong><small>{organization.plan.toUpperCase()} · {roleNames[organization.role]}</small></div></div>
    </header>
    <nav className="workspace-mobile-nav">{(Object.keys(sectionNames) as Section[]).map((key) => <button className={section === key ? "active" : ""} key={key} onClick={() => navigate(key)}>{sectionNames[key]}</button>)}</nav>
    {notice && <div className="workspace-notice">{notice}<button onClick={() => setNotice("")}>关闭</button></div>}

    {section === "projects" && <>
      <div className="workspace-toolbar"><label><SearchOutlined /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="搜索项目" /></label><button onClick={() => setPanel("project")} disabled={!canManage}><PlusOutlined /> 新建项目</button></div>
      <div className="project-master-detail">
        <aside className="project-list"><div className="project-list-heading"><span>全部项目</span><strong>{projects.length}</strong></div>{filtered.map((project) => <button className={selected?.id === project.id ? "active" : ""} key={project.id} onClick={() => setSelectedId(project.id)}><span className={`project-env ${project.environment}`}><AppstoreOutlined /></span><span><strong>{project.name}</strong><small>{project.code} · {project.principalCount} 个身份</small></span><i>{project.status === "active" ? "运行中" : project.status}</i></button>)}{!filtered.length && <div className="workspace-empty-small">没有匹配的项目</div>}</aside>
        <main className="project-detail">{selected ? <>
          <div className="project-title"><div><span className={`project-env large ${selected.environment}`}><CloudServerOutlined /></span><div><h2>{selected.name}</h2><p>{selected.description || "尚未填写项目说明"}</p></div></div><button type="button" onClick={() => setPanel("policy")} disabled={!canManage}><SettingOutlined /> 编辑项目</button></div>
          <div className="project-meta"><span><b>项目代码</b><code>{selected.code}</code></span><span><b>环境</b>{selected.environment === "production" ? "生产" : selected.environment === "sandbox" ? "沙箱" : "客户"}</span><span><b>区域</b>{selected.region}</span><span><b>SLA</b>{selected.slaTier}</span></div>
          <section className="project-section"><div className="project-section-title"><div><h3>月度预算</h3><p>项目用量归集完成后会在这里展示实际消耗。</p></div><strong>{money(selected.monthlyBudget)}</strong></div><div className="budget-track"><span style={{ width: "0%" }} /></div><small>本周期暂未产生可归集用量</small></section>
          <section className="project-section"><div className="project-section-title"><div><h3>身份与密钥</h3><p>管理项目内的成员与服务账号，控制访问与密钥使用。</p></div><button type="button" onClick={() => setPanel("identity")} disabled={!canManage}><PlusOutlined /> 添加成员 / 服务账号</button></div><div className="identity-table"><div className="identity-row head"><span>名称</span><span>类型</span><span>角色 / 说明</span><span>访问范围</span><span>最近活跃</span><span>操作</span></div>{selectedPrincipals.map((principal) => <div className="identity-row" key={`${principal.principalType}-${principal.userId}`}><span><i className={principal.principalType === "member" ? "human" : "machine"}>{principal.principalType === "member" ? <UserOutlined /> : <RobotOutlined />}</i><b>{principal.nickname}<small>{principal.email || principal.username || "当前账号"}</small></b></span><span><em>{principal.principalType === "member" ? "成员" : "服务账号"}</em></span><span>{roleNames[principal.role] || principal.role}</span><span>{principal.role === "viewer" ? "只读" : "项目资源"}</span><span>{time(principal.lastActive || principal.createdAt)}</span><span>{principal.role === "owner" ? <small>所有者不可编辑</small> : <button type="button" className="workspace-row-action" disabled={!canManage} onClick={() => setPrincipalTarget(principal)}>编辑</button>}</span></div>)}{selectedPrincipals.length === 0 && <div className="workspace-empty-small">还没有项目身份</div>}</div></section>
          <section className="project-section"><div className="project-section-title"><div><h3>模型与限流策略</h3><p>策略只在当前项目边界内生效。</p></div></div><div className="policy-grid"><article><CodeOutlined /><span><b>模型范围</b><strong>{selected.modelScope.length ? `${selected.modelScope.length} 个指定模型` : "继承工作区全部模型"}</strong></span></article><article><CloudServerOutlined /><span><b>请求限制</b><strong>{selected.rpmLimit ? `${selected.rpmLimit.toLocaleString()} RPM` : "未限制 RPM"}</strong><small>{selected.tpmLimit ? `${selected.tpmLimit.toLocaleString()} TPM` : "未限制 TPM"}</small></span></article></div></section>
          <section className="project-section project-activity"><div className="project-section-title"><div><h3>最近活动</h3><p>来自项目配置与身份变更的真实记录。</p></div></div><div className="activity-row"><CheckCircleFilled /><span><strong>项目已创建</strong><small>{time(selected.createdAt)}</small></span></div>{selectedPrincipals.slice(0, 3).map((principal) => <div className="activity-row" key={principal.userId}><CheckCircleFilled /><span><strong>{principal.nickname} 已加入项目</strong><small>{time(principal.createdAt)}</small></span></div>)}</section>
        </> : <div className="project-zero"><AppstoreOutlined /><h2>创建第一个项目</h2><p>为不同环境或客户建立清晰的成本和权限边界。</p><button onClick={() => setPanel("project")}><PlusOutlined /> 新建项目</button></div>}</main>
      </div>
    </>}

    {section === "access" && <AccessView members={members} serviceAccounts={serviceAccounts} canManage={canManage} onPanel={setPanel} onMember={setMemberTarget} onService={setServiceTarget} />}
    {section === "overview" && <Overview organization={organization} projects={projects} members={members} serviceAccounts={serviceAccounts} offers={offers} navigate={navigate} />}
    {section === "commerce" && <Commerce organization={organization} offers={offers} canManage={canManage} onPanel={setPanel} mutate={mutate} />}
    {(section === "usage" || section === "models" || section === "billing") && <ComingSection section={section} projects={projects} />}
    {panel && <WorkspacePanel type={panel} close={() => setPanel("")} organization={organization} project={selected} members={members} serviceAccounts={serviceAccounts} principals={selectedPrincipals} mutate={mutate} reload={reload} />}
    {principalTarget && selected && <PrincipalManagementPanel organization={organization} project={selected} principal={principalTarget} close={() => setPrincipalTarget(null)} mutate={mutate} />}
    {memberTarget && <MemberManagementPanel organization={organization} member={memberTarget} close={() => setMemberTarget(null)} mutate={mutate} />}
    {serviceTarget && <ServiceManagementPanel account={serviceTarget} close={() => setServiceTarget(null)} reload={reload} notify={setNotice} />}
  </div>;
}

function Overview({ organization, projects, members, serviceAccounts, offers, navigate }: { organization: Organization; projects: Project[]; members: Member[]; serviceAccounts: ServiceAccount[]; offers: Offer[]; navigate: (section: Section) => void }) {
  const metrics = [["项目", projects.length, "projects"], ["成员", members.length, "access"], ["服务账号", serviceAccounts.length, "access"], ["售卖方案", offers.length, "commerce"]] as const;
  return <div className="workspace-overview"><div className="overview-metrics">{metrics.map(([label, value, target]) => <button key={label} onClick={() => navigate(target)}><span>{label}</span><strong>{value}</strong><small>查看管理 →</small></button>)}</div><section><span className="workspace-eyebrow">TENANT BOUNDARY</span><h2>{organization.name} 已统一为工作区</h2><p>成员是自然人身份，原“子账号”统一作为服务账号；二者都可按项目分配权限、预算和模型策略。</p></section></div>;
}

function AccessView({ members, serviceAccounts, canManage, onPanel, onMember, onService }: { members: Member[]; serviceAccounts: ServiceAccount[]; canManage: boolean; onPanel: (panel: "member" | "service") => void; onMember: (member: Member) => void; onService: (account: ServiceAccount) => void }) {
  const [tab, setTab] = useState<"members" | "service">(() => typeof window !== "undefined" && new URLSearchParams(window.location.search).get("tab") === "service" ? "service" : "members");
  return <div className="access-page"><div className="access-tabs"><button type="button" className={tab === "members" ? "active" : ""} onClick={() => setTab("members")}><TeamOutlined /> 成员 <span>{members.length}</span></button><button type="button" className={tab === "service" ? "active" : ""} onClick={() => setTab("service")}><RobotOutlined /> 服务账号 <span>{serviceAccounts.length}</span></button></div><div className="access-toolbar"><div><h2>{tab === "members" ? "成员" : "服务账号"}</h2><p>{tab === "members" ? "管理可登录控制台的自然人身份。" : "用于后端服务、自动化任务和客户应用的机器身份。"}</p></div><button type="button" disabled={!canManage} onClick={() => onPanel(tab === "members" ? "member" : "service")}><PlusOutlined /> {tab === "members" ? "添加成员" : "创建服务账号"}</button></div><div className="access-table"><div className="access-row head"><span>身份</span><span>角色 / 配额</span><span>状态</span><span>最近活动</span><span>操作</span></div>{tab === "members" ? members.map((item) => <div className="access-row" key={item.userId}><span><i className="human"><UserOutlined /></i><b>{item.nickname}<small>{item.email || item.phone || item.username}</small></b></span><span>{roleNames[item.role]}</span><span className={item.status === "active" ? "healthy" : ""}>{item.status === "active" ? "运行中" : item.status}</span><span>{time(item.createdAt)}</span><span>{item.role === "owner" ? <small>所有者</small> : <button type="button" className="workspace-row-action" disabled={!canManage} onClick={() => onMember(item)}>管理</button>}</span></div>) : serviceAccounts.map((item) => <div className="access-row" key={item.id}><span><i className="machine"><RobotOutlined /></i><b>{item.nickname}<small>{item.username}</small></b></span><span>{item.quotaLimit == null ? "共享工作区额度" : `${money(item.quotaLimit)} 配额`}</span><span className={item.status === "active" ? "healthy" : ""}>{item.status === "active" ? "运行中" : item.status}</span><span>{time(item.lastActive)}</span><span><button type="button" className="workspace-row-action" disabled={!canManage} onClick={() => onService(item)}>管理</button></span></div>)}</div></div>;
}

function Commerce({ organization, offers, canManage, onPanel, mutate }: { organization: Organization; offers: Offer[]; canManage: boolean; onPanel: (panel: "offer") => void; mutate: (path: string, body: Record<string, unknown>, method?: string) => Promise<unknown> }) {
  return <div className="commerce-page"><section className="commerce-banner"><div><span className="workspace-eyebrow">RESELLER CONTROL PLANE</span><h2>把模型能力包装成你的产品</h2><p>工作区负责内部治理，商业化模块负责对外报价、模型范围与客户交付。</p></div><button disabled={!canManage} onClick={() => void mutate(`/organizations/${organization.id}`, { resellerEnabled: !organization.resellerEnabled }, "PATCH")}>{organization.resellerEnabled ? "关闭转售" : "开启转售"}</button></section><div className="access-toolbar"><div><h2>售卖方案</h2><p>方案保持草稿状态，发布与客户账本将在下一阶段接入。</p></div><button disabled={!canManage || !organization.resellerEnabled} onClick={() => onPanel("offer")}><PlusOutlined /> 新建方案</button></div><div className="offer-grid">{offers.map((offer) => <article key={offer.id}><span>{offer.status}</span><h3>{offer.name}</h3><p>/{offer.publicSlug}</p><strong>基础价格 +{offer.markupPercent}%</strong></article>)}{offers.length === 0 && <div className="workspace-empty-small">暂无售卖方案</div>}</div></div>;
}

function ComingSection({ section, projects }: { section: "usage" | "models" | "billing"; projects: Project[] }) {
  const copy = { usage: ["用量归集", "项目维度的请求、Token 和成本将在调用链写入 project_id 后展示。"], models: ["模型策略", "每个项目已经具备模型范围与限流策略；这里将提供跨项目策略总览。"], billing: ["企业账单", "工作区共享余额、项目预算和未来客户账本将在这里统一对账。"] }[section];
  return <div className="coming-section"><CloudServerOutlined /><span className="workspace-eyebrow">CONTROL PLANE FOUNDATION</span><h2>{copy[0]}</h2><p>{copy[1]}</p><small>当前已有 {projects.length} 个项目可接入。</small></div>;
}

function PrincipalManagementPanel({ organization, project, principal, close, mutate }: { organization: Organization; project: Project; principal: Principal; close: () => void; mutate: (path: string, body: Record<string, unknown>, method?: string) => Promise<unknown> }) {
  const [role, setRole] = useState(principal.role);
  const [busy, setBusy] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const base = `/organizations/${organization.id}/projects/${project.id}/principals/${principal.userId}`;
  async function save(event: FormEvent) { event.preventDefault(); setBusy(true); await mutate(base, { role }, "PATCH"); setBusy(false); close(); }
  async function remove() { if (!confirmRemove) return setConfirmRemove(true); setBusy(true); await mutate(base, {}, "DELETE"); setBusy(false); close(); }
  return <DrawerFrame title="管理项目身份" close={close}><form onSubmit={save}><div className="drawer-identity-summary"><i className={principal.principalType === "member" ? "human" : "machine"}>{principal.principalType === "member" ? <UserOutlined /> : <RobotOutlined />}</i><div><strong>{principal.nickname}</strong><small>{principal.email || principal.username || principal.userId}</small></div></div><label>项目角色<select value={role} onChange={(event) => setRole(event.target.value)}><option value="manager">项目管理员</option><option value="developer">开发者</option><option value="viewer">只读</option></select></label><p className="drawer-help">这里只改变当前项目内的权限，不影响工作区其他项目。</p><footer><button type="button" className="danger" disabled={busy} onClick={remove}>{confirmRemove ? "再次确认移除" : "从项目移除"}</button><button disabled={busy}>{busy ? "处理中…" : "保存角色"}</button></footer></form></DrawerFrame>;
}

function MemberManagementPanel({ organization, member, close, mutate }: { organization: Organization; member: Member; close: () => void; mutate: (path: string, body: Record<string, unknown>, method?: string) => Promise<unknown> }) {
  const [role, setRole] = useState(member.role);
  const [status, setStatus] = useState(member.status);
  const [busy, setBusy] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const base = `/organizations/${organization.id}/members/${member.userId}`;
  async function save(event: FormEvent) { event.preventDefault(); setBusy(true); await mutate(base, { role, status }, "PATCH"); setBusy(false); close(); }
  async function remove() { if (!confirmRemove) return setConfirmRemove(true); setBusy(true); await mutate(base, {}, "DELETE"); setBusy(false); close(); }
  return <DrawerFrame title="管理成员" close={close}><form onSubmit={save}><div className="drawer-identity-summary"><i className="human"><UserOutlined /></i><div><strong>{member.nickname}</strong><small>{member.email || member.phone || member.username}</small></div></div><label>工作区角色<select value={role} onChange={(event) => setRole(event.target.value as Role)}><option value="admin">管理员</option><option value="billing">财务</option><option value="developer">开发者</option><option value="viewer">只读</option></select></label><label>成员状态<select value={status} onChange={(event) => setStatus(event.target.value)}><option value="active">运行中</option><option value="suspended">已停用</option></select></label><p className="drawer-help">停用或移除成员时，会同步撤销他在当前工作区各项目中的身份。</p><footer><button type="button" className="danger" disabled={busy} onClick={remove}>{confirmRemove ? "再次确认移出" : "移出工作区"}</button><button disabled={busy}>{busy ? "处理中…" : "保存成员配置"}</button></footer></form></DrawerFrame>;
}

function ServiceManagementPanel({ account, close, reload, notify }: { account: ServiceAccount; close: () => void; reload: () => Promise<void>; notify: (message: string) => void }) {
  const [nickname, setNickname] = useState(account.nickname);
  const [quota, setQuota] = useState(account.quotaLimit?.toString() || "");
  const [models, setModels] = useState(account.allowedModels.join(", "));
  const [busy, setBusy] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  async function call(path: string, options: WorkspaceRequestOptions) {
    const result = await fetchAPI(path, { ...options, headers: authHeaders() });
    notify(result.success ? result.message || "服务账号已更新" : result.message || "操作失败");
    if (result.success) await reload();
    return result;
  }
  async function save(event: FormEvent) { event.preventDefault(); setBusy(true); const result = await call(`/api/sub-accounts/${account.id}`, { method: "PATCH", body: JSON.stringify({ nickname, quotaLimit: quota ? Number(quota) : null, quotaPeriod: quota ? "monthly" : null, allowedModels: models.split(",").map((value) => value.trim()).filter(Boolean) }) }); setBusy(false); if (result.success) close(); }
  async function toggle() { setBusy(true); const result = await call(`/api/sub-accounts/${account.id}`, { method: "PATCH", body: JSON.stringify({ status: account.status === "active" ? "suspended" : "active" }) }); setBusy(false); if (result.success) close(); }
  async function resetPassword() { const password = generatedPassword(); setBusy(true); const result = await call(`/api/sub-accounts/${account.id}/reset-password`, { method: "POST", body: JSON.stringify({ password }) }); setBusy(false); if (result.success) setNewPassword(password); }
  async function remove() { if (!confirmDelete) return setConfirmDelete(true); setBusy(true); const result = await call(`/api/sub-accounts/${account.id}`, { method: "DELETE" }); setBusy(false); if (result.success) close(); }
  return <DrawerFrame title="管理服务账号" close={close}>{newPassword ? <div className="credential-once"><CheckCircleFilled /><h3>密码已重置</h3><p>新密码只显示一次，旧会话已经失效。</p><code>{account.username}</code><code>{newPassword}</code><button type="button" onClick={() => setNewPassword("")}>我已保存</button></div> : <form onSubmit={save}><div className="drawer-identity-summary"><i className="machine"><RobotOutlined /></i><div><strong>{account.nickname}</strong><small>{account.username}</small></div></div><label>显示名称<input type="text" value={nickname} onChange={(event) => setNickname(event.target.value)} /></label><label>月度配额<input type="number" min="0" value={quota} onChange={(event) => setQuota(event.target.value)} placeholder="留空则共享工作区额度" /></label><label>允许模型（逗号分隔）<textarea rows={4} value={models} onChange={(event) => setModels(event.target.value)} placeholder="留空时不可调用模型；后续将升级为策略选择器" /></label><div className="drawer-action-stack"><button type="button" disabled={busy} onClick={resetPassword}>重置登录密码</button><button type="button" disabled={busy} onClick={toggle}>{account.status === "active" ? "停用服务账号" : "重新启用服务账号"}</button><button type="button" className="danger" disabled={busy || account.status === "active"} onClick={remove}>{confirmDelete ? "再次确认删除" : "删除服务账号"}</button></div>{account.status === "active" && <p className="drawer-help">删除前必须先停用。历史调用、账单和审计记录不会被删除。</p>}<footer><button type="button" onClick={close}>取消</button><button disabled={busy}>{busy ? "处理中…" : "保存配置"}</button></footer></form>}</DrawerFrame>;
}

function DrawerFrame({ title, close, children }: { title: string; close: () => void; children: React.ReactNode }) {
  return <div className="workspace-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}><aside className="workspace-drawer"><header><div><span className="workspace-eyebrow">WORKSPACE CONTROL</span><h2>{title}</h2></div><button type="button" onClick={close}>关闭</button></header>{children}</aside></div>;
}

function WorkspacePanel({ type, close, organization, project, members, serviceAccounts, principals, mutate, reload }: { type: string; close: () => void; organization: Organization; project?: Project; members: Member[]; serviceAccounts: ServiceAccount[]; principals: Principal[]; mutate: (path: string, body: Record<string, unknown>, method?: string) => Promise<unknown>; reload: () => Promise<void> }) {
  const [form, setForm] = useState<Record<string, string>>({ name: project?.name || "", code: "", description: project?.description || "", environment: project?.environment || "production", monthlyBudget: project?.monthlyBudget?.toString() || "", modelScope: project?.modelScope.join(", ") || "", region: project?.region || "cn-beijing", slaTier: project?.slaTier || "standard", rpmLimit: project?.rpmLimit?.toString() || "", tpmLimit: project?.tpmLimit?.toString() || "", identity: "", principalType: "member", role: "developer", username: "", password: generatedPassword(), nickname: "", quotaLimit: "", publicSlug: "", markupPercent: "10" });
  const [busy, setBusy] = useState(false); const [credential, setCredential] = useState<{ username: string; password: string } | null>(null);
  const set = (key: string, value: string) => setForm((current) => ({ ...current, [key]: value }));
  const title = { project: "新建项目", identity: "添加项目身份", policy: "编辑项目", member: "添加成员", service: "创建服务账号", offer: "新建售卖方案" }[type] || "配置";
  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true);
    if (type === "project") await mutate(`/organizations/${organization.id}/projects`, { name: form.name, code: form.code || undefined, environment: form.environment, monthlyBudget: form.monthlyBudget ? Number(form.monthlyBudget) : null });
    if (type === "policy" && project) await mutate(`/organizations/${organization.id}/projects/${project.id}`, { name: form.name, description: form.description, environment: form.environment, monthlyBudget: form.monthlyBudget ? Number(form.monthlyBudget) : null, modelScope: form.modelScope.split(",").map((v) => v.trim()).filter(Boolean), region: form.region, slaTier: form.slaTier, rpmLimit: Number(form.rpmLimit || 0), tpmLimit: Number(form.tpmLimit || 0) }, "PATCH");
    if (type === "identity" && project) { const [principalType, userId] = form.identity.split(":"); await mutate(`/organizations/${organization.id}/projects/${project.id}/principals`, { principalType, userId, role: form.role }); }
    if (type === "member") await mutate(`/organizations/${organization.id}/members`, { identity: form.identity, role: form.role });
    if (type === "offer") await mutate(`/organizations/${organization.id}/offers`, { name: form.name, publicSlug: form.publicSlug, markupPercent: Number(form.markupPercent) });
    if (type === "service") {
      const result = await fetchAPI("/api/sub-accounts", { method: "POST", headers: authHeaders(), body: JSON.stringify({ username: form.username, password: form.password, nickname: form.nickname || undefined, quotaLimit: form.quotaLimit ? Number(form.quotaLimit) : null, quotaPeriod: form.quotaLimit ? "monthly" : null, allowedModels: [] }) });
      if (result.success) { setCredential({ username: form.username, password: form.password }); await reload(); }
    }
    setBusy(false);
  }
  const available = [...members.filter((m) => !principals.some((p) => p.userId === m.userId)).map((m) => ({ value: `member:${m.userId}`, label: `${m.nickname} · 成员` })), ...serviceAccounts.filter((a) => !principals.some((p) => p.userId === a.id)).map((a) => ({ value: `service_account:${a.id}`, label: `${a.nickname} · 服务账号` }))];
  return <div className="workspace-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}><aside className="workspace-drawer"><header><div><span className="workspace-eyebrow">WORKSPACE CONTROL</span><h2>{title}</h2></div><button type="button" onClick={close}>关闭</button></header>{credential ? <div className="credential-once"><CheckCircleFilled /><h3>服务账号已创建</h3><p>密码只显示一次，请立即保存。</p><code>{credential.username}</code><code>{credential.password}</code><button onClick={close}>我已保存</button></div> : <form onSubmit={submit}>
    {type === "project" && <><label>项目名称<input required minLength={2} value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="生产 API" /></label><label>项目代码<input value={form.code} onChange={(e) => set("code", e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))} placeholder="prod-api" /></label><label>环境<select value={form.environment} onChange={(e) => set("environment", e.target.value)}><option value="production">生产</option><option value="sandbox">沙箱</option><option value="customer">客户</option></select></label><label>月度预算<input type="number" min="0" value={form.monthlyBudget} onChange={(e) => set("monthlyBudget", e.target.value)} placeholder="50000" /></label></>}
    {type === "policy" && <><label>项目名称<input type="text" required minLength={2} value={form.name} onChange={(e) => set("name", e.target.value)} /></label><label>项目说明<textarea rows={3} value={form.description} onChange={(e) => set("description", e.target.value)} placeholder="描述用途、环境和责任团队" /></label><label>环境<select value={form.environment} onChange={(e) => set("environment", e.target.value)}><option value="production">生产</option><option value="sandbox">沙箱</option><option value="customer">客户</option></select></label><label>月度预算<input type="number" min="0" value={form.monthlyBudget} onChange={(e) => set("monthlyBudget", e.target.value)} /></label><label>模型范围（逗号分隔）<textarea rows={4} value={form.modelScope} onChange={(e) => set("modelScope", e.target.value)} placeholder="gpt-5, claude-sonnet" /></label><label>区域<input type="text" value={form.region} onChange={(e) => set("region", e.target.value)} /></label><label>SLA<select value={form.slaTier} onChange={(e) => set("slaTier", e.target.value)}><option value="standard">Standard</option><option value="business">Business</option><option value="premium">Premium</option></select></label><div className="drawer-two"><label>RPM<input type="number" min="0" value={form.rpmLimit} onChange={(e) => set("rpmLimit", e.target.value)} /></label><label>TPM<input type="number" min="0" value={form.tpmLimit} onChange={(e) => set("tpmLimit", e.target.value)} /></label></div></>}
    {type === "identity" && <><label>身份<select required value={form.identity} onChange={(e) => set("identity", e.target.value)}><option value="">选择成员或服务账号</option>{available.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label><label>项目角色<select value={form.role} onChange={(e) => set("role", e.target.value)}><option value="manager">项目管理员</option><option value="developer">开发者</option><option value="viewer">只读</option></select></label></>}
    {type === "member" && <><label>邮箱、手机号或用户名<input type="text" required value={form.identity} onChange={(e) => set("identity", e.target.value)} placeholder="name@company.com / 138..." /></label><label>工作区角色<select value={form.role} onChange={(e) => set("role", e.target.value)}><option value="admin">管理员</option><option value="billing">财务</option><option value="developer">开发者</option><option value="viewer">只读</option></select></label></>}
    {type === "service" && <><label>账号标识<input type="text" required minLength={3} value={form.username} onChange={(e) => set("username", e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ""))} placeholder="prod-api-bot" /></label><label>显示名称<input type="text" value={form.nickname} onChange={(e) => set("nickname", e.target.value)} placeholder="生产 API 服务账号" /></label><label>初始密码<input type="text" required value={form.password} onChange={(e) => set("password", e.target.value)} /></label><label>月度配额<input type="number" min="0" value={form.quotaLimit} onChange={(e) => set("quotaLimit", e.target.value)} placeholder="留空则共享工作区额度" /></label></>}
    {type === "offer" && <><label>方案名称<input required value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="企业 API 标准版" /></label><label>公开标识<input required value={form.publicSlug} onChange={(e) => set("publicSlug", e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))} placeholder="business-api" /></label><label>价格加价<input type="number" min="0" max="1000" value={form.markupPercent} onChange={(e) => set("markupPercent", e.target.value)} /></label></>}
    <footer><button type="button" onClick={close}>取消</button><button disabled={busy || (type === "identity" && !available.length)}>{busy ? "处理中…" : "确认保存"}</button></footer>
  </form>}</aside></div>;
}

export default function EnterprisePage() {
  const [organizations, setOrganizations] = useState<Organization[]>([]); const [selectedId, setSelectedId] = useState(""); const [detail, setDetail] = useState<Detail | null>(null); const [loading, setLoading] = useState(true); const [error, setError] = useState("");
  const selected = useMemo(() => selectedId || organizations[0]?.id || "", [selectedId, organizations]);
  const loadOrganizations = useCallback(async () => { const result = await request("/organizations"); if (!result.success) throw new Error(result.message || "工作区加载失败"); setOrganizations(result.data || []); return result.data as Organization[]; }, []);
  const loadDetail = useCallback(async (id: string) => { if (!id) return; const result = await request(`/organizations/${id}`); if (!result.success) throw new Error(result.message || "工作区详情加载失败"); setDetail(result.data); }, []);
  useEffect(() => { const timer = window.setTimeout(() => { void loadOrganizations().then((items) => items[0] && loadDetail(items[0].id)).catch((reason) => setError(reason.message)).finally(() => setLoading(false)); }, 0); return () => window.clearTimeout(timer); }, [loadOrganizations, loadDetail]);
  useEffect(() => { const timer = window.setTimeout(() => { if (selected && selected !== detail?.organization.id) void loadDetail(selected).catch((reason) => setError(reason.message)); }, 0); return () => window.clearTimeout(timer); }, [selected, detail, loadDetail]);
  async function reload() { const items = await loadOrganizations(); const id = selectedId || items[0]?.id; if (id) await loadDetail(id); }
  return <UserLayout wide>{loading ? <div className="workspace-state">正在加载工作区…</div> : error ? <div className="workspace-state error">{error}</div> : organizations.length === 0 ? <CreateWorkspace onCreated={(organization) => { setOrganizations([organization]); setSelectedId(organization.id); }} /> : detail ? <><select className="workspace-org-select" value={selected} onChange={(e) => setSelectedId(e.target.value)}>{organizations.map((organization) => <option key={organization.id} value={organization.id}>{organization.name}</option>)}</select><WorkspaceConsole detail={detail} reload={reload} /></> : <div className="workspace-state">正在读取工作区…</div>}</UserLayout>;
}
