"use client";

import { useMemo } from "react";
import { Input, Select, Table, Tooltip } from "antd";
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
  rolled_back: "已回滚",
  rollback_started: "开始回滚",
};

function ReleaseDetail({ row }: { row: ReleaseRecord }) {
  const changes = row.changes;
  return (
    <div className="nf-admin-release-detail">
      <section>
        <h4>本次变更</h4>
        {!changes || !changes.available ? (
          <p className="nf-admin-muted-text">这次发布没有附带提交记录（早于变更记录功能，或构建时未生成）。</p>
        ) : changes.commits.length === 0 ? (
          <p className="nf-admin-muted-text">和上一次发布是同一个版本（重新部署），没有新的代码变更。</p>
        ) : (
          <>
            <ol className="nf-admin-commit-list">
              {changes.commits.map((commit) => (
                <li key={commit.sha}>
                  <div className="nf-admin-commit-head">
                    <strong>{commit.subject}</strong>
                    <span className="nf-admin-muted-text">
                      <code className="nf-admin-mono">{commit.sha.slice(0, 7)}</code> · {commit.author} · {displayDate(commit.date)}
                    </span>
                  </div>
                  {commit.body ? (
                    <details>
                      <summary>查看说明</summary>
                      <pre className="nf-admin-commit-body">{commit.body}</pre>
                    </details>
                  ) : null}
                </li>
              ))}
            </ol>
            {changes.truncated ? (
              <p className="nf-admin-muted-text">
                {changes.baseSha ? "变更较多，只显示最近 50 条。" : "没有更早的发布记录可以对比，这里只显示该版本最近的提交。"}
              </p>
            ) : null}
          </>
        )}
      </section>
      {row.notes ? (
        <section>
          <h4>发布说明</h4>
          <p>{row.notes}</p>
        </section>
      ) : null}
      {row.events?.length ? (
        <section>
          <h4>发布过程</h4>
          <ul className="nf-admin-event-list">
            {row.events.map((event, index) => (
              <li key={`${event.type}-${index}`}>
                <span className="nf-admin-muted-text">{displayDate(event.at)}</span>
                <span>{EVENT_LABEL[event.type] || event.type}{event.nodeId ? `（${event.nodeId}）` : ""}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {row.nodes?.length ? (
        <section>
          <h4>当前运行该版本的节点</h4>
          <ul className="nf-admin-event-list">
            {row.nodes.map((node) => (
              <li key={node.id}>
                <span>{node.id}</span>
                <span className="nf-admin-muted-text">状态 {node.status} · 依赖 {node.health || "unknown"}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
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
    { title: "开始时间", dataIndex: "startedAt", width: 170, render: displayDate },
    {
      title: "版本",
      key: "release",
      width: 200,
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
      width: 320,
      render: (_, row) => {
        const commits = row.changes?.available ? row.changes.commits : null;
        if (!commits) return <span className="nf-admin-muted-text">未记录</span>;
        if (!commits.length) return <span className="nf-admin-muted-text">重新部署同一版本</span>;
        return (
          <div>
            <div className="nf-admin-table-primary nf-admin-ellipsis">{commits[0].subject}</div>
            {commits.length > 1 ? <div className="nf-admin-table-secondary">另有 {commits.length - 1} 项变更，展开查看</div> : null}
          </div>
        );
      },
    },
    { title: "环境", dataIndex: "environment", width: 110, render: (value) => value || "unknown" },
    { title: "状态", dataIndex: "status", width: 110, render: (value) => <StatusTag status={value} /> },
    {
      title: "发起人",
      dataIndex: "actor",
      width: 130,
      render: (value) => value || <Tooltip title="由服务器上的发布脚本执行，没有关联后台账号"><span>发布脚本</span></Tooltip>,
    },
    { title: "完成时间", dataIndex: "completedAt", width: 170, render: displayDate },
    {
      title: <Tooltip title="现在还在运行这个版本的节点数；被后续版本替换后为 0"><span>当前运行节点</span></Tooltip>,
      dataIndex: "nodes",
      width: 120,
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
            scroll={{ x: 1200 }}
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
