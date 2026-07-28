import { Suspense } from "react";
import AccessScreen from "@/features/admin/access/AccessScreen";
import AdminRouteFallback from "@/features/admin/shared/AdminRouteFallback";

export default function AdminAccessPage() {
  return (
    <Suspense fallback={<AdminRouteFallback />}>
      <AccessScreen />
    </Suspense>
  );
}
