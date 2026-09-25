/**
 * Operator notifications.
 *
 * `notify()` is the single entry point used by jobs such as the backup
 * freshness check, the Bailian catalog sync, route probes and the control
 * plane. The default implementation only writes a structured log line. A
 * Feishu direct-message implementation exists but is off unless explicitly
 * configured; group webhooks are intentionally not supported.
 *
 * Configuration (all optional):
 *   NF_NOTIFIER=log|feishu_dm           default log
 *   FEISHU_APP_ID / FEISHU_APP_SECRET   self-built app credentials
 *   FEISHU_NOTIFY_OPEN_IDS              comma-separated recipient open_ids
 *   NF_NOTIFIER_DEDUPE_SECONDS          default 600
 *
 * Event bodies must never contain secrets, customer data or request content.
 */
import { safeNotifierFetch } from "./outbound-url-policy";

export type NotifySeverity = "info" | "warning" | "critical";

export interface NotifyEvent {
  severity: NotifySeverity;
  /** Machine-readable category, e.g. "backup_stale", "bailian_catalog_diff". */
  kind: string;
  title: string;
  body: string;
  /** Events with the same key are delivered at most once per dedupe window. */
  dedupeKey: string;
}

export interface NotifyResult {
  delivered: boolean;
  channel: "log" | "feishu_dm";
  deduped?: boolean;
  error?: string;
}

export interface Notifier {
  readonly channel: "log" | "feishu_dm";
  send(event: NotifyEvent): Promise<void>;
}

type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

const MAX_TITLE = 200;
const MAX_BODY = 4_000;

function bounded(value: string, limit: number): string {
  const text = String(value ?? "").replace(/\u0000/g, "");
  return text.length > limit ? `${text.slice(0, limit - 1)}…` : text;
}

export class LogNotifier implements Notifier {
  readonly channel = "log" as const;
  constructor(private readonly write: (line: string) => void = (line) => console.warn(line)) {}

  async send(event: NotifyEvent): Promise<void> {
    this.write(JSON.stringify({
      component: "notifier",
      severity: event.severity,
      kind: event.kind,
      title: bounded(event.title, MAX_TITLE),
      body: bounded(event.body, MAX_BODY),
      dedupeKey: event.dedupeKey,
      at: new Date().toISOString(),
    }));
  }
}

export interface FeishuDirectMessageConfig {
  appId: string;
  appSecret: string;
  openIds: string[];
  fetcher?: FetchLike;
}

/**
 * Sends a text direct message to each configured open_id through the Feishu
 * open platform (tenant access token + im/v1/messages). Never a group webhook.
 */
export class FeishuDirectMessageNotifier implements Notifier {
  readonly channel = "feishu_dm" as const;
  private token: { value: string; expiresAt: number } | null = null;
  private readonly fetcher: FetchLike;

  constructor(private readonly config: FeishuDirectMessageConfig) {
    if (!config.appId || !config.appSecret) {
      throw new Error("Feishu notifier requires an app id and secret");
    }
    if (!config.openIds.length || config.openIds.some((id) => !/^ou_[A-Za-z0-9]+$/.test(id))) {
      throw new Error("Feishu notifier requires recipient open_ids (ou_...)");
    }
    this.fetcher = config.fetcher || ((url, init) => safeNotifierFetch(url, init));
  }

  private async tenantToken(): Promise<string> {
    if (this.token && this.token.expiresAt > Date.now() + 60_000) return this.token.value;
    const response = await this.fetcher(
      "https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal",
      {
        method: "POST",
        headers: { "Content-Type": "application/json; charset=utf-8" },
        body: JSON.stringify({ app_id: this.config.appId, app_secret: this.config.appSecret }),
      }
    );
    const payload = await response.json().catch(() => null) as
      | { code?: number; tenant_access_token?: string; expire?: number }
      | null;
    if (!response.ok || !payload || payload.code !== 0 || !payload.tenant_access_token) {
      throw new Error(`feishu_token_failed:${response.status}:${payload?.code ?? "invalid"}`);
    }
    this.token = {
      value: payload.tenant_access_token,
      expiresAt: Date.now() + Math.max(60, Number(payload.expire) || 3600) * 1000,
    };
    return this.token.value;
  }

  async send(event: NotifyEvent): Promise<void> {
    const token = await this.tenantToken();
    const text = `[${event.severity.toUpperCase()}] ${bounded(event.title, MAX_TITLE)}\n${bounded(event.body, MAX_BODY)}`;
    for (const openId of this.config.openIds) {
      const response = await this.fetcher(
        "https://open.feishu.cn/open-apis/im/v1/messages?receive_id_type=open_id",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json; charset=utf-8",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            receive_id: openId,
            msg_type: "text",
            content: JSON.stringify({ text }),
          }),
        }
      );
      const payload = await response.json().catch(() => null) as { code?: number } | null;
      if (!response.ok || !payload || payload.code !== 0) {
        throw new Error(`feishu_send_failed:${response.status}:${payload?.code ?? "invalid"}`);
      }
    }
  }
}

export function createNotifierFromEnv(env: NodeJS.ProcessEnv = process.env): Notifier {
  if ((env.NF_NOTIFIER || "log").trim() !== "feishu_dm") return new LogNotifier();
  return new FeishuDirectMessageNotifier({
    appId: (env.FEISHU_APP_ID || "").trim(),
    appSecret: (env.FEISHU_APP_SECRET || "").trim(),
    openIds: (env.FEISHU_NOTIFY_OPEN_IDS || "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
  });
}

let activeNotifier: Notifier | null = null;
const recentlySent = new Map<string, number>();

/** Test hook and explicit wiring point. */
export function setNotifier(notifier: Notifier | null): void {
  activeNotifier = notifier;
  recentlySent.clear();
}

function dedupeWindowMs(): number {
  const seconds = Number(process.env.NF_NOTIFIER_DEDUPE_SECONDS);
  return (Number.isFinite(seconds) && seconds >= 0 ? seconds : 600) * 1000;
}

/**
 * Delivers an operator notification. It never throws: a failing channel falls
 * back to the log notifier so the calling job is not interrupted. Dedupe is
 * per process; jobs that run on several nodes should use a node-stable key and
 * run from a single scheduler.
 */
export async function notify(event: NotifyEvent): Promise<NotifyResult> {
  let notifier: Notifier;
  try {
    notifier = activeNotifier || (activeNotifier = createNotifierFromEnv());
  } catch (error) {
    notifier = new LogNotifier();
    console.error(
      "[notifier] configuration invalid, falling back to log:",
      error instanceof Error ? error.message : String(error)
    );
  }
  const now = Date.now();
  for (const [key, sentAt] of recentlySent) {
    if (now - sentAt > dedupeWindowMs()) recentlySent.delete(key);
  }
  if (event.dedupeKey && recentlySent.has(event.dedupeKey)) {
    return { delivered: false, channel: notifier.channel, deduped: true };
  }
  try {
    await notifier.send(event);
    if (event.dedupeKey) recentlySent.set(event.dedupeKey, now);
    return { delivered: true, channel: notifier.channel };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await new LogNotifier().send({
      ...event,
      title: `${event.title} (delivery via ${notifier.channel} failed: ${message})`,
    });
    return { delivered: false, channel: notifier.channel, error: message };
  }
}
