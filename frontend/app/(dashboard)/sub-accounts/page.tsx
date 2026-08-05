import { redirect } from "next/navigation";

export default function SubAccountsCompatibilityPage() {
  redirect("/enterprise?section=access&tab=service");
}
