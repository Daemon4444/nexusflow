import ModelsClient from "./ModelsClient";

export const dynamic = "force-dynamic";

async function getModels() {
  const backend = process.env.BACKEND_URL || "http://127.0.0.1:3001";
  try {
    const res = await fetch(`${backend}/api/models`, {
      cache: "no-store",
    });
    if (!res.ok) return { data: [], providers: [], categories: [], loadError: "模型服务暂时不可用，请稍后重试" };
    return { ...(await res.json()), loadError: "" };
  } catch {
    return { data: [], providers: [], categories: [], loadError: "无法连接模型服务，请稍后重试" };
  }
}

export default async function ModelsPage() {
  const result = await getModels();
  return (
    <ModelsClient
      initialModels={result.data || []}
      initialProviders={result.providers || []}
      initialCategories={result.categories || []}
      initialError={result.loadError || ""}
    />
  );
}
