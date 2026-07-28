import { Suspense } from "react";
import TrafficScreen from "@/features/admin/traffic/TrafficScreen";
import AdminRouteFallback from "@/features/admin/shared/AdminRouteFallback";

export default function AdminTrafficPage() {
  return (
    <Suspense fallback={<AdminRouteFallback />}>
      <TrafficScreen />
    </Suspense>
  );
}
