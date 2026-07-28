"use client";

import { Card, Input, Segmented, Table } from "antd";
import type { ColumnsType, TablePaginationConfig } from "antd/es/table";
import { SearchOutlined } from "@ant-design/icons";
import { adminGet, appendQuery } from "../client";
import type { CustomerTransaction, FinanceOverview } from "../contracts";
import { AdminMetric, AdminPageHeader, AdminState, StatusTag, TruthBar } from "../shared/AdminUI";
import { displayDate, displayMoney, displayPercent } from "../shared/format";
import { positiveInt, useAdminQuery } from "../shared/useAdminQuery";
import { useAdminResource } from "../shared/useAdminResource";

export default function FinanceScreen() {
  const { searchParams, setQuery } = useAdminQuery();
  const range = searchParams.get("range") || "30d";
  const q = searchParams.get("q") || "";
  const page = positiveInt(searchParams.get("page"), 1);
  const pageSize = positiveInt(searchParams.get("pageSize"), 20);

  const resource = useAdminResource(
    (signal) => adminGet<FinanceOverview>(
      appendQuery("/api/admin/finance/overview", { range, q, page, pageSize }),
      signal
    ),
    [range, q, page, pageSize]
  );

  const transactionData = resource.data?.transactions;
  const transactionItems = Array.isArray(transactionData) ? transactionData : transactionData?.items || [];
  const transactionPagination = Array.isArray(transactionData) ? null : transactionData?.pagination;

  const columns: ColumnsType<CustomerTransaction> = [
    { title: "时间", dataIndex: "createdAt", width: 170, render: displayDate },
    {
      title: "客户",
      key: "customer",
      width: 220,
      render: (_, row) => (
        <div>
          <div className="nf-admin-table-primary">{row.userNickname || row.userEmail || "unknown"}</div>
          <div className="nf-admin-table-secondary">{row.userEmail || row.userId || "unknown"}</div>
        </div>
      ),
    },
    { title: "类型", dataIndex: "type", width: 110, render: (value) => <StatusTag status={value} /> },
    { title: "描述", dataIndex: "description", ellipsis: true },
    { title: "发起账号", dataIndex: "actor", width: 160, render: (value) => value || "本人" },
    { title: "金额", dataIndex: "amount", width: 130, align: "right", render: (value) => displayMoney(value, true) },
    { title: "余额", dataIndex: "balanceAfter", width: 120, align: "right", render: (value) => displayMoney(value) },
    { title: "信控", dataIndex: "creditAfter", width: 120, align: "right", render: (value) => displayMoney(value) },
  ];

  const pagination: TablePaginationConfig | false = transactionPagination ? {
    current: transactionPagination.page,
    pageSize: transactionPagination.pageSize,
    total: transactionPagination.total,
    showSizeChanger: true,
    showTotal: (total) => `共 ${total.toLocaleString("zh-CN")} 笔`,
    onChange: (nextPage, nextPageSize) => setQuery({ page: nextPage, pageSize: nextPageSize }),
  } : false;

  const summary = resource.data?.summary;

  return (
    <>
      <AdminPageHeader
        eyebrow="Ledger & margin"
        title="财务账本"
        description="余额负债、信控敞口、充值、消费及可核验成本。成本源缺失时不推导利润。"
        actions={
          <Segmented
            value={range}
            options={[
              { label: "7 天", value: "7d" },
              { label: "30 天", value: "30d" },
              { label: "90 天", value: "90d" },
              { label: "全部", value: "all" },
            ]}
            onChange={(value) => setQuery({ range: String(value), page: 1 })}
          />
        }
      />
      <AdminState loading={resource.loading} error={resource.error} empty={!resource.data} onRetry={resource.reload}>
        {resource.data && summary ? (
          <>
            <TruthBar truth={resource.data.truth} generatedAt={resource.data.generatedAt} />
            <div className="nf-admin-metric-grid">
              <AdminMetric label="余额负债" value={displayMoney(summary.balance)} unknown={summary.balance === null} />
              <AdminMetric label="信控敞口" value={displayMoney(summary.creditBalance)} unknown={summary.creditBalance === null} />
              <AdminMetric label="可用总额" value={displayMoney(summary.availableBalance)} unknown={summary.availableBalance === null} />
              <AdminMetric label="期间充值" value={displayMoney(summary.totalRecharge)} unknown={summary.totalRecharge === null} />
              <AdminMetric label="期间消费" value={displayMoney(summary.totalConsumption)} unknown={summary.totalConsumption === null} />
              <AdminMetric label="上游成本" value={displayMoney(summary.upstreamCost)} unknown={summary.upstreamCost === null} />
              <AdminMetric label="毛利" value={displayMoney(summary.grossProfit)} unknown={summary.grossProfit === null} />
              <AdminMetric label="毛利率" value={displayPercent(summary.grossMargin, "ratio")} unknown={summary.grossMargin === null} />
            </div>
            <Card className="nf-admin-section" title="账务流水">
              <div className="nf-admin-filterbar">
                <Input
                  allowClear
                  prefix={<SearchOutlined />}
                  value={q}
                  onChange={(event) => setQuery({ q: event.target.value, page: 1 })}
                  placeholder="客户、描述或流水 ID"
                  style={{ width: 320 }}
                  aria-label="搜索账务流水"
                />
              </div>
              <Table
                className="nf-admin-table"
                rowKey="id"
                columns={columns}
                dataSource={transactionItems}
                pagination={pagination}
                scroll={{ x: 1200 }}
                locale={{ emptyText: "该筛选下没有真实账务流水" }}
              />
            </Card>
          </>
        ) : null}
      </AdminState>
    </>
  );
}
