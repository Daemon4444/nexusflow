"use client";

import { Table, Tag } from "antd";
import type { ColumnsType } from "antd/es/table";
import { adminGet } from "../client";
import { AdminPageHeader, AdminState, StatusTag } from "../shared/AdminUI";
import { displayDate, displayNumber } from "../shared/format";
import { useAdminResource } from "../shared/useAdminResource";

interface AdminOrganization {
  id: string;
  name: string;
  slug: string;
  owner: string;
  ownerUserId: string;
  status: string;
  plan: string;
  billingMode: string;
  resellerEnabled: boolean;
  memberCount: number;
  offerCount: number;
  createdAt: string;
}

export default function OrganizationsScreen() {
  const resource = useAdminResource<AdminOrganization[]>(
    (signal) => adminGet<AdminOrganization[]>("/api/admin/organizations", signal),
    []
  );
  const columns: ColumnsType<AdminOrganization> = [
    { title: "企业", key: "organization", width: 240, render: (_, row) => <div><div className="nf-admin-table-primary">{row.name}</div><div className="nf-admin-table-secondary">{row.slug} · {row.id.slice(0, 8)}</div></div> },
    { title: "所有者", dataIndex: "owner", width: 220 },
    { title: "计划", dataIndex: "plan", width: 110, render: (value) => <Tag>{String(value).toUpperCase()}</Tag> },
    { title: "状态", dataIndex: "status", width: 100, render: (value) => <StatusTag status={value} /> },
    { title: "结算", dataIndex: "billingMode", width: 110, render: (value) => value === "invoiced" ? "企业账期" : "共享余额" },
    { title: "成员", dataIndex: "memberCount", align: "right", width: 90, render: displayNumber },
    { title: "售卖方案", dataIndex: "offerCount", align: "right", width: 100, render: displayNumber },
    { title: "转售", dataIndex: "resellerEnabled", width: 90, render: (value) => value ? <Tag color="cyan">已开启</Tag> : <Tag>未开启</Tag> },
    { title: "创建时间", dataIndex: "createdAt", width: 170, render: displayDate },
  ];
  return (
    <>
      <AdminPageHeader title="企业租户" description="管理企业身份、成员规模、结算模式与对外售卖能力。企业数据与个人/子账号保持独立权限边界。" />
      <AdminState loading={resource.loading} error={resource.error} empty={!resource.data?.length} emptyText="暂无企业租户" onRetry={resource.reload}>
        <Table className="nf-admin-table" rowKey="id" columns={columns} dataSource={resource.data || []} pagination={{ pageSize: 20 }} scroll={{ x: 1230 }} />
      </AdminState>
    </>
  );
}
