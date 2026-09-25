import { Suspense } from "react";
import ControlPlaneConfigScreen from "@/features/admin/config/ControlPlaneConfigScreen";
import AdminRouteFallback from "@/features/admin/shared/AdminRouteFallback";

export default function AdminControlPlaneConfigPage() {
  return (
    <Suspense fallback={<AdminRouteFallback />}>
      <ControlPlaneConfigScreen />
    </Suspense>
  );
}
