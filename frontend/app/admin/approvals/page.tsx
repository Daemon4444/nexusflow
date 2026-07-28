import { Suspense } from "react";
import ApprovalsScreen from "@/features/admin/approvals/ApprovalsScreen";
import AdminRouteFallback from "@/features/admin/shared/AdminRouteFallback";

export default function AdminApprovalsPage() {
  return (
    <Suspense fallback={<AdminRouteFallback />}>
      <ApprovalsScreen />
    </Suspense>
  );
}
