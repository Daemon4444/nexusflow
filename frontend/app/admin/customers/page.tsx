import { Suspense } from "react";
import CustomersScreen from "@/features/admin/customers/CustomersScreen";
import AdminRouteFallback from "@/features/admin/shared/AdminRouteFallback";

export default function AdminCustomersPage() {
  return (
    <Suspense fallback={<AdminRouteFallback />}>
      <CustomersScreen />
    </Suspense>
  );
}
