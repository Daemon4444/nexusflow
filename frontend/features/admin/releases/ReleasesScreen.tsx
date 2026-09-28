"use client";

import { useMemo } from "react";
import { Input, Select, Table, Tag, Timeline, Tooltip } from "antd";
import type { ColumnsType, TablePaginationConfig } from "antd/es/table";
import { SearchOutlined } from "@ant-design/icons";
import { adminGet, appendQuery, extractItems } from "../client";
import type { Paginated, ReleaseRecord } from "../contracts";
import { AdminMetric, AdminPageHeader, AdminState, StatusTag, TruthBar } from "../shared/AdminUI";
import { displayDate, displayNumber } from "../shared/format";
import { asRecord, optionalText, pickValue, textValue } from "../shared/normalize";
import { positiveInt, useAdminQuery } from "../shared/useAdminQuery";
import { useAdminResource } from "../shared/useAdminResource";

function normalizeRelease(value: unknown): ReleaseRecord {
  const row = asRecord(value);
  const nodes = Array.isArray(row.nodes) ? row.nodes.map((value) => {
    const node = asRecord(value);
    return {
      id: textValue(pickValue(node, "id", "nodeId", "node_id"), "unknown"),
      status: textValue(node.status, "unknown"),
      sha: optionalText(node.sha),
      buildId: optionalText(pickValue(node, "buildId", "build_id")),
      health: optionalText(node.health),
    };
  }) : undefined;
  const sha = textValue(pickValue(row, "sha", "commitSha", "commit_sha"), "unknown");
  return {
    id: textValue(row.id, sha),
    sha,
    status: textValue(row.status, "unknown"),
    buildId: optionalText(pickValue(row, "buildId", "build_id")),
    environment: optionalText(row.environment),
    actor: optionalText(row.actor),
    startedAt: optionalText(pickValue(row, "startedAt", "started_at", "createdAt", "created_at")),
    completedAt: optionalText(pickValue(row, "completedAt", "completed_at")),
    nodes,
    notes: optionalText(row.notes),
    events: Array.isArray(row.events) ? row.events.map((value) => {
      const event = asRecord(value);
      return {
        type: textValue(pickValue(event, "event_type", "type"), "unknown"),
        at: optionalText(pickValue(event, "created_at", "at")),
        nodeId: optionalText(pickValue(event, "node_id", "nodeId")),
        message: optionalText(event.message),
      };
    }) : undefined,
    changes: row.changes && typeof row.changes === "object" ? row.changes as ReleaseRecord["changes"] : null,
  };
}

const EVENT_LABEL: Record<string, string> = {
  started: "开始发布",
  node_started: "节点开始切换",
  node_succeeded: "节点切换完成",
  node_failed: "节点切换失败",
  succeeded: "发布成功",
  failed: "发布失败",
  rollback_started: "开始回滚",
  rolled_back: "已回滚",
};

// Fixed sentences written by scripts/deploy-all-production.sh.
const RELEASE_MESSAGE_ZH: Array<[RegExp, string]> = [
  [/^Immutable artifact, backup, and migration gates passed; rollout started/, "发布包、备份和迁移检查全部通过，开始切换"],
  [/^Node rollout sequence started/, "节点开始切换（先摘流再激活）"],
  [/^Direct node verification passed/, "节点直连校验通过"],
  [/^Node activation or verification did not complete successfully/, "节点激活或校验未通过"],
  [/^Both immutable application nodes passed direct verification/, "两台节点直连校验均通过"],
  [/^Both nodes and the balanced public path passed/, "两台节点和公网入口均通过发布校验"],
  [/^Automatic rollback started/, "发布失败，开始自动回滚"],
  [/^Automatic rollback restored the previous verified release/, "已自动回滚到上一个版本"],
  [/^Automatic security recovery/, "回滚失败后的自动安全恢复"],
  [/^Compatibility transition before activating a legacy rollback baseline/, "回滚到旧版本前的兼容切换"],
  [/^Release attempt ended unsuccessfully/, "发布未成功结束，详情见发布日志"],
];

function translateReleaseMessage(message?: string | null): string | null {
  if (!message) return null;
  const override = /CI gate overridden: (.+)$/.exec(message);
  for (const [pattern, text] of RELEASE_MESSAGE_ZH) {
    if (pattern.test(message)) return override ? `${text}（跳过了 CI 检查：${override[1]}）` : text;
  }
  return message;
}

type ReleaseCommitView = NonNullable<ReleaseRecord["changes"]>["commits"][number];
type ChangeType = "feature" | "fix" | "improve" | "ops" | "docs" | "internal";

const TYPE_META: Record<ChangeType, { label: string; color: string }> = {
  feature: { label: "新功能", color: "green" },
  fix: { label: "修复", color: "red" },
  improve: { label: "改进", color: "blue" },
  ops: { label: "运维", color: "purple" },
  internal: { label: "内部", color: "default" },
  docs: { label: "文档", color: "default" },
};
const TYPE_ORDER: ChangeType[] = ["feature", "fix", "improve", "ops", "internal", "docs"];

const AUDIENCE_META: Record<string, { label: string; color: string }> = {
  customer: { label: "客户可见", color: "orange" },
  admin: { label: "仅后台", color: "cyan" },
  internal: { label: "仅内部", color: "default" },
};

function guessType(subject: string): ChangeType {
  const lower = subject.toLowerCase();
  if (/^docs?[:(]/.test(lower)) return "docs";
  if (/^(fix|hotfix)[:(]|^fix\b/.test(lower)) return "fix";
  if (/^(ops|ci|build|chore)[:(]/.test(lower)) return "ops";
  if (/^(test|refactor)[:(]/.test(lower)) return "internal";
  return "improve";
}

// "- a\n  continued\n- b" -> ["a continued", "b"]; plain paragraphs otherwise.
function bodyPoints(body: string): string[] {
  const lines = body.split("\n");
  const bullets: string[] = [];
  for (const line of lines) {
    const match = /^\s*[-*]\s+(.*)$/.exec(line);
    if (match) bullets.push(match[1].trim());
    else if (bullets.length && line.trim() && /^\s{2,}/.test(line)) bullets[bullets.length - 1] += ` ${line.trim()}`;
  }
  if (bullets.length) return bullets;
  return body.split(/\n{2,}/).map((part) => part.replace(/\s+/g, " ").trim()).filter(Boolean);
}

function commitView(commit: ReleaseCommitView) {
  const note = commit.note;
  return {
    type: (note?.type || guessType(commit.subject)) as ChangeType,
    audience: note?.audience || null,
    title: note?.title || commit.subject.replace(/^[a-z]+(\([^)]*\))?:\s*/i, ""),
    points: note?.points?.length ? note.points : bodyPoints(commit.body).slice(0, 4),
    translated: Boolean(note),
  };
}

function ChangeCard({ commit }: { commit: ReleaseCommitView }) {
  const view = commitView(commit);
  const technical = bodyPoints(commit.body);
  return (
    <div className="nf-admin-change-card">
      <div className="nf-admin-change-title">
        <strong>{view.title}</strong>
        {view.audience ? <Tag color={AUDIENCE_META[view.audience]?.color}>{AUDIENCE_META[view.audience]?.label}</Tag> : null}
      </div>
      {view.points.length ? (
        <ul className="nf-admin-change-points">
          {view.points.map((point, index) => <li key={index}>{point}</li>)}
        </ul>
      ) : null}
      <details className="nf-admin-change-tech">
        <summary>
          技术细节 · <code className="nf-admin-mono">{commit.sha.slice(0, 7)}</code> · {commit.author} · {displayDate(commit.date)}
        </summary>
        <div className="nf-admin-change-tech-body">
          <div className="nf-admin-mono">{commit.subject}</div>
          {technical.length ? <ul>{technical.map((point, index) => <li key={index}>{point}</li>)}</ul> : null}
        </div>
      </details>
    </div>
  );
}

function durationText(start?: string | null, end?: string | null): string {
  if (!start || !end) return "—";
  const seconds = Math.max(0, Math.round((Date.parse(end) - Date.parse(start)) / 1000));
  return seconds >= 60 ? `${Math.floor(seconds / 60)} 分 ${seconds % 60} 秒` : `${seconds} 秒`;
}

function ReleaseDetail({ row }: { row: ReleaseRecord }) {
  const changes = row.changes;
  const commits = changes?.available ? changes.commits : [];
  const groups = TYPE_ORDER
    .map((type) => ({ type, items: commits.filter((commit) => commitView(commit).type === type) }))
    .filter((group) => group.items.length);
  const customerFacing = commits.some((commit) => commit.note?.audience === "customer");
  const eventColor = (type: string) => type.includes("fail") ? "red" : type === "succeeded" || type === "node_succeeded" ? "green" : type.includes("roll") ? "orange" : "blue";

  return (
    <div className="nf-admin-release-detail">
      <div className="nf-admin-release-main">
        <div className="nf-admin-release-summary">
          <strong>本次变更</strong>
          {groups.map((group) => (
            <Tag key={group.type} color={TYPE_META[group.type].color}>{TYPE_META[group.type].label} {group.items.length}</Tag>
          ))}
          {commits.length ? (
            customerFacing
              ? <Tag color="orange">含客户可见变更</Tag>
              : <span className="nf-admin-muted-text">不影响客户</span>
          ) : null}
        </div>
        {!changes || !changes.available ? (
          <p className="nf-admin-muted-text">这次发布没有附带提交记录（早于变更记录功能，或构建时未生成）。</p>
        ) : commits.length === 0 ? (
          <p className="nf-admin-muted-text">和上一次发布是同一个版本（重新部署），没有新的代码变更。</p>
        ) : (
          groups.map((group) => (
            <section key={group.type} className="nf-admin-change-group">
              <h4><Tag color={TYPE_META[group.type].color}>{TYPE_META[group.type].label}</Tag></h4>
              {group.items.map((commit) => <ChangeCard key={commit.sha} commit={commit} />)}
            </section>
          ))
        )}
        {changes?.truncated ? (
          <p className="nf-admin-muted-text">
            {changes.baseSha ? "变更较多，只显示最近 50 项。" : "没有更早的发布记录可以对比，这里只显示该版本最近的提交。"}
          </p>
        ) : null}
      </div>
      <aside className="nf-admin-release-side">
        <h4>发布信息</h4>
        <dl className="nf-admin-release-facts">
          <dt>版本</dt><dd><code className="nf-admin-mono">{row.sha.slice(0, 12)}</code></dd>
          <dt>结果</dt><dd><StatusTag status={row.status} /></dd>
          <dt>开始</dt><dd>{displayDate(row.startedAt)}</dd>
          <dt>完成</dt><dd>{displayDate(row.completedAt)}</dd>
          <dt>耗时</dt><dd>{durationText(row.startedAt, row.completedAt)}</dd>
          <dt>发起人</dt><dd>{row.actor || "发布脚本"}</dd>
          <dt>运行节点</dt><dd>{row.nodes?.length ? row.nodes.map((node) => node.id).join("、") : "已被后续版本替换"}</dd>
        </dl>
        {row.events?.length ? (
          <>
            <h4>发布过程</h4>
            <Timeline
              className="nf-admin-release-timeline"
              items={row.events.map((event) => ({
                color: eventColor(event.type),
                content: (
                  <div>
                    <div>{EVENT_LABEL[event.type] || event.type}{event.nodeId ? `（${event.nodeId === "main" ? "主节点" : event.nodeId === "peer" ? "副节点" : event.nodeId}）` : ""}</div>
                    <div className="nf-admin-muted-text">
                      {displayDate(event.at)}
                      {translateReleaseMessage(event.message) ? ` · ${translateReleaseMessage(event.message)}` : ""}
                    </div>
                  </div>
                ),
              }))}
            />
          </>
        ) : null}
      </aside>
    </div>
  );
}

interface ReleasesEnvelope {
  generatedAt?: string;
  releases?: unknown[];
  nodes?: unknown[];
  incidents?: unknown[];
  truth?: Record<string, unknown>;
}

export default function ReleasesScreen() {
  const { searchParams, setQuery } = useAdminQuery();
  const q = searchParams.get("q") || "";
  const status = searchParams.get("status") || "all";
  const environment = searchParams.get("environment") || "all";
  const page = positiveInt(searchParams.get("page"), 1);
  const pageSize = positiveInt(searchParams.get("pageSize"), 20);

  const resource = useAdminResource(async (signal) => {
    const payload = await adminGet<ReleasesEnvelope | Paginated<unknown> | unknown[]>(
      appendQuery("/api/admin/releases", {
        q,
        status: status === "all" ? undefined : status,
        environment: environment === "all" ? undefined : environment,
        page,
        pageSize,
      }),
      signal
    );
    const envelope = asRecord(payload);
    const releaseRows = Array.isArray(envelope.releases)
      ? envelope.releases
      : payload as Paginated<unknown> | unknown[];
    const normalized = extractItems(releaseRows, page, pageSize);
    return {
      ...normalized,
      items: normalized.items.map(normalizeRelease),
      legacyArray: Array.isArray(releaseRows),
      generatedAt: optionalText(envelope.generatedAt),
      truth: asRecord(envelope.truth),
      nodeCount: Array.isArray(envelope.nodes) ? envelope.nodes.length : null,
      incidentCount: Array.isArray(envelope.incidents) ? envelope.incidents.length : null,
    };
  }, [q, status, environment, page, pageSize]);

  const items = useMemo(() => {
    const keyword = q.trim().toLowerCase();
    return (resource.data?.items || []).filter((item) => {
      const matchesQuery = !keyword || [item.id, item.sha, item.buildId, item.actor, item.notes]
        .some((value) => value?.toLowerCase().includes(keyword));
      return matchesQuery
        && (status === "all" || item.status === status)
        && (environment === "all" || item.environment === environment);
    });
  }, [environment, q, resource.data, status]);

  const environments = useMemo(
    () => [...new Set((resource.data?.items || []).map((item) => item.environment).filter((value): value is string => Boolean(value)))].sort(),
    [resource.data]
  );

  const columns: ColumnsType<ReleaseRecord> = [
    { title: "开始时间", dataIndex: "startedAt", width: 150, render: displayDate },
    {
      title: "版本",
      key: "release",
      width: 150,
      render: (_, row) => (
        <div>
          <Tooltip title={row.sha}><code className="nf-admin-table-primary nf-admin-mono">{row.sha.slice(0, 12)}</code></Tooltip>
          <div className="nf-admin-table-secondary">{row.buildId || row.id}</div>
        </div>
      ),
    },
    {
      title: "主要变更",
      key: "changes",
      render: (_, row) => {
        const commits = row.changes?.available ? row.changes.commits : null;
        if (!commits) return <span className="nf-admin-muted-text">未记录</span>;
        if (!commits.length) return <span className="nf-admin-muted-text">重新部署同一版本</span>;
        const views = commits.map(commitView);
        const types = TYPE_ORDER.filter((type) => views.some((view) => view.type === type));
        return (
          <div>
            <div className="nf-admin-table-primary nf-admin-ellipsis">{views[0].title}</div>
            <div className="nf-admin-change-types">
              {types.map((type) => (
                <Tag key={type} color={TYPE_META[type].color}>{TYPE_META[type].label} {views.filter((view) => view.type === type).length}</Tag>
              ))}
              {views.some((view) => view.audience === "customer") ? <Tag color="orange">客户可见</Tag> : null}
            </div>
          </div>
        );
      },
    },
    { title: "环境", dataIndex: "environment", width: 100, render: (value) => value || "unknown" },
    { title: "状态", dataIndex: "status", width: 80, render: (value) => <StatusTag status={value} /> },
    {
      title: "发起人",
      dataIndex: "actor",
      width: 100,
      render: (value) => value || <Tooltip title="由服务器上的发布脚本执行，没有关联后台账号"><span>发布脚本</span></Tooltip>,
    },
    { title: "完成时间", dataIndex: "completedAt", width: 150, render: displayDate },
    {
      title: <Tooltip title="现在还在运行这个版本的节点数；被后续版本替换后为 0"><span>当前运行节点</span></Tooltip>,
      dataIndex: "nodes",
      width: 110,
      align: "right",
      render: (nodes) => Array.isArray(nodes) ? (nodes.length ? displayNumber(nodes.length) : <span className="nf-admin-muted-text">已替换</span>) : "unknown",
    },
  ];


  const pagination: TablePaginationConfig = {
    current: resource.data?.pagination.page || page,
    pageSize: resource.data?.pagination.pageSize || pageSize,
    total: resource.data?.legacyArray ? items.length : resource.data?.pagination.total || items.length,
    showSizeChanger: true,
    showTotal: (total) => `共 ${total.toLocaleString("zh-CN")} 次发布`,
    onChange: (nextPage, nextPageSize) => setQuery({ page: nextPage, pageSize: nextPageSize }),
  };

  const successful = items.filter((item) => ["success", "succeeded", "completed"].includes(item.status)).length;
  const failed = items.filter((item) => item.status === "failed" || item.status === "error").length;
  const inProgress = items.filter((item) => ["started", "deploying", "running", "in_progress"].includes(item.status)).length;

  return (
    <>
      <AdminPageHeader
        eyebrow="Release evidence"
        title="发布中心"
        description="查看真实发布版本、构建标识、节点一致性和健康结果；没有发布事实时不推断部署状态。"
      />
      <div className="nf-admin-filterbar" role="search">
        <Input
          allowClear
          prefix={<SearchOutlined />}
          value={q}
          onChange={(event) => setQuery({ q: event.target.value, page: 1 })}
          placeholder="SHA、Build ID、发起人或说明"
          style={{ width: 330 }}
          aria-label="搜索发布记录"
        />
        <Select
          value={status}
          onChange={(value) => setQuery({ status: value, page: 1 })}
          style={{ width: 150 }}
          aria-label="发布状态"
          options={[
            { label: "全部状态", value: "all" },
            { label: "进行中", value: "started" },
            { label: "成功", value: "succeeded" },
            { label: "失败", value: "failed" },
            { label: "已回滚", value: "rolled_back" },
          ]}
        />
        <Select
          value={environment}
          onChange={(value) => setQuery({ environment: value, page: 1 })}
          style={{ width: 170 }}
          aria-label="发布环境"
          options={[{ label: "全部环境", value: "all" }, ...environments.map((value) => ({ label: value, value }))]}
        />
      </div>
      <AdminState
        loading={resource.loading}
        error={resource.error}
        empty={!resource.data}
        emptyText="发布事实数据不可用"
        onRetry={resource.reload}
      >
        <>
          <TruthBar truth={resource.data?.truth} generatedAt={resource.data?.generatedAt} />
          <div className="nf-admin-metric-grid">
            <AdminMetric label="当前筛选发布" value={displayNumber(items.length)} />
            <AdminMetric label="成功" value={displayNumber(successful)} />
            <AdminMetric label="进行中" value={displayNumber(inProgress)} />
            <AdminMetric label="失败" value={displayNumber(failed)} />
            <AdminMetric label="上报节点" value={displayNumber(resource.data?.nodeCount)} unknown={resource.data?.nodeCount == null} />
            <AdminMetric label="事故记录" value={displayNumber(resource.data?.incidentCount)} unknown={resource.data?.incidentCount == null} />
          </div>
          <Table
            className="nf-admin-table"
            rowKey="id"
            columns={columns}
            dataSource={items}
            pagination={pagination}
            scroll={{ x: 1100 }}
            locale={{ emptyText: "该筛选下没有真实发布记录" }}
            expandable={{
              expandedRowRender: (row) => <ReleaseDetail row={row} />,
              expandRowByClick: true,
            }}
          />
        </>
      </AdminState>
    </>
  );
}
