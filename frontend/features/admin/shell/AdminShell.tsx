"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ApartmentOutlined,
  AuditOutlined,
  BankOutlined,
  BarsOutlined,
  CloudServerOutlined,
  CodeOutlined,
  CustomerServiceOutlined,
  DashboardOutlined,
  DeploymentUnitOutlined,
  LogoutOutlined,
  MenuOutlined,
  SafetyCertificateOutlined,
  TeamOutlined,
} from "@ant-design/icons";
import { Button, Drawer, Grid, Layout, Menu, Space, Tag, Tooltip } from "antd";
import type { MenuProps } from "antd";
import ThemeToggle from "@/components/ThemeToggle";
import { useAuth } from "@/lib/auth";
import { useAdminSession } from "../gate/AdminGate";

const { Header, Sider, Content } = Layout;

interface NavEntry {
  key: string;
  label: string;
  href: string;
  permission: string;
  icon: React.ReactNode;
  group: "control" | "business" | "governance";
}

const NAV: NavEntry[] = [
  { key: "overview", label: "控制中心", href: "/admin/overview", permission: "control_plane.read", icon: <DashboardOutlined />, group: "control" },
  { key: "traffic", label: "实时流量", href: "/admin/traffic", permission: "traffic.read", icon: <BarsOutlined />, group: "control" },
  { key: "providers", label: "Provider", href: "/admin/providers", permission: "providers.read", icon: <CloudServerOutlined />, group: "control" },
  { key: "models", label: "模型与定价", href: "/admin/models", permission: "catalog.read", icon: <DeploymentUnitOutlined />, group: "control" },
  { key: "customers", label: "客户中心", href: "/admin/customers", permission: "customers.read", icon: <TeamOutlined />, group: "business" },
  { key: "finance", label: "财务账本", href: "/admin/finance", permission: "billing.read", icon: <BankOutlined />, group: "business" },
  { key: "approvals", label: "限额审批", href: "/admin/approvals", permission: "support.read", icon: <SafetyCertificateOutlined />, group: "business" },
  { key: "support", label: "支持工单", href: "/admin/support", permission: "support.read", icon: <CustomerServiceOutlined />, group: "business" },
  { key: "audit", label: "审计日志", href: "/admin/audit", permission: "audit.read", icon: <AuditOutlined />, group: "governance" },
  { key: "releases", label: "发布中心", href: "/admin/releases", permission: "releases.read", icon: <CodeOutlined />, group: "governance" },
  { key: "access", label: "访问控制", href: "/admin/access", permission: "security.read", icon: <ApartmentOutlined />, group: "governance" },
];

const GROUP_LABELS = {
  control: "CONTROL PLANE",
  business: "BUSINESS",
  governance: "GOVERNANCE",
};

function findSelected(pathname: string): string {
  return NAV.find((entry) => pathname === entry.href || pathname.startsWith(`${entry.href}/`))?.key || "overview";
}

export default function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { session, can } = useAdminSession();
  const { logout } = useAuth();
  const screens = Grid.useBreakpoint();
  const desktop = Boolean(screens.lg);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const menuItems = useMemo<MenuProps["items"]>(() => (
    (Object.keys(GROUP_LABELS) as Array<keyof typeof GROUP_LABELS>).map((group) => ({
      type: "group",
      key: group,
      label: GROUP_LABELS[group],
      children: NAV
        .filter((entry) => entry.group === group && can(entry.permission))
        .map((entry) => ({
          key: entry.key,
          icon: entry.icon,
          label: <Link href={entry.href} onClick={() => setDrawerOpen(false)}>{entry.label}</Link>,
        })),
    }))
  ), [can]);

  const navigation = (
    <div className="nf-admin-navigation">
      <Link href="/admin/overview" className="nf-admin-brand" aria-label="NexusFlow 管理后台首页">
        <span className="nf-admin-brand-mark">N</span>
        <span>
          <strong>nexusflow</strong>
          <small>OPERATIONS</small>
        </span>
      </Link>
      <Menu
        mode="inline"
        items={menuItems}
        selectedKeys={[findSelected(pathname)]}
        className="nf-admin-menu"
      />
      <div className="nf-admin-sider-footer">
        <Link href="/">← 返回产品站</Link>
        <span>Production control plane</span>
      </div>
    </div>
  );

  return (
    <Layout className="nf-admin">
      {desktop ? <Sider width={244} className="nf-admin-sider">{navigation}</Sider> : null}
      <Drawer
        open={!desktop && drawerOpen}
        onClose={() => setDrawerOpen(false)}
        placement="left"
        size={272}
        styles={{ body: { padding: 0 } }}
        title={null}
        className="nf-admin-mobile-drawer"
      >
        {navigation}
      </Drawer>
      <Layout>
        <Header className="nf-admin-header">
          <Space size={10}>
            {!desktop ? (
              <Button
                type="text"
                icon={<MenuOutlined />}
                aria-label="打开管理菜单"
                onClick={() => setDrawerOpen(true)}
              />
            ) : null}
            <div className="nf-admin-header-title">
              Operations Control Plane
              <Tag color="green">PRODUCTION</Tag>
            </div>
          </Space>
          <Space size={8}>
            <ThemeToggle compact />
            <div className="nf-admin-identity">
              <span>{session.user.nickname || session.user.email}</span>
              <small>{session.role}</small>
            </div>
            <Tooltip title="退出登录">
              <Button
                type="text"
                icon={<LogoutOutlined />}
                aria-label="退出登录"
                onClick={() => logout()}
              />
            </Tooltip>
          </Space>
        </Header>
        <Content id="main-content" className="nf-admin-content">
          {children}
        </Content>
      </Layout>
    </Layout>
  );
}
