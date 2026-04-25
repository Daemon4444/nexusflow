import db from "../db";
import { v4 as uuid } from "uuid";

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

/** Create a new ticket */
export function createTicket(data: {
  userId: string;
  type: string;
  subject: string;
  description: string;
  model?: string;
  requestedQpm?: number;
  requestedTpm?: number;
}): Ticket {
  const id = uuid();
  db.prepare(`
    INSERT INTO tickets (id, user_id, type, subject, description, model, requested_qpm, requested_tpm)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, data.userId, data.type, data.subject, data.description, data.model ?? null, data.requestedQpm ?? null, data.requestedTpm ?? null);

  return db.prepare("SELECT * FROM tickets WHERE id = ?").get(id) as Ticket;
}

/** Get all tickets for a user */
export function getUserTickets(userId: string): Ticket[] {
  return db.prepare("SELECT * FROM tickets WHERE user_id = ? ORDER BY created_at DESC").all(userId) as Ticket[];
}

/** Get a single ticket (with user ownership check) */
export function getTicket(ticketId: string, userId: string): Ticket | undefined {
  return db.prepare("SELECT * FROM tickets WHERE id = ? AND user_id = ?").get(ticketId, userId) as Ticket | undefined;
}

/** Admin: get all tickets with optional status filter */
export function getAllTickets(status?: string): Ticket[] {
  if (status) {
    return db.prepare("SELECT * FROM tickets WHERE status = ? ORDER BY created_at DESC").all(status) as Ticket[];
  }
  return db.prepare("SELECT * FROM tickets ORDER BY created_at DESC").all() as Ticket[];
}

/** Admin: reply and update ticket status */
export function replyTicket(ticketId: string, reply: string, status: string): Ticket | undefined {
  const resolvedAt = status === "resolved" || status === "rejected" ? new Date().toISOString() : null;
  db.prepare(`
    UPDATE tickets SET admin_reply = ?, status = ?, resolved_at = ?, updated_at = datetime('now')
    WHERE id = ?
  `).run(reply, status, resolvedAt, ticketId);

  return db.prepare("SELECT * FROM tickets WHERE id = ?").get(ticketId) as Ticket | undefined;
}
