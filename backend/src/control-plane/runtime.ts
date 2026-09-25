/**
 * Control-plane runtime: the in-memory copy of the current published
 * version, with per-request lookups that need no database round trip.
 *
 * - Loaded whole, zod-validated, then swapped atomically (never mixed).
 * - The version number is polled every 5 s; a changed number triggers a
 *   full reload.
 * - A failed load keeps the previous snapshot and notifies; the runtime
 *   never clears configuration.
 * Only started when NF_CP_MODE is shadow or enforce.
 */
import type { AIModel } from "../data/models";
import { logToSLS } from "../services/sls";
import { notify } from "../services/notifier";
import { aiModelFromCp } from "./mapping";
import type {
  ControlPlaneContent,
  CpAccount,
  CpModel,
  CpQuotaPool,
  CpRoute,
  CpTrafficPolicy,
} from "./schema";
import { getCurrentVersion, getCurrentVersionNumber } from "./store";

export interface LoadedControlPlane {
  version: number;
  sha256: string;
  loadedAt: number;
  content: ControlPlaneContent;
  models: Map<string, CpModel>;
  aiModels: Map<string, AIModel>;
  accounts: Map<string, CpAccount>;
  pools: Map<string, CpQuotaPool>;
  routesByModel: Map<string, CpRoute[]>;
  policies: Map<string, CpTrafficPolicy>;
}

export function indexContent(version: number, sha256: string, content: ControlPlaneContent): LoadedControlPlane {
  const routesByModel = new Map<string, CpRoute[]>();
  for (const route of content.routes) {
    const list = routesByModel.get(route.model_id) || [];
    list.push(route);
    routesByModel.set(route.model_id, list);
  }
  for (const list of routesByModel.values()) {
    list.sort((a, b) => b.priority - a.priority || b.weight - a.weight || a.id.localeCompare(b.id));
  }
  return {
    version,
    sha256,
    loadedAt: Date.now(),
    content,
    models: new Map(content.models.map((model) => [model.id, model])),
    aiModels: new Map(content.models.map((model) => [model.id, aiModelFromCp(model)])),
    accounts: new Map(content.accounts.map((account) => [account.id, account])),
    pools: new Map(content.pools.map((pool) => [pool.id, pool])),
    routesByModel,
    policies: new Map(content.policies.map((policy) => [policy.scope, policy])),
  };
}

type Loader = {
  currentVersionNumber: () => Promise<number | null>;
  currentVersion: typeof getCurrentVersion;
};

export class ControlPlaneRuntime {
  private snapshot: LoadedControlPlane | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private loading: Promise<void> | null = null;
  private consecutiveFailures = 0;
  private readonly listeners: Array<(snapshot: LoadedControlPlane) => void> = [];

  constructor(
    private readonly loader: Loader = { currentVersionNumber: getCurrentVersionNumber, currentVersion: getCurrentVersion },
    private readonly onFailure: (message: string) => Promise<void> | void = defaultFailureHandler
  ) {}

  get(): LoadedControlPlane | null {
    return this.snapshot;
  }

  /** Test/bootstrap hook: install an already-validated snapshot. */
  install(snapshot: LoadedControlPlane | null): void {
    this.snapshot = snapshot;
    if (snapshot) this.emit(snapshot);
  }

  /** Called after every successful load (e.g. to rebuild the catalog). */
  onLoaded(listener: (snapshot: LoadedControlPlane) => void): void {
    this.listeners.push(listener);
  }

  private emit(snapshot: LoadedControlPlane): void {
    for (const listener of this.listeners) {
      try {
        listener(snapshot);
      } catch (error) {
        console.warn(`[control-plane] listener failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }

  /** Reloads when the published version differs from the loaded one. Never throws. */
  async refresh(): Promise<void> {
    if (this.loading) return this.loading;
    this.loading = (async () => {
      try {
        const latest = await this.loader.currentVersionNumber();
        if (latest === null) return; // nothing published yet: stay empty
        if (this.snapshot && this.snapshot.version === latest) return;
        const version = await this.loader.currentVersion();
        if (!version) return;
        this.snapshot = indexContent(version.version, version.contentSha256, version.content);
        this.consecutiveFailures = 0;
        this.emit(this.snapshot);
        logToSLS({ status: "info", component: "control_plane", event: "version_loaded", version: version.version });
      } catch (error) {
        this.consecutiveFailures += 1;
        const message = error instanceof Error ? error.message : String(error);
        // Keep serving the previous snapshot; never clear configuration.
        await this.onFailure(`control-plane load failed (attempt ${this.consecutiveFailures}), keeping version ${this.snapshot?.version ?? "none"}: ${message.slice(0, 300)}`);
      } finally {
        this.loading = null;
      }
    })();
    return this.loading;
  }

  start(intervalMs = 5_000): void {
    if (this.timer) return;
    void this.refresh();
    this.timer = setInterval(() => void this.refresh(), intervalMs);
    if (typeof this.timer.unref === "function") this.timer.unref();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }
}

async function defaultFailureHandler(message: string): Promise<void> {
  console.error(`[control-plane] ${message}`);
  try {
    logToSLS({ status: "error", component: "control_plane", errorCode: "control_plane_load_failed", errorReason: message });
  } catch {
    // ignore
  }
  await notify({
    severity: "warning",
    kind: "control_plane_load_failed",
    title: "控制面配置加载失败，继续使用上一版",
    body: message,
    dedupeKey: "control_plane_load_failed",
  });
}

export const controlPlaneRuntime = new ControlPlaneRuntime();

/** Lifecycle rules for request routing. */
export function isModelServable(model: CpModel, userId: string | null): boolean {
  if (model.lifecycle === "active" || model.lifecycle === "deprecated") return true;
  if (model.lifecycle === "preview") return !!userId && model.preview_user_ids.includes(userId);
  return false;
}

/** Models listed in public catalogs (preview/draft/retired are hidden). */
export function isModelListed(model: CpModel): boolean {
  return model.lifecycle === "active" || model.lifecycle === "deprecated";
}

/** The public catalog of a snapshot, in published order. */
export function listedCatalog(snapshot: LoadedControlPlane): AIModel[] {
  return snapshot.content.models
    .filter(isModelListed)
    .map((model) => ({ ...(snapshot.aiModels.get(model.id) as AIModel) }));
}
