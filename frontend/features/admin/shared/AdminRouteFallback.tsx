"use client";

import { Card, Skeleton } from "antd";

export default function AdminRouteFallback() {
  return (
    <div aria-busy="true" aria-label="正在加载管理模块">
      <Skeleton active title={{ width: 220 }} paragraph={{ rows: 2, width: ["70%", "55%"] }} />
      <Card className="nf-admin-state-card" style={{ marginTop: 22 }}>
        <Skeleton active paragraph={{ rows: 8 }} />
      </Card>
    </div>
  );
}
