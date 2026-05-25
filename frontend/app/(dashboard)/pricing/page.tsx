import PricingClient from "./PricingClient";

async function getModels() {
  try {
    const res = await fetch("http://127.0.0.1:3001/api/models", {
      next: { revalidate: 300 },
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
