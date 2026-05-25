import ModelsClient from "./ModelsClient";

async function getModels() {
  try {
    const res = await fetch("http://127.0.0.1:3001/api/models", {
      next: { revalidate: 300 },
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
