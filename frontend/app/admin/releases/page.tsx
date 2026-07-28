import { Suspense } from "react";
import ReleasesScreen from "@/features/admin/releases/ReleasesScreen";
import AdminRouteFallback from "@/features/admin/shared/AdminRouteFallback";

export default function AdminReleasesPage() {
  return (
    <Suspense fallback={<AdminRouteFallback />}>
      <ReleasesScreen />
    </Suspense>
  );
}
