/**
 * Provider CLIs under the control plane (P6). When NF_CP_MODE is not
 * legacy, himodels-control and azure-astra-control no longer write
 * providers/provider_capacity state: they open a change request (validated,
 * then approved and published by an administrator in the console).
 * Credentials are still stored in the providers table, which remains the
 * secret store (cp accounts carry secret_ref only).
 */
import { getCurrentVersion } from "./store";
import { openChangeRequest, runValidation } from "./change-requests";
import type { ChangeOperation, ChangeRequestRecord } from "./store";
import type { ControlPlaneContent, CpRoute } from "./schema";

export interface RouteTarget {
  modelId: string;
  upstreamModelId: string;
  nativeProtocols: CpRoute["native_protocols"];
  limits: { rpm: number; tpm: number; daily: number; concurrency: number; priority: number; weight: number };
}

/** Operations setting an account and its routes to a status. */
export function accountRouteOperations(
  content: ControlPlaneContent,
  accountId: string,
  accountStatus: "active" | "disabled",
  routes: RouteTarget[],
  routeStatus: CpRoute["status"]
): ChangeOperation[] {
  const account = content.accounts.find((item) => item.id === accountId);
  if (!account) throw new Error(`account ${accountId} is not in the current control-plane version; add it through the console first`);
  const operations: ChangeOperation[] = [];
  if (account.status !== accountStatus) {
    operations.push({ op: "upsert", entity: "account", id: accountId, value: { ...account, status: accountStatus } });
  }
  for (const target of routes) {
    const id = `${accountId}:${target.modelId}`;
    const existing = content.routes.find((route) => route.id === id);
    const value: CpRoute = existing
      ? { ...existing, status: routeStatus }
      : {
        id,
        model_id: target.modelId,
        account_id: accountId,
        upstream_model_id: target.upstreamModelId,
        native_protocols: target.nativeProtocols,
        priority: target.limits.priority,
        weight: target.limits.weight,
        quota_pool_id: null,
        rpm: target.limits.rpm,
        tpm: target.limits.tpm,
        concurrency: target.limits.concurrency,
        daily: target.limits.daily,
        status: routeStatus,
      };
    if (!existing || existing.status !== routeStatus) operations.push({ op: "upsert", entity: "route", id, value });
  }
  return operations;
}

/** Opens and validates a change request; prints its id for the console. */
export async function proposeChange(params: {
  title: string;
  reason: string;
  author: string;
  source: string;
  build: (content: ControlPlaneContent) => ChangeOperation[];
}): Promise<ChangeRequestRecord | null> {
  const current = await getCurrentVersion();
  if (!current) throw new Error("NF_CP_MODE is not legacy but no control-plane version is published; run the backfill first");
  const changes = params.build(current.content);
  if (!changes.length) return null;
  const record = await openChangeRequest({ title: params.title, reason: params.reason, changes, author: params.author, source: params.source });
  return runValidation(record.id);
}
