import PricingClient from "./PricingClient";

export const dynamic = "force-dynamic";

async function getModels() {
  const backend = process.env.BACKEND_URL || "http://127.0.0.1:3001";
  try {
    const res = await fetch(`${backend}/api/models`, {
      cache: "no-store",
    });
    if (!res.ok) return { data: [] };
    return await res.json();
  } catch {
    return { data: [] };
  }
}

export default async function PricingPage() {
  const result = await getModels();
  return <PricingClient initialModels={result.data || []} />;
}
