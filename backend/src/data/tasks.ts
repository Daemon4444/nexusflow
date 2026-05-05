import { v4 as uuidv4 } from "uuid";
import { db } from "../db/client";

export interface AsyncTask {
  id: string;
  user_id: string | null;
  api_key_id: string | null;
  type: "image" | "video";
  model: string;
  provider: string;
  status: "pending" | "running" | "succeeded" | "failed";
  input: any;
  output: any | null;
  upstream_task_id: string | null;
  error_message: string | null;
  progress: number;
  cost: number;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}

function parseRow(row: any): AsyncTask {
  return {
    ...row,
    input: typeof row.input === "string" ? JSON.parse(row.input || "{}") : row.input || {},
    output: row.output ? (typeof row.output === "string" ? JSON.parse(row.output) : row.output) : null,
  };
}

export async function createTask(params: {
  userId?: string | null;
  apiKeyId?: string | null;
  type: "image" | "video";
  model: string;
  provider: string;
  input: any;
}): Promise<AsyncTask> {
  const id = uuidv4();
  const now = new Date().toISOString();
  const row = await db.queryOne<any>(
    `INSERT INTO async_tasks (id, user_id, api_key_id, type, model, provider, status, input, output, upstream_task_id, error_message, progress, cost, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     RETURNING *`,
    [id, params.userId || null, params.apiKeyId || null, params.type, params.model, params.provider, "pending", JSON.stringify(params.input), null, null, null, 0, 0, now, now]
  );
  return parseRow(row);
}

export async function getTaskById(id: string): Promise<AsyncTask | null> {
  const row = await db.queryOne<any>("SELECT * FROM async_tasks WHERE id = ?", [id]);
  return row ? parseRow(row) : null;
}

export async function getTaskByUpstreamId(upstreamId: string): Promise<AsyncTask | null> {
  const row = await db.queryOne<any>("SELECT * FROM async_tasks WHERE upstream_task_id = ?", [upstreamId]);
  return row ? parseRow(row) : null;
}

export async function getTasksByUser(userId: string, limit: number = 20): Promise<AsyncTask[]> {
  const rows = await db.queryMany<any>("SELECT * FROM async_tasks WHERE user_id = ? ORDER BY created_at DESC LIMIT ?", [userId, limit]);
  return rows.map(parseRow);
}

export async function getPendingTasks(): Promise<AsyncTask[]> {
  const rows = await db.queryMany<any>("SELECT * FROM async_tasks WHERE status IN ('pending', 'running') ORDER BY created_at ASC");
  return rows.map(parseRow);
}

export async function getRecentTasks(limit: number = 50): Promise<AsyncTask[]> {
  const rows = await db.queryMany<any>("SELECT * FROM async_tasks ORDER BY created_at DESC LIMIT ?", [limit]);
  return rows.map(parseRow);
}

export async function setUpstreamTaskId(taskId: string, upstreamId: string): Promise<void> {
  await db.execute("UPDATE async_tasks SET upstream_task_id = ?, status = 'running', updated_at = ? WHERE id = ?", [
    upstreamId,
    new Date().toISOString(),
    taskId,
  ]);
}

export async function updateTaskStatus(taskId: string, status: string, progress: number): Promise<void> {
  await db.execute("UPDATE async_tasks SET status = ?, progress = ?, updated_at = ? WHERE id = ?", [
    status,
    progress,
    new Date().toISOString(),
    taskId,
  ]);
}

export async function completeTask(taskId: string, output: any, cost: number = 0): Promise<void> {
  const now = new Date().toISOString();
  await db.execute("UPDATE async_tasks SET status = ?, output = ?, progress = ?, cost = ?, updated_at = ?, completed_at = ? WHERE id = ?", [
    "succeeded",
    JSON.stringify(output),
    100,
    cost,
    now,
    now,
    taskId,
  ]);
}

export async function failTask(taskId: string, errorMessage: string): Promise<void> {
  const now = new Date().toISOString();
  await db.execute("UPDATE async_tasks SET status = 'failed', error_message = ?, updated_at = ?, completed_at = ? WHERE id = ?", [
    errorMessage,
    now,
    now,
    taskId,
  ]);
}
