import { redirect } from "next/navigation";

export default function AdminInspectorRedirect() {
  redirect("/admin/traffic");
}
