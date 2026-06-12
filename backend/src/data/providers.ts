import { v4 as uuidv4 } from "uuid";
import crypto from "crypto";
import { db } from "../db/client";
import { decryptProviderSecret, encryptProviderSecret } from "../utils/provider-secrets";

export interface Provider {
  id: string;
  name: string;
  slug: string;
  description: string;
  logo_url: string | null;
  website: string | null;
  api_base_url: string;
  api_key: string;
  contact_name: string;
  contact_email: string;
  contact_phone: string | null;
  status: "draft" | "enabled" | "disabled";
  rejection_reason: string | null;
  created_at: string;
  updated_at: string;
  approved_at: string | null;
}

export interface ProviderModel {
  id: string;
  provider_id: string;
  model_id: string;
  name: string;
  description: string;
  category: string;
  context_length: number;
  max_output: number;
  prompt_price: number;
  completion_price: number;
  tags: string[];
  supported: string[];
  is_featured: boolean;
  is_new: boolean;
  status: "draft" | "enabled" | "disabled";
  created_at: string;
  updated_at: string;
}

export interface ProviderCapacity {
  id: string;
  provider_id: string;
  model_id: string;
  rpm_limit: number;
  tpm_limit: number;
  daily_limit: number;
  concurrent_limit: number;
  priority: number;
  weight: number;
  is_enabled: boolean;
  created_at: string;
  updated_at: string;
}

export async function getAllProviders(): Promise<Provider[]> {
  const rows = await db.queryMany<any>("SELECT * FROM providers ORDER BY created_at DESC");
  return rows.map(parseProviderRow);
}

export async function getProvidersByStatus(status: string): Promise<Provider[]> {
  const rows = await db.queryMany<any>("SELECT * FROM providers WHERE status = ? ORDER BY created_at DESC", [normalizeStatusForStorage(status)]);
  return rows.map(parseProviderRow);
}

export async function getProviderById(id: string): Promise<Provider | null> {
  const row = await db.queryOne<any>("SELECT * FROM providers WHERE id = ?", [id]);
  return row ? parseProviderRow(row) : null;
}

export async function getProviderBySlug(slug: string): Promise<Provider | null> {
  const row = await db.queryOne<any>("SELECT * FROM providers WHERE slug = ?", [slug]);
  return row ? parseProviderRow(row) : null;
}

export async function getProviderByEmail(email: string): Promise<Provider | null> {
  const row = await db.queryOne<any>("SELECT * FROM providers WHERE contact_email = ?", [email]);
  return row ? parseProviderRow(row) : null;
}

export async function createProvider(data: {
  name: string;
  description?: string;
  logo_url?: string;
  website?: string;
  api_base_url: string;
  api_key: string;
  contact_name: string;
  contact_email: string;
  contact_phone?: string;
}): Promise<Provider> {
  const id = uuidv4();
  const slug = data.name.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fa5]+/g, "-").replace(/^-|-$/g, "") || crypto.randomBytes(4).toString("hex");
  const now = new Date().toISOString();
  const row = await db.queryOne<any>(
    `INSERT INTO providers (id, name, slug, description, logo_url, website, api_base_url, api_key,
      contact_name, contact_email, contact_phone, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     RETURNING *`,
    [id, data.name, slug, data.description || "", data.logo_url || null, data.website || null, data.api_base_url, encryptProviderSecret(data.api_key), data.contact_name, data.contact_email, data.contact_phone || null, "draft", now, now]
  );
  return parseProviderRow(row);
}

export async function ensureProvider(data: {
  id: string;
  name: string;
  slug: string;
  description?: string;
  website?: string;
  api_base_url: string;
  api_key?: string;
  contact_name?: string;
  contact_email?: string;
  contact_phone?: string;
  status?: "draft" | "enabled" | "disabled";
}): Promise<Provider> {
  const existing = (await getProviderById(data.id)) || (await getProviderBySlug(data.slug));
  if (existing) return existing;
  const now = new Date().toISOString();
  const row = await db.queryOne<any>(
    `INSERT INTO providers (id, name, slug, description, logo_url, website, api_base_url, api_key,
      contact_name, contact_email, contact_phone, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     RETURNING *`,
    [data.id, data.name, data.slug, data.description || "", null, data.website || null, data.api_base_url, encryptProviderSecret(data.api_key || ""), data.contact_name || "Platform Ops", data.contact_email || "ops@nexusflow.ai", data.contact_phone || null, normalizeStatusForStorage(data.status || "enabled"), now, now]
  );
  return parseProviderRow(row);
}

export async function updateProviderStatus(id: string, status: "draft" | "enabled" | "disabled", rejectionReason?: string): Promise<boolean> {
  const now = new Date().toISOString();
  const normalizedStatus = normalizeStatusForStorage(status);
  const approvedAt = normalizedStatus === "enabled" ? now : null;
  const changed = await db.execute("UPDATE providers SET status = ?, rejection_reason = ?, updated_at = ?, approved_at = ? WHERE id = ?", [
    normalizedStatus,
    rejectionReason || null,
    now,
    approvedAt,
    id,
  ]);
  return changed > 0;
}

export async function updateProvider(id: string, data: {
  name?: string;
  description?: string;
  logo_url?: string;
  website?: string;
  api_base_url?: string;
  api_key?: string;
  contact_name?: string;
  contact_email?: string;
  contact_phone?: string;
}): Promise<boolean> {
  const provider = await getProviderById(id);
  if (!provider) return false;
  const changed = await db.execute(
    `UPDATE providers SET name = ?, description = ?, logo_url = ?, website = ?,
      api_base_url = ?, api_key = ?, contact_name = ?, contact_email = ?, contact_phone = ?, updated_at = ? WHERE id = ?`,
    [data.name || provider.name, data.description || provider.description, data.logo_url !== undefined ? data.logo_url : provider.logo_url, data.website !== undefined ? data.website : provider.website, data.api_base_url || provider.api_base_url, data.api_key ? encryptProviderSecret(data.api_key) : encryptProviderSecret(provider.api_key), data.contact_name || provider.contact_name, data.contact_email || provider.contact_email, data.contact_phone !== undefined ? data.contact_phone : provider.contact_phone, new Date().toISOString(), id]
  );
  return changed > 0;
}

export async function deleteProvider(id: string): Promise<boolean> {
  return (await db.execute("DELETE FROM providers WHERE id = ?", [id])) > 0;
}

export async function getAllProviderModels(): Promise<ProviderModel[]> {
  const rows = await db.queryMany<any>("SELECT * FROM provider_models ORDER BY created_at DESC");
  return rows.map(parseModelRow);
}

export async function getModelsByProvider(providerId: string): Promise<ProviderModel[]> {
  const rows = await db.queryMany<any>("SELECT * FROM provider_models WHERE provider_id = ? ORDER BY created_at DESC", [providerId]);
  return rows.map(parseModelRow);
}

export async function getModelsByStatus(status: string): Promise<ProviderModel[]> {
  const rows = await db.queryMany<any>("SELECT * FROM provider_models WHERE status = ? ORDER BY created_at DESC", [normalizeStatusForStorage(status)]);
  return rows.map(parseModelRow);
}

export async function getApprovedModelsWithProvider() {
  const rows = await db.queryMany<any>(
    `SELECT pm.*, p.name as provider_name, p.slug as provider_slug, p.api_base_url, p.api_key as provider_api_key
     FROM provider_models pm
     JOIN providers p ON pm.provider_id = p.id
     WHERE pm.status = 'enabled' AND p.status = 'enabled'
     ORDER BY pm.is_featured DESC, pm.created_at DESC`
  );
  return rows.map((row) => ({
    ...parseModelRow(row),
    providerName: row.provider_name,
    providerSlug: row.provider_slug,
    apiBaseUrl: row.api_base_url,
    providerApiKey: row.provider_api_key,
  }));
}

export async function getModelById(id: string): Promise<ProviderModel | null> {
  const row = await db.queryOne<any>("SELECT * FROM provider_models WHERE id = ?", [id]);
  return row ? parseModelRow(row) : null;
}

export async function getModelByModelId(modelId: string): Promise<(ProviderModel & { apiBaseUrl: string; providerApiKey: string }) | null> {
  const row = await db.queryOne<any>(
    `SELECT pm.*, p.api_base_url, p.api_key as provider_api_key, p.status as provider_status
     FROM provider_models pm
     JOIN providers p ON pm.provider_id = p.id
     WHERE pm.model_id = ?`,
    [modelId]
  );
  if (!row || row.provider_status !== "enabled") return null;
  return {
    ...parseModelRow(row),
    apiBaseUrl: row.api_base_url,
    providerApiKey: decryptProviderSecret(row.provider_api_key || ""),
  };
}

export async function createModel(providerId: string, data: {
  model_id: string;
  name: string;
  description?: string;
  category?: string;
  context_length?: number;
  max_output?: number;
  prompt_price?: number;
  completion_price?: number;
  tags?: string[];
  supported?: string[];
}): Promise<ProviderModel | null> {
  if (await db.queryOne("SELECT id FROM provider_models WHERE model_id = ?", [data.model_id])) return null;
  const id = uuidv4();
  const now = new Date().toISOString();
  const row = await db.queryOne<any>(
    `INSERT INTO provider_models (id, provider_id, model_id, name, description, category,
      context_length, max_output, prompt_price, completion_price, tags, supported,
      is_featured, is_new, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     RETURNING *`,
    [id, providerId, data.model_id, data.name, data.description || "", data.category || "Large Language Model", data.context_length || 4096, data.max_output || 4096, data.prompt_price || 0, data.completion_price || 0, JSON.stringify(data.tags || []), JSON.stringify(data.supported || ["Text"]), false, true, "draft", now, now]
  );
  return parseModelRow(row);
}

export async function updateModel(id: string, data: {
  name?: string;
  description?: string;
  category?: string;
  context_length?: number;
  max_output?: number;
  prompt_price?: number;
  completion_price?: number;
  tags?: string[];
  supported?: string[];
}): Promise<boolean> {
  const model = await getModelById(id);
  if (!model) return false;
  const changed = await db.execute(
    `UPDATE provider_models SET name = ?, description = ?, category = ?, context_length = ?,
      max_output = ?, prompt_price = ?, completion_price = ?, tags = ?, supported = ?,
      updated_at = ? WHERE id = ?`,
    [data.name || model.name, data.description !== undefined ? data.description : model.description, data.category || model.category, data.context_length || model.context_length, data.max_output || model.max_output, data.prompt_price !== undefined ? data.prompt_price : model.prompt_price, data.completion_price !== undefined ? data.completion_price : model.completion_price, JSON.stringify(data.tags || model.tags), JSON.stringify(data.supported || model.supported), new Date().toISOString(), id]
  );
  return changed > 0;
}

export async function updateModelStatus(id: string, status: "draft" | "enabled" | "disabled"): Promise<boolean> {
  return (await db.execute("UPDATE provider_models SET status = ?, updated_at = ? WHERE id = ?", [normalizeStatusForStorage(status), new Date().toISOString(), id])) > 0;
}

export async function deleteModel(id: string): Promise<boolean> {
  return (await db.execute("DELETE FROM provider_models WHERE id = ?", [id])) > 0;
}

export async function getProviderStats() {
  const rows = await db.queryMany<any>("SELECT status, COUNT(*)::int as count FROM providers GROUP BY status");
  const stats: Record<string, number> = { draft: 0, enabled: 0, disabled: 0 };
  rows.forEach((row) => (stats[normalizeStatus(row.status)] = Number(row.count || 0)));
  return stats;
}

export async function getModelStats() {
  const rows = await db.queryMany<any>("SELECT status, COUNT(*)::int as count FROM provider_models GROUP BY status");
  const stats: Record<string, number> = { draft: 0, enabled: 0, disabled: 0 };
  rows.forEach((row) => (stats[normalizeStatus(row.status)] = Number(row.count || 0)));
  return stats;
}

export async function getCapacityByProvider(providerId: string): Promise<ProviderCapacity[]> {
  const rows = await db.queryMany<any>("SELECT * FROM provider_capacity WHERE provider_id = ?", [providerId]);
  return rows.map(parseCapacityRow);
}

export async function getCapacityByModel(modelId: string): Promise<ProviderCapacity[]> {
  const rows = await db.queryMany<any>("SELECT * FROM provider_capacity WHERE model_id = ?", [modelId]);
  return rows.map(parseCapacityRow);
}

export async function getCapacity(providerId: string, modelId: string): Promise<ProviderCapacity | null> {
  const row = await db.queryOne<any>("SELECT * FROM provider_capacity WHERE provider_id = ? AND model_id = ?", [providerId, modelId]);
  return row ? parseCapacityRow(row) : null;
}

export async function getAllCapacity(): Promise<(ProviderCapacity & { provider_name: string; model_name: string })[]> {
  const rows = await db.queryMany<any>(
    `SELECT pc.*, p.name as provider_name, pm.name as model_name
     FROM provider_capacity pc
     JOIN providers p ON pc.provider_id = p.id
     LEFT JOIN provider_models pm ON pc.model_id = pm.model_id
     ORDER BY pc.provider_id, pc.model_id`
  );
  return rows.map((row) => ({ ...parseCapacityRow(row), provider_name: row.provider_name, model_name: row.model_name }));
}

export async function upsertCapacity(
  providerId: string,
  modelId: string,
  data: {
    rpm_limit?: number;
    tpm_limit?: number;
    daily_limit?: number;
    concurrent_limit?: number;
    priority?: number;
    weight?: number;
    is_enabled?: boolean;
  }
): Promise<ProviderCapacity> {
  const existing = await getCapacity(providerId, modelId);
  const now = new Date().toISOString();
  const row = await db.queryOne<any>(
    `INSERT INTO provider_capacity (id, provider_id, model_id, rpm_limit, tpm_limit, daily_limit, concurrent_limit, priority, weight, is_enabled, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(provider_id, model_id) DO UPDATE SET
       rpm_limit = excluded.rpm_limit,
       tpm_limit = excluded.tpm_limit,
       daily_limit = excluded.daily_limit,
       concurrent_limit = excluded.concurrent_limit,
       priority = excluded.priority,
       weight = excluded.weight,
       is_enabled = excluded.is_enabled,
       updated_at = excluded.updated_at
     RETURNING *`,
    [existing?.id || uuidv4(), providerId, modelId, data.rpm_limit ?? existing?.rpm_limit ?? 60, data.tpm_limit ?? existing?.tpm_limit ?? 100000, data.daily_limit ?? existing?.daily_limit ?? 10000, data.concurrent_limit ?? existing?.concurrent_limit ?? 10, data.priority ?? existing?.priority ?? 0, data.weight ?? existing?.weight ?? 100, data.is_enabled ?? existing?.is_enabled ?? true, existing?.created_at || now, now]
  );
  return parseCapacityRow(row);
}

export async function deleteCapacity(providerId: string, modelId: string): Promise<boolean> {
  return (await db.execute("DELETE FROM provider_capacity WHERE provider_id = ? AND model_id = ?", [providerId, modelId])) > 0;
}

function parseModelRow(row: any): ProviderModel {
  return {
    ...row,
    status: normalizeStatus(row.status),
    tags: typeof row.tags === "string" ? JSON.parse(row.tags || "[]") : row.tags || [],
    supported: typeof row.supported === "string" ? JSON.parse(row.supported || '["Text"]') : row.supported || ["Text"],
    is_featured: !!row.is_featured,
    is_new: !!row.is_new,
  };
}

function parseProviderRow(row: any): Provider {
  return {
    ...row,
    api_key: decryptProviderSecret(row.api_key || ""),
    status: normalizeStatus(row.status),
  };
}

function parseCapacityRow(row: any): ProviderCapacity {
  return { ...row, is_enabled: !!row.is_enabled };
}

function normalizeStatus(status: string): "draft" | "enabled" | "disabled" {
  switch (status) {
    case "pending":
      return "draft";
    case "approved":
      return "enabled";
    case "rejected":
      return "disabled";
    case "draft":
    case "enabled":
    case "disabled":
      return status;
    default:
      return "draft";
  }
}

function normalizeStatusForStorage(status: string): "draft" | "enabled" | "disabled" {
  return normalizeStatus(status);
}
