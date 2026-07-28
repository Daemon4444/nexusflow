import { Suspense } from "react";
import AuditScreen from "@/features/admin/audit/AuditScreen";
import AdminRouteFallback from "@/features/admin/shared/AdminRouteFallback";

export default function AdminAuditPage() {
  return (
    <Suspense fallback={<AdminRouteFallback />}>
      <AuditScreen />
    </Suspense>
  );
}
