import { v4 as uuidv4 } from "uuid";
import db from "../db";

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

const stmts = {
  getById: db.prepare("SELECT * FROM async_tasks WHERE id = ?"),
  getByUpstream: db.prepare("SELECT * FROM async_tasks WHERE upstream_task_id = ?"),
  getByUser: db.prepare(
    "SELECT * FROM async_tasks WHERE user_id = ? ORDER BY created_at DESC LIMIT ?"
  ),
  getPending: db.prepare(
    "SELECT * FROM async_tasks WHERE status IN ('pending', 'running') ORDER BY created_at ASC"
  ),
  insert: db.prepare(`
    INSERT INTO async_tasks (id, user_id, api_key_id, type, model, provider, status, input, output, upstream_task_id, error_message, progress, cost, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `),
  updateStatus: db.prepare(`
    UPDATE async_tasks SET status = ?, progress = ?, updated_at = ? WHERE id = ?
  `),
  updateResult: db.prepare(`
    UPDATE async_tasks SET status = ?, output = ?, progress = ?, cost = ?, updated_at = ?, completed_at = ? WHERE id = ?
  `),
  updateError: db.prepare(`
    UPDATE async_tasks SET status = 'failed', error_message = ?, updated_at = ?, completed_at = ? WHERE id = ?
  `),
  updateUpstreamId: db.prepare(`
    UPDATE async_tasks SET upstream_task_id = ?, status = 'running', updated_at = ? WHERE id = ?
  `),
  getRecent: db.prepare(
    "SELECT * FROM async_tasks ORDER BY created_at DESC LIMIT ?"
  ),
};

function parseRow(row: any): AsyncTask {
  if (!row) return row;
  return {
    ...row,
    input: JSON.parse(row.input || "{}"),
    output: row.output ? JSON.parse(row.output) : null,
  };
}

export function createTask(params: {
  userId?: string | null;
  apiKeyId?: string | null;
  type: "image" | "video";
  model: string;
  provider: string;
  input: any;
}): AsyncTask {
  const id = uuidv4();
  const now = new Date().toISOString();

  stmts.insert.run(
    id,
    params.userId || null,
    params.apiKeyId || null,
    params.type,
    params.model,
    params.provider,
    "pending",
    JSON.stringify(params.input),
    null,
    null,
    null,
    0,
    0,
    now,
    now
  );

  return parseRow(stmts.getById.get(id));
}

export function getTaskById(id: string): AsyncTask | null {
  const row = stmts.getById.get(id) as any;
  return row ? parseRow(row) : null;
}

export function getTaskByUpstreamId(upstreamId: string): AsyncTask | null {
  const row = stmts.getByUpstream.get(upstreamId) as any;
  return row ? parseRow(row) : null;
}

export function getTasksByUser(userId: string, limit: number = 20): AsyncTask[] {
  const rows = stmts.getByUser.all(userId, limit) as any[];
  return rows.map(parseRow);
}

export function getPendingTasks(): AsyncTask[] {
  const rows = stmts.getPending.all() as any[];
  return rows.map(parseRow);
}

export function getRecentTasks(limit: number = 50): AsyncTask[] {
  const rows = stmts.getRecent.all(limit) as any[];
  return rows.map(parseRow);
}

export function setUpstreamTaskId(taskId: string, upstreamId: string): void {
  stmts.updateUpstreamId.run(upstreamId, new Date().toISOString(), taskId);
}

export function updateTaskStatus(taskId: string, status: string, progress: number): void {
  stmts.updateStatus.run(status, progress, new Date().toISOString(), taskId);
}

export function completeTask(taskId: string, output: any, cost: number = 0): void {
  const now = new Date().toISOString();
  stmts.updateResult.run("succeeded", JSON.stringify(output), 100, cost, now, now, taskId);
}

export function failTask(taskId: string, errorMessage: string): void {
  const now = new Date().toISOString();
  stmts.updateError.run(errorMessage, now, now, taskId);
}
