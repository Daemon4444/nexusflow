import { Suspense } from "react";
import ModelsScreen from "@/features/admin/models/ModelsScreen";
import AdminRouteFallback from "@/features/admin/shared/AdminRouteFallback";

export default function AdminModelsPage() {
  return (
    <Suspense fallback={<AdminRouteFallback />}>
      <ModelsScreen />
    </Suspense>
  );
}
