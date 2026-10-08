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

  /** True once the client went away before the response finished. */
  clientClosed = false;
  private clientAbort: AbortController | null = null;

  /**
   * error_code for a request that ended in an exception. A client disconnect
   * aborts the upstream call too, so the exception is ours, not the
   * provider's: record it as client_closed so it never counts as a route fault.
   */
  failureErrorCode(): "client_closed" | "upstream_error" {
    return this.clientClosed ? "client_closed" : "upstream_error";
  }

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

  /**
   * Aborts when the client disconnects before the response has finished, so
   * the upstream call stops instead of generating (and being billed for)
   * output nobody receives. Registered lazily by invokeUpstream.
   */
  clientSignal(): AbortSignal {
    if (this.clientAbort) return this.clientAbort.signal;
    const controller = new AbortController();
    this.clientAbort = controller;
    const res = this.res as Response & { writableEnded?: boolean; writableFinished?: boolean; destroyed?: boolean };
    const abortIfUnfinished = () => {
      // Once the handler called res.end() the response is complete from our
      // side; a close racing the final flush is not a client cancellation.
      if (res.writableEnded || res.writableFinished || controller.signal.aborted) return;
      this.clientClosed = true;
      const reason = new Error("client_closed");
      reason.name = "ClientClosedError";
      controller.abort(reason);
    };
    if (typeof res.once === "function") res.once("close", abortIfUnfinished);
    // req.destroyed is not a disconnect signal: Node auto-destroys the request
    // stream once its body has been read. Check the response and the socket.
    if (res.destroyed || this.req.socket?.destroyed) abortIfUnfinished();
    return controller.signal;
  }

  requireUpstream(): ResolvedUpstream {
    if (!this.upstream) throw new Error(`${this.route}: pipeline upstream missing`);
    return this.upstream;
  }
}
