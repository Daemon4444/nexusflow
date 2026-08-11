import PricingClient from "./PricingClient";

export const dynamic = "force-dynamic";

async function getModels() {
  const backend = process.env.BACKEND_URL || "http://127.0.0.1:3001";
  try {
    const res = await fetch(`${backend}/api/models`, {
      cache: "no-store",
    });
    if (!res.ok) return { data: [], loadError: "价格服务暂时不可用，请稍后重试" };
    return { ...(await res.json()), loadError: "" };
  } catch {
    return { data: [], loadError: "无法连接价格服务，请稍后重试" };
  }
}

export default async function PricingPage() {
  const result = await getModels();
  return <PricingClient initialModels={result.data || []} initialError={result.loadError || ""} />;
}
