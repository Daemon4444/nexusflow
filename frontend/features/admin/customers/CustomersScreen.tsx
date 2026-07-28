"use client";

import Link from "next/link";
import { Input, Select, Table } from "antd";
import type { ColumnsType, TablePaginationConfig } from "antd/es/table";
import { SearchOutlined } from "@ant-design/icons";
import { adminGet, appendQuery, extractItems } from "../client";
import type { AdminCustomer, Paginated } from "../contracts";
import { AdminPageHeader, AdminState, StatusTag, TruthBar } from "../shared/AdminUI";
import { displayDate, displayMoney, displayNumber, displayPercent } from "../shared/format";
import { asRecord } from "../shared/normalize";
import { positiveInt, useAdminQuery } from "../shared/useAdminQuery";
import { useAdminResource } from "../shared/useAdminResource";

export default function CustomersScreen() {
  const { searchParams, setQuery } = useAdminQuery();
  const q = searchParams.get("q") || "";
  const status = searchParams.get("status") || "current";
  const page = positiveInt(searchParams.get("page"), 1);
  const pageSize = positiveInt(searchParams.get("pageSize"), 20);

  const resource = useAdminResource(async (signal) => {
    const payload = await adminGet<Paginated<AdminCustomer> | AdminCustomer[]>(
      appendQuery("/api/admin/customers", { q, status, page, pageSize }),
      signal
    );
    return { ...extractItems(payload, page, pageSize), truth: asRecord(asRecord(payload).truth) };
  }, [q, status, page, pageSize]);

  const columns: ColumnsType<AdminCustomer> = [
    {
      title: "客户",
      key: "customer",
      fixed: "left",
      width: 250,
      render: (_, row) => (
        <div>
          <Link className="nf-admin-table-primary" href={`/admin/customers/${encodeURIComponent(row.id)}`}>
            {row.nickname || row.email || row.id}
          </Link>
          <div className="nf-admin-table-secondary">{row.email || row.username || row.id}</div>
        </div>
      ),
    },
    { title: "类型", dataIndex: "accountType", width: 90, render: (value) => <StatusTag status={value} /> },
    { title: "状态", dataIndex: "status", width: 90, render: (value) => <StatusTag status={value} /> },
    { title: "余额", dataIndex: "balance", align: "right", width: 110, render: (value) => displayMoney(value) },
    { title: "信控", dataIndex: "creditBalance", align: "right", width: 110, render: (value) => displayMoney(value) },
    { title: "可用", dataIndex: "availableBalance", align: "right", width: 110, render: (value) => displayMoney(value) },
    { title: "请求", dataIndex: "totalRequests", align: "right", width: 100, render: displayNumber },
    { title: "消费", dataIndex: "totalCost", align: "right", width: 110, render: (value) => displayMoney(value) },
    { title: "成功率", dataIndex: "successRate", align: "right", width: 100, render: (value) => displayPercent(value, "ratio") },
    { title: "最近活跃", dataIndex: "lastActiveAt", width: 160, render: displayDate },
  ];

  const pagination: TablePaginationConfig = {
    current: resource.data?.pagination.page || page,
    pageSize: resource.data?.pagination.pageSize || pageSize,
    total: resource.data?.pagination.total || 0,
    showSizeChanger: true,
    showTotal: (total) => `共 ${total.toLocaleString("zh-CN")} 个账号`,
    onChange: (nextPage, nextPageSize) => setQuery({ page: nextPage, pageSize: nextPageSize }),
  };

  return (
    <>
      <AdminPageHeader
        eyebrow="Customer 360"
        title="客户中心"
        description="从真实账户、账本和用量数据查看主账号、子账号及其平台关系。"
      />
      <div className="nf-admin-filterbar" role="search">
        <Input
          allowClear
          prefix={<SearchOutlined />}
          placeholder="昵称、邮箱、用户名或 ID"
          value={q}
          onChange={(event) => setQuery({ q: event.target.value, page: 1 })}
          style={{ width: 320 }}
          aria-label="搜索客户"
        />
        <Select
          value={status}
          onChange={(value) => setQuery({ status: value, page: 1 })}
          style={{ width: 150 }}
          aria-label="客户状态"
          options={[
            { label: "当前账号", value: "current" },
            { label: "正常", value: "active" },
            { label: "停用", value: "suspended" },
            { label: "已删除", value: "deleted" },
            { label: "全部", value: "all" },
          ]}
        />
      </div>
      <AdminState
        loading={resource.loading}
        error={resource.error}
        empty={resource.data?.items.length === 0}
        emptyText="没有匹配的真实客户"
        onRetry={resource.reload}
      >
        <>
          <TruthBar truth={resource.data?.truth} />
          <Table
            className="nf-admin-table"
            rowKey="id"
            columns={columns}
            dataSource={resource.data?.items || []}
            pagination={pagination}
            scroll={{ x: 1280 }}
          />
        </>
      </AdminState>
    </>
  );
}
