import { Suspense } from "react";
import OverviewScreen from "@/features/admin/overview/OverviewScreen";
import AdminRouteFallback from "@/features/admin/shared/AdminRouteFallback";

export default function AdminOverviewPage() {
  return (
    <Suspense fallback={<AdminRouteFallback />}>
      <OverviewScreen />
    </Suspense>
  );
}
