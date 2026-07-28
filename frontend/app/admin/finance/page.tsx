import { Suspense } from "react";
import FinanceScreen from "@/features/admin/finance/FinanceScreen";
import AdminRouteFallback from "@/features/admin/shared/AdminRouteFallback";

export default function AdminFinancePage() {
  return (
    <Suspense fallback={<AdminRouteFallback />}>
      <FinanceScreen />
    </Suspense>
  );
}
