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
  const row = await db.queryOne<Ticket>(
    `INSERT INTO tickets (id, user_id, type, subject, description, model, requested_qpm, requested_tpm)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     RETURNING *`,
    [uuid(), data.userId, data.type, data.subject, data.description, data.model ?? null, data.requestedQpm ?? null, data.requestedTpm ?? null]
  );
  return row!;
}

export async function getUserTickets(userId: string): Promise<Ticket[]> {
  return db.queryMany<Ticket>("SELECT * FROM tickets WHERE user_id = ? ORDER BY created_at DESC", [userId]);
}

export async function getTicket(ticketId: string, userId: string): Promise<Ticket | null> {
  return db.queryOne<Ticket>("SELECT * FROM tickets WHERE id = ? AND user_id = ?", [ticketId, userId]);
}

export async function getAllTickets(status?: string): Promise<Ticket[]> {
  if (status) {
    return db.queryMany<Ticket>("SELECT * FROM tickets WHERE status = ? ORDER BY created_at DESC", [status]);
  }
  return db.queryMany<Ticket>("SELECT * FROM tickets ORDER BY created_at DESC");
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
