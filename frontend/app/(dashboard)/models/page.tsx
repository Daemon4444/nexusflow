import ModelsClient from "./ModelsClient";

export const dynamic = "force-dynamic";

async function getModels() {
  const backend = process.env.BACKEND_URL || "http://127.0.0.1:3001";
  try {
    const res = await fetch(`${backend}/api/models`, {
      cache: "no-store",
    });
    if (!res.ok) return { data: [], providers: [], categories: [] };
    return await res.json();
  } catch {
    return { data: [], providers: [], categories: [] };
  }
}

export default async function ModelsPage() {
  const result = await getModels();
  return (
    <ModelsClient
      initialModels={result.data || []}
      initialProviders={result.providers || []}
      initialCategories={result.categories || []}
    />
  );
}
