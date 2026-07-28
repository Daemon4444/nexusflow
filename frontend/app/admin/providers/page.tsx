import { Suspense } from "react";
import ProvidersScreen from "@/features/admin/providers/ProvidersScreen";
import AdminRouteFallback from "@/features/admin/shared/AdminRouteFallback";

export default function AdminProvidersPage() {
  return (
    <Suspense fallback={<AdminRouteFallback />}>
      <ProvidersScreen />
    </Suspense>
  );
}
