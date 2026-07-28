import crypto from "crypto";
import { v4 as uuidv4 } from "uuid";
import { db } from "../db/client";
import { AdminAuditEvent, writeAdminAuditEvent } from "./admin-audit";
import type { Transaction } from "./billing";

export type AdminAdjustmentKind = "balance" | "credit";

export interface AdminAdjustmentResult {
  kind: AdminAdjustmentKind;
  userId: string;
  balance: number;
  creditBalance: number;
  transaction: Transaction;
  replayed: boolean;
}

export class AdminAdjustmentError extends Error {
  constructor(
    message: string,
    readonly status = 400,
    readonly code = "admin_adjustment_invalid"
  ) {
    super(message);
    this.name = "AdminAdjustmentError";
  }
}

function money(value: unknown): number {
  return Math.round(Number(value || 0) * 1_000_000) / 1_000_000;
}

function parseJson(value: unknown): any {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function resultFromAudit(audit: AdminAuditEvent | null): AdminAdjustmentResult | null {
  if (!audit) return null;
  const after = parseJson(audit.after_data);
  if (!after || typeof after !== "object" || !after.transaction) return null;
  return {
    ...after,
    balance: Number(after.balance),
    creditBalance: Number(after.creditBalance),
    replayed: true,
  } as AdminAdjustmentResult;
}

function payloadFingerprint(payload: {
  kind: AdminAdjustmentKind;
  userId: string;
  amountDelta: number;
  reason: string;
}): string {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(payload))
    .digest("hex");
}

function replayOrConflict(
  audit: AdminAuditEvent | null,
  expectedFingerprint: string
): AdminAdjustmentResult | null {
  if (!audit) return null;
  const metadata = parseJson(audit.metadata);
  if (
    !metadata
    || typeof metadata !== "object"
    || metadata.payloadFingerprint !== expectedFingerprint
  ) {
    throw new AdminAdjustmentError(
      "Idempotency-Key 已用于不同的调账请求",
      409,
      "idempotency_conflict"
    );
  }
  return resultFromAudit(audit);
}

async function findSuccessfulAdjustmentAudit(
  actorUserId: string,
  action: string,
  idempotencyKey: string
): Promise<AdminAuditEvent | null> {
  return db.queryOne<AdminAuditEvent>(
    `SELECT *
       FROM admin_audit_events
      WHERE actor_user_id = ?
        AND action = ?
        AND idempotency_key = ?
        AND outcome = 'success'
      ORDER BY created_at DESC
      LIMIT 1`,
    [actorUserId, action, idempotencyKey]
  );
}

/**
 * Mutates the real customer ledger exactly once for an actor/action/key tuple.
 *
 * The balance row, ledger transaction and successful audit event are committed
 * in one database transaction. The audit table's unique partial index is the
 * final concurrency guard, so racing retries cannot apply the delta twice.
 */
export async function applyAdminAdjustment(params: {
  kind: AdminAdjustmentKind;
  userId: string;
  amountDelta: number;
  reason: string;
  idempotencyKey: string;
  actorUserId: string;
  actorRole: string;
  actorEmail: string | null;
  requestId: string;
  ipAddress: string | null;
  userAgent: string | null;
}): Promise<AdminAdjustmentResult> {
  const delta = money(params.amountDelta);
  const reason = params.reason.trim();
  const userId = params.userId.trim();
  const idempotencyKey = params.idempotencyKey.trim().slice(0, 200);
  if (!Number.isFinite(delta) || delta === 0) {
    throw new AdminAdjustmentError("amountDelta 必须是非 0 数字");
  }
  if (Math.abs(delta) > 100_000) {
    throw new AdminAdjustmentError("单次调整金额不能超过 100000 元");
  }
  if (reason.length < 3) {
    throw new AdminAdjustmentError("操作原因至少需要 3 个字符", 400, "admin_reason_required");
  }
  if (!idempotencyKey) {
    throw new AdminAdjustmentError("缺少 Idempotency-Key", 400, "idempotency_key_required");
  }

  const action = params.kind === "balance" ? "finance.balance.adjust" : "finance.credit.adjust";
  const fingerprint = payloadFingerprint({
    kind: params.kind,
    userId,
    amountDelta: delta,
    reason,
  });
  const previous = replayOrConflict(
    await findSuccessfulAdjustmentAudit(params.actorUserId, action, idempotencyKey),
    fingerprint
  );
  if (previous) return previous;

  try {
    return await db.transaction(async (client) => {
      const existingAudit = await client.queryOne<AdminAuditEvent>(
        `SELECT *
           FROM admin_audit_events
          WHERE actor_user_id = ?
            AND action = ?
            AND idempotency_key = ?
            AND outcome = 'success'
          LIMIT 1`,
        [params.actorUserId, action, idempotencyKey]
      );
      const replay = replayOrConflict(existingAudit, fingerprint);
      if (replay) return replay;

      const user = await client.queryOne<{
        id: string;
        balance: string | number;
        credit_balance: string | number;
        parent_user_id: string | null;
      }>(
        "SELECT id, balance, credit_balance, parent_user_id FROM users WHERE id = ? FOR UPDATE",
        [userId]
      );
      if (!user) {
        throw new AdminAdjustmentError("用户不存在", 404, "customer_not_found");
      }
      if (user.parent_user_id) {
        throw new AdminAdjustmentError("子账号没有独立资金账户，不能直接调账", 400, "subaccount_adjustment_forbidden");
      }

      const before = {
        balance: money(user.balance),
        creditBalance: money(user.credit_balance),
      };
      const after = {
        balance: params.kind === "balance" ? money(before.balance + delta) : before.balance,
        creditBalance: params.kind === "credit" ? money(before.creditBalance + delta) : before.creditBalance,
      };
      if (after.balance < 0 || after.creditBalance < 0) {
        throw new AdminAdjustmentError(
          params.kind === "balance" ? "调整后余额不能为负" : "调整后信控不能为负",
          400,
          "negative_account_balance"
        );
      }

      const now = new Date().toISOString();
      if (params.kind === "balance") {
        await client.execute(
          "UPDATE users SET balance = ?, updated_at = ? WHERE id = ?",
          [after.balance, now, userId]
        );
      } else {
        await client.execute(
          "UPDATE users SET credit_balance = ?, updated_at = ? WHERE id = ?",
          [after.creditBalance, now, userId]
        );
      }

      const refHash = crypto
        .createHash("sha256")
        .update(`${params.actorUserId}:${action}:${idempotencyKey}`)
        .digest("hex")
        .slice(0, 40);
      const transaction = await client.queryOne<Transaction>(
        `INSERT INTO transactions (
           id, user_id, actor_user_id, type, amount, balance_after,
           credit_amount, credit_after, description, ref_id, created_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         RETURNING *`,
        [
          uuidv4(),
          userId,
          params.actorUserId,
          params.kind === "balance" ? "admin_adjustment" : "credit_adjustment",
          delta,
          after.balance,
          params.kind === "credit" ? delta : 0,
          after.creditBalance,
          reason,
          `admin-idem:${refHash}`,
          now,
        ]
      );
      const result: AdminAdjustmentResult = {
        kind: params.kind,
        userId,
        balance: after.balance,
        creditBalance: after.creditBalance,
        transaction: transaction!,
        replayed: false,
      };

      await writeAdminAuditEvent(
        {
          actorUserId: params.actorUserId,
          actorRole: params.actorRole,
          actorEmail: params.actorEmail,
          requestId: params.requestId,
          idempotencyKey,
          action,
          resourceType: "customer_ledger",
          resourceId: userId,
          outcome: "success",
          reason,
          ipAddress: params.ipAddress,
          userAgent: params.userAgent,
          beforeData: before,
          afterData: result,
          metadata: {
            amountDelta: delta,
            kind: params.kind,
            userId,
            payloadFingerprint: fingerprint,
          },
        },
        client
      );
      return result;
    });
  } catch (error) {
    // If another request won the unique idempotency race, its transaction is
    // now the authoritative response. Any other error is propagated.
    const replay = replayOrConflict(
      await findSuccessfulAdjustmentAudit(params.actorUserId, action, idempotencyKey),
      fingerprint
    );
    if (replay) return replay;
    throw error;
  }
}
