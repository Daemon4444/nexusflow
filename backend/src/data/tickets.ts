import { v4 as uuid } from "uuid";
import { db } from "../db/client";

export interface Ticket {
  id: string;
  user_id: string;
  type: string;
  subject: string;
  description: string;
  model: string | null;
  requested_qpm: number | null;
  requested_tpm: number | null;
  status: string;
  admin_reply: string | null;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
  user_email?: string | null;
  user_nickname?: string | null;
}

export const MAX_OPEN_TICKETS_PER_USER = 5;
export const MAX_TICKET_HISTORY_PER_USER = 500;

export class TicketLimitError extends Error {
  constructor(
    public readonly code: "open_ticket_limit" | "ticket_history_limit" | "user_not_found"
  ) {
    super(code);
    this.name = "TicketLimitError";
  }
}

export async function createTicket(data: {
  userId: string;
  type: string;
  subject: string;
  description: string;
  model?: string;
  requestedQpm?: number;
  requestedTpm?: number;
}): Promise<Ticket> {
  return db.transaction(async (client) => {
    const user = await client.queryOne<{ id: string }>(
      "SELECT id FROM users WHERE id = ? FOR UPDATE",
      [data.userId]
    );
    if (!user) throw new TicketLimitError("user_not_found");
    const counts = await client.queryOne<{
      total_count: number | string;
      open_count: number | string;
    }>(
      `SELECT
         COUNT(*)::int AS total_count,
         COALESCE(
           SUM(CASE WHEN status IN ('open', 'in_progress') THEN 1 ELSE 0 END),
           0
         )::int AS open_count
       FROM tickets
       WHERE user_id = ?`,
      [data.userId]
    );
    if (Number(counts?.open_count || 0) >= MAX_OPEN_TICKETS_PER_USER) {
      throw new TicketLimitError("open_ticket_limit");
    }
    if (Number(counts?.total_count || 0) >= MAX_TICKET_HISTORY_PER_USER) {
      throw new TicketLimitError("ticket_history_limit");
    }
    const row = await client.queryOne<Ticket>(
      `INSERT INTO tickets (
         id, user_id, type, subject, description, model,
         requested_qpm, requested_tpm
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       RETURNING *`,
      [
        uuid(),
        data.userId,
        data.type,
        data.subject,
        data.description,
        data.model ?? null,
        data.requestedQpm ?? null,
        data.requestedTpm ?? null,
      ]
    );
    return row!;
  });
}

export async function getUserTickets(
  userId: string,
  limit = 100,
  offset = 0
): Promise<Ticket[]> {
  return db.queryMany<Ticket>(
    `SELECT id, user_id, type, subject, description, model, requested_qpm,
            requested_tpm, status, admin_reply, resolved_at, created_at, updated_at
       FROM tickets
      WHERE user_id = ?
      ORDER BY created_at DESC, id DESC
      LIMIT ? OFFSET ?`,
    [
      userId,
      Math.max(1, Math.min(100, Math.floor(limit))),
      Math.max(0, Math.floor(offset)),
    ]
  );
}

export async function getTicket(ticketId: string, userId: string): Promise<Ticket | null> {
  return db.queryOne<Ticket>("SELECT * FROM tickets WHERE id = ? AND user_id = ?", [ticketId, userId]);
}

export async function getAdminTicketsPage(params: {
  status?: string;
  query?: string;
  limit?: number;
  offset?: number;
} = {}): Promise<{ items: Ticket[]; total: number }> {
  const clauses: string[] = [];
  const values: any[] = [];
  if (params.status) {
    clauses.push("t.status = ?");
    values.push(params.status);
  }
  if (params.query?.trim()) {
    clauses.push(
      "(t.id LIKE ? OR t.user_id LIKE ? OR t.subject LIKE ? OR t.description LIKE ? OR t.model LIKE ? OR u.email LIKE ? OR u.nickname LIKE ?)"
    );
    const pattern = `%${params.query.trim()}%`;
    values.push(pattern, pattern, pattern, pattern, pattern, pattern, pattern);
  }
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const limit = Math.max(1, Math.min(100, Math.floor(params.limit || 50)));
  const offset = Math.max(0, Math.floor(params.offset || 0));
  const count = await db.queryOne<{ count: number | string }>(
    `SELECT COUNT(*)::int AS count
       FROM tickets t
       LEFT JOIN users u ON u.id = t.user_id
       ${where}`,
    values
  );
  const items = await db.queryMany<Ticket>(
    `SELECT t.*, u.email AS user_email, u.nickname AS user_nickname
       FROM tickets t
       LEFT JOIN users u ON u.id = t.user_id
       ${where}
      ORDER BY t.created_at DESC, t.id DESC
      LIMIT ? OFFSET ?`,
    [...values, limit, offset]
  );
  return { items, total: Number(count?.count || 0) };
}

export async function getAllTickets(
  status?: string,
  limit = 100,
  offset = 0
): Promise<Ticket[]> {
  return (
    await getAdminTicketsPage({ status, limit, offset })
  ).items;
}

export async function getAdminTicket(ticketId: string): Promise<Ticket | null> {
  return db.queryOne<Ticket>(
    `SELECT t.*, u.email AS user_email, u.nickname AS user_nickname
       FROM tickets t
       LEFT JOIN users u ON u.id = t.user_id
      WHERE t.id = ?`,
    [ticketId]
  );
}

export async function replyTicket(ticketId: string, reply: string, status: string): Promise<Ticket | null> {
  const resolvedAt = status === "resolved" || status === "rejected" ? new Date().toISOString() : null;
  return db.queryOne<Ticket>(
    `UPDATE tickets SET admin_reply = ?, status = ?, resolved_at = ?, updated_at = ?
     WHERE id = ?
     RETURNING *`,
    [reply, status, resolvedAt, new Date().toISOString(), ticketId]
  );
}
