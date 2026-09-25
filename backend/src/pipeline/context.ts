/**
 * Shared state of one inference request as it moves through the pipeline
 * stages (see ./stages.ts). Stages communicate only through this object.
 */
import { randomUUID } from "crypto";
import type { Request, Response } from "express";
import type { AIModel } from "../data/models";
import type { ValidApiKey } from "../data/apikeys";
import type { BillingReservation } from "../data/billing";
import type { ResolvedUpstream } from "../services/upstream";
import type { ProviderRequestCapacityLease } from "../services/scheduler";
import type { UpstreamAdapter } from "./adapters";

export interface PipelineCaller {
  /** Billing subject (NULL only for legacy anonymous keys). */
  userId: string | null;
  parentUserId: string | null;
  apiKeyId: string | null;
  allowedModels: string | null;
  /** Explicit per-key RPM override; null inherits the account plan. */
  rateLimitOverride: number | null;
  apiKey: ValidApiKey | null;
  /** Identity recorded on async error logs (api key or session user). */
  errorIdentity: { id: string | null; user_id: string | null } | null;
  kind: "api_key" | "session";
}

export class InferenceContext {
  readonly logId: string = randomUUID();
  readonly startTime: number = Date.now();

  caller: PipelineCaller | null = null;
  modelId = "";
  model: AIModel | null = null;
  /** NF_CP_MODE=enforce: replacement of a retired model, for the 404 hint. */
  retiredReplacement: string | null = null;
  upstream: ResolvedUpstream | null = null;
  adapter: UpstreamAdapter | null = null;

  /** Account TPM reserved in reserveUserQuota; returned exactly once. */
  reservedTokens = 0;
  tokensReconciled = false;
  /** Remaining account/model QPM after reserveQpm, for response headers. */
  qpmRemaining: number | null = null;
  /** Result of the per-key consumer RPM check, for response headers. */
  consumerRemaining: number | null = null;

  billingReservation: BillingReservation | null = null;
  /** Once true, the reservation is settled by the handler, never released. */
  billableResponseReceived = false;

  providerLease: ProviderRequestCapacityLease | null = null;
  actualProviderTokens = 0;

  constructor(
    readonly route: string,
    readonly req: Request,
    readonly res: Response
  ) {}

  requireCaller(): PipelineCaller {
    if (!this.caller) throw new Error(`${this.route}: pipeline caller missing`);
    return this.caller;
  }

  requireModel(): AIModel {
    if (!this.model) throw new Error(`${this.route}: pipeline model missing`);
    return this.model;
  }

  requireUpstream(): ResolvedUpstream {
    if (!this.upstream) throw new Error(`${this.route}: pipeline upstream missing`);
    return this.upstream;
  }
}
