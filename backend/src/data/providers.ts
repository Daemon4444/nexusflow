import { v4 as uuidv4 } from "uuid";
import crypto from "crypto";
import db from "../db";
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

const stmts = {
  // Provider queries
  getAllProviders: db.prepare("SELECT * FROM providers ORDER BY created_at DESC"),
  getProvidersByStatus: db.prepare("SELECT * FROM providers WHERE status = ? ORDER BY created_at DESC"),
  getProviderById: db.prepare("SELECT * FROM providers WHERE id = ?"),
  getProviderBySlug: db.prepare("SELECT * FROM providers WHERE slug = ?"),
  getProviderByEmail: db.prepare("SELECT * FROM providers WHERE contact_email = ?"),
  insertProvider: db.prepare(`
    INSERT INTO providers (id, name, slug, description, logo_url, website, api_base_url, api_key, 
      contact_name, contact_email, contact_phone, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `),
  updateProviderStatus: db.prepare(`
    UPDATE providers SET status = ?, rejection_reason = ?, updated_at = ?, approved_at = ? WHERE id = ?
  `),
  updateProvider: db.prepare(`
    UPDATE providers SET name = ?, description = ?, logo_url = ?, website = ?, 
      api_base_url = ?, api_key = ?, contact_name = ?, contact_email = ?, contact_phone = ?, updated_at = ? WHERE id = ?
  `),
  deleteProvider: db.prepare("DELETE FROM providers WHERE id = ?"),

  // Model queries
  getAllModels: db.prepare("SELECT * FROM provider_models ORDER BY created_at DESC"),
  getModelsByProvider: db.prepare("SELECT * FROM provider_models WHERE provider_id = ? ORDER BY created_at DESC"),
  getModelsByStatus: db.prepare("SELECT * FROM provider_models WHERE status = ? ORDER BY created_at DESC"),
  getApprovedModels: db.prepare(`
    SELECT pm.*, p.name as provider_name, p.slug as provider_slug, p.api_base_url, p.api_key as provider_api_key
    FROM provider_models pm
    JOIN providers p ON pm.provider_id = p.id
    WHERE pm.status = 'enabled' AND p.status = 'enabled'
    ORDER BY pm.is_featured DESC, pm.created_at DESC
  `),
  getModelById: db.prepare("SELECT * FROM provider_models WHERE id = ?"),
  getModelByModelId: db.prepare("SELECT * FROM provider_models WHERE model_id = ?"),
  insertModel: db.prepare(`
    INSERT INTO provider_models (id, provider_id, model_id, name, description, category,
      context_length, max_output, prompt_price, completion_price, tags, supported, 
      is_featured, is_new, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `),
  updateModel: db.prepare(`
    UPDATE provider_models SET name = ?, description = ?, category = ?, context_length = ?,
      max_output = ?, prompt_price = ?, completion_price = ?, tags = ?, supported = ?,
      updated_at = ? WHERE id = ?
  `),
  updateModelStatus: db.prepare(`
    UPDATE provider_models SET status = ?, updated_at = ? WHERE id = ?
  `),
  deleteModel: db.prepare("DELETE FROM provider_models WHERE id = ?"),

  // Stats
  countProvidersByStatus: db.prepare("SELECT status, COUNT(*) as count FROM providers GROUP BY status"),
  countModelsByStatus: db.prepare("SELECT status, COUNT(*) as count FROM provider_models GROUP BY status"),
};

// ========== Provider Functions ==========

export function getAllProviders(): Provider[] {
  return (stmts.getAllProviders.all() as any[]).map(parseProviderRow);
}

export function getProvidersByStatus(status: string): Provider[] {
  return (stmts.getProvidersByStatus.all(normalizeStatusForStorage(status)) as any[]).map(parseProviderRow);
}

export function getProviderById(id: string): Provider | null {
  const row = stmts.getProviderById.get(id) as any;
  return row ? parseProviderRow(row) : null;
}

export function getProviderBySlug(slug: string): Provider | null {
  const row = stmts.getProviderBySlug.get(slug) as any;
  return row ? parseProviderRow(row) : null;
}

export function getProviderByEmail(email: string): Provider | null {
  const row = stmts.getProviderByEmail.get(email) as any;
  return row ? parseProviderRow(row) : null;
}

export function createProvider(data: {
  name: string;
  description?: string;
  logo_url?: string;
  website?: string;
  api_base_url: string;
  api_key: string;
  contact_name: string;
  contact_email: string;
  contact_phone?: string;
}): Provider {
  const id = uuidv4();
  const slug = data.name.toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, "-")
    .replace(/^-|-$/g, "") || crypto.randomBytes(4).toString("hex");
  const now = new Date().toISOString();

  stmts.insertProvider.run(
    id, data.name, slug, data.description || "", data.logo_url || null,
    data.website || null, data.api_base_url, encryptProviderSecret(data.api_key),
    data.contact_name, data.contact_email, data.contact_phone || null,
    "draft", now, now
  );

  return getProviderById(id)!;
}

export function updateProviderStatus(
  id: string,
  status: "draft" | "enabled" | "disabled",
  rejectionReason?: string
): boolean {
  const now = new Date().toISOString();
  const normalizedStatus = normalizeStatusForStorage(status);
  const approvedAt = normalizedStatus === "enabled" ? now : null;
  const result = stmts.updateProviderStatus.run(normalizedStatus, rejectionReason || null, now, approvedAt, id);
  return result.changes > 0;
}

export function updateProvider(id: string, data: {
  name?: string;
  description?: string;
  logo_url?: string;
  website?: string;
  api_base_url?: string;
  api_key?: string;
  contact_name?: string;
  contact_email?: string;
  contact_phone?: string;
}): boolean {
  const provider = getProviderById(id);
  if (!provider) return false;

  const result = stmts.updateProvider.run(
    data.name || provider.name,
    data.description || provider.description,
    data.logo_url !== undefined ? data.logo_url : provider.logo_url,
    data.website !== undefined ? data.website : provider.website,
    data.api_base_url || provider.api_base_url,
    data.api_key ? encryptProviderSecret(data.api_key) : encryptProviderSecret(provider.api_key),
    data.contact_name || provider.contact_name,
    data.contact_email || provider.contact_email,
    data.contact_phone !== undefined ? data.contact_phone : provider.contact_phone,
    new Date().toISOString(),
    id
  );
  return result.changes > 0;
}

export function deleteProvider(id: string): boolean {
  const result = stmts.deleteProvider.run(id);
  return result.changes > 0;
}

// ========== Model Functions ==========

export function getAllProviderModels(): ProviderModel[] {
  const rows = stmts.getAllModels.all() as any[];
  return rows.map(parseModelRow);
}

export function getModelsByProvider(providerId: string): ProviderModel[] {
  const rows = stmts.getModelsByProvider.all(providerId) as any[];
  return rows.map(parseModelRow);
}

export function getModelsByStatus(status: string): ProviderModel[] {
  const rows = stmts.getModelsByStatus.all(status) as any[];
  return rows.map(parseModelRow);
}

export function getApprovedModelsWithProvider() {
  const rows = stmts.getApprovedModels.all() as any[];
  return rows.map((row) => ({
    ...parseModelRow(row),
    providerName: row.provider_name,
    providerSlug: row.provider_slug,
    apiBaseUrl: row.api_base_url,
    providerApiKey: row.provider_api_key,
  }));
}

export function getModelById(id: string): ProviderModel | null {
  const row = stmts.getModelById.get(id) as any;
  return row ? parseModelRow(row) : null;
}

export function getModelByModelId(modelId: string): (ProviderModel & { apiBaseUrl: string; providerApiKey: string }) | null {
  const row = stmts.getModelByModelId.get(modelId) as any;
  if (!row) return null;
  const provider = getProviderById(row.provider_id);
  if (!provider || provider.status !== "enabled") return null;
  return {
    ...parseModelRow(row),
    apiBaseUrl: provider.api_base_url,
    providerApiKey: provider.api_key,
  };
}

export function createModel(providerId: string, data: {
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
}): ProviderModel | null {
  // Check if model_id already exists
  if (stmts.getModelByModelId.get(data.model_id)) {
    return null;
  }

  const id = uuidv4();
  const now = new Date().toISOString();

  stmts.insertModel.run(
    id, providerId, data.model_id, data.name, data.description || "",
    data.category || "大语言模型", data.context_length || 4096,
    data.max_output || 4096, data.prompt_price || 0, data.completion_price || 0,
    JSON.stringify(data.tags || []), JSON.stringify(data.supported || ["文本"]),
    0, 1, "draft", now, now
  );

  return getModelById(id);
}

export function updateModel(id: string, data: {
  name?: string;
  description?: string;
  category?: string;
  context_length?: number;
  max_output?: number;
  prompt_price?: number;
  completion_price?: number;
  tags?: string[];
  supported?: string[];
}): boolean {
  const model = getModelById(id);
  if (!model) return false;

  const result = stmts.updateModel.run(
    data.name || model.name,
    data.description !== undefined ? data.description : model.description,
    data.category || model.category,
    data.context_length || model.context_length,
    data.max_output || model.max_output,
    data.prompt_price !== undefined ? data.prompt_price : model.prompt_price,
    data.completion_price !== undefined ? data.completion_price : model.completion_price,
    JSON.stringify(data.tags || model.tags),
    JSON.stringify(data.supported || model.supported),
    new Date().toISOString(),
    id
  );
  return result.changes > 0;
}

export function updateModelStatus(id: string, status: "draft" | "enabled" | "disabled"): boolean {
  const result = stmts.updateModelStatus.run(normalizeStatusForStorage(status), new Date().toISOString(), id);
  return result.changes > 0;
}

export function deleteModel(id: string): boolean {
  const result = stmts.deleteModel.run(id);
  return result.changes > 0;
}

// ========== Stats ==========

export function getProviderStats() {
  const rows = stmts.countProvidersByStatus.all() as any[];
  const stats: Record<string, number> = { draft: 0, enabled: 0, disabled: 0 };
  rows.forEach((r) => (stats[normalizeStatus(r.status)] = r.count));
  return stats;
}

export function getModelStats() {
  const rows = stmts.countModelsByStatus.all() as any[];
  const stats: Record<string, number> = { draft: 0, enabled: 0, disabled: 0 };
  rows.forEach((r) => (stats[normalizeStatus(r.status)] = r.count));
  return stats;
}

// ========== Helpers ==========

function parseModelRow(row: any): ProviderModel {
  return {
    ...row,
    status: normalizeStatus(row.status),
    tags: JSON.parse(row.tags || "[]"),
    supported: JSON.parse(row.supported || '["文本"]'),
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

// ========== Provider Capacity ==========

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

const capacityStmts = {
  getByProvider: db.prepare("SELECT * FROM provider_capacity WHERE provider_id = ?"),
  getByModel: db.prepare("SELECT * FROM provider_capacity WHERE model_id = ?"),
  getByProviderModel: db.prepare("SELECT * FROM provider_capacity WHERE provider_id = ? AND model_id = ?"),
  upsert: db.prepare(`
    INSERT INTO provider_capacity (id, provider_id, model_id, rpm_limit, tpm_limit, daily_limit, concurrent_limit, priority, weight, is_enabled, created_at, updated_at)
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
  `),
  delete: db.prepare("DELETE FROM provider_capacity WHERE provider_id = ? AND model_id = ?"),
  getAll: db.prepare(`
    SELECT pc.*, p.name as provider_name, pm.name as model_name
    FROM provider_capacity pc
    JOIN providers p ON pc.provider_id = p.id
    LEFT JOIN provider_models pm ON pc.model_id = pm.model_id
    ORDER BY pc.provider_id, pc.model_id
  `),
};

export function getCapacityByProvider(providerId: string): ProviderCapacity[] {
  const rows = capacityStmts.getByProvider.all(providerId) as any[];
  return rows.map((r) => ({ ...r, is_enabled: !!r.is_enabled }));
}

export function getCapacityByModel(modelId: string): ProviderCapacity[] {
  const rows = capacityStmts.getByModel.all(modelId) as any[];
  return rows.map((r) => ({ ...r, is_enabled: !!r.is_enabled }));
}

export function getCapacity(providerId: string, modelId: string): ProviderCapacity | null {
  const row = capacityStmts.getByProviderModel.get(providerId, modelId) as any;
  return row ? { ...row, is_enabled: !!row.is_enabled } : null;
}

export function getAllCapacity(): (ProviderCapacity & { provider_name: string; model_name: string })[] {
  const rows = capacityStmts.getAll.all() as any[];
  return rows.map((r) => ({ ...r, is_enabled: !!r.is_enabled }));
}

export function upsertCapacity(
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
): ProviderCapacity {
  const existing = getCapacity(providerId, modelId);
  const now = new Date().toISOString();
  const id = existing?.id || uuidv4();

  capacityStmts.upsert.run(
    id,
    providerId,
    modelId,
    data.rpm_limit ?? existing?.rpm_limit ?? 60,
    data.tpm_limit ?? existing?.tpm_limit ?? 100000,
    data.daily_limit ?? existing?.daily_limit ?? 10000,
    data.concurrent_limit ?? existing?.concurrent_limit ?? 10,
    data.priority ?? existing?.priority ?? 0,
    data.weight ?? existing?.weight ?? 100,
    data.is_enabled !== undefined ? (data.is_enabled ? 1 : 0) : (existing?.is_enabled ? 1 : 1),
    existing?.created_at || now,
    now
  );

  return getCapacity(providerId, modelId)!;
}

export function deleteCapacity(providerId: string, modelId: string): boolean {
  const result = capacityStmts.delete.run(providerId, modelId);
  return result.changes > 0;
}
