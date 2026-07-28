import { Suspense } from "react";
import SupportScreen from "@/features/admin/support/SupportScreen";
import AdminRouteFallback from "@/features/admin/shared/AdminRouteFallback";

export default function AdminSupportPage() {
  return (
    <Suspense fallback={<AdminRouteFallback />}>
      <SupportScreen />
    </Suspense>
  );
}
