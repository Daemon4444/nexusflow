import { redirect } from "next/navigation";

export default function DeprecatedAsyncPage() {
  redirect("/docs/api/tasks");
}
