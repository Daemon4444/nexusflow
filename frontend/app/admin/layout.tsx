import { AntdRegistry } from "@ant-design/nextjs-registry";
import AdminProviders from "@/features/admin/AdminProviders";
import AdminGate from "@/features/admin/gate/AdminGate";
import AdminShell from "@/features/admin/shell/AdminShell";
import "@/features/admin/admin.css";

export const metadata = {
  title: "Operations Control Plane",
  robots: { index: false, follow: false },
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <AntdRegistry>
      <AdminProviders>
        <AdminGate>
          <AdminShell>{children}</AdminShell>
        </AdminGate>
      </AdminProviders>
    </AntdRegistry>
  );
}
