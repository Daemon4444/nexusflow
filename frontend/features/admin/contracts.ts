export type NullableNumber = number | null;

export interface Pagination {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface Paginated<T> {
  items: T[];
  pagination: Pagination;
  page?: number;
  pageSize?: number;
  total?: number;
}

export interface AdminIdentity {
  id: string;
  email: string | null;
  nickname: string;
}

export interface AdminSession {
  user: AdminIdentity;
  role: string;
  roles: string[];
  permissions: string[];
  expiresAt?: string | null;
}

export interface OverviewMetric {
  key: string;
  label?: string;
  value: NullableNumber;
  unit?: string | null;
  description?: string | null;
}

export interface OverviewSeriesPoint {
  timestamp?: string;
  time?: string;
  label?: string;
  requests: NullableNumber;
  tokens?: NullableNumber;
  cost?: NullableNumber;
  successRate?: NullableNumber;
  p95LatencyMs?: NullableNumber;
}

export interface OverviewCustomer {
  id: string;
  nickname: string;
  email?: string | null;
  requests: NullableNumber;
  tokens?: NullableNumber;
  cost?: NullableNumber;
  successRate?: NullableNumber;
}

export interface AdminAlert {
  id?: string;
  level: "critical" | "warning" | "info" | string;
  title: string;
  detail?: string | null;
  createdAt?: string | null;
  source?: string | null;
}

export interface ControlPlaneOverview {
  generatedAt: string;
  metrics: OverviewMetric[] | Record<string, NullableNumber>;
  timeSeries: OverviewSeriesPoint[];
  topCustomers: OverviewCustomer[];
  alerts: AdminAlert[];
  truth?: Record<string, unknown>;
}

export interface AdminCustomer {
  id: string;
  nickname: string;
  email: string | null;
  username?: string | null;
  phone?: string | null;
  accountType: "main" | "sub" | string;
  status: string;
  balance: NullableNumber;
  creditBalance: NullableNumber;
  availableBalance: NullableNumber;
  parentUserId?: string | null;
  createdAt?: string | null;
  totalRequests?: NullableNumber;
  totalTokens?: NullableNumber;
  totalCost?: NullableNumber;
  successRate?: NullableNumber;
  lastActiveAt?: string | null;
}

export interface CustomerUsage {
  totalRequests: NullableNumber;
  totalTokens: NullableNumber;
  totalCost: NullableNumber;
  avgLatency: NullableNumber;
  successRate: NullableNumber;
}

export interface CustomerModelUsage {
  model: string;
  requests: NullableNumber;
  tokens: NullableNumber;
  cost: NullableNumber;
  percentage?: NullableNumber;
}

export interface CustomerTransaction {
  id: string;
  userId?: string;
  userEmail?: string | null;
  userNickname?: string | null;
  type: string;
  amount: NullableNumber;
  balanceAfter?: NullableNumber;
  creditAfter?: NullableNumber;
  description: string;
  actor?: string | null;
  createdAt: string;
}

export interface CustomerLimit {
  id?: string;
  model: string;
  qpm: NullableNumber;
  tpm: NullableNumber;
  source?: string | null;
}

export interface CustomerDiscount {
  id: string;
  modelId: string;
  discountRate: NullableNumber;
  enabled: boolean;
  notes?: string | null;
}

export interface TrafficRecord {
  id: string;
  requestId?: string;
  userId: string;
  userEmail?: string | null;
  userNickname?: string | null;
  model: string;
  provider?: string | null;
  status: string;
  promptTokens: NullableNumber;
  completionTokens: NullableNumber;
  totalTokens: NullableNumber;
  cachedTokens?: NullableNumber;
  cost: NullableNumber;
  latencyMs: NullableNumber;
  createdAt: string;
}

export interface CustomerControlPlane {
  customer: AdminCustomer;
  usage: CustomerUsage | null;
  byModel: CustomerModelUsage[];
  transactions: Paginated<CustomerTransaction> | CustomerTransaction[];
  limits: CustomerLimit[];
  discounts: CustomerDiscount[];
  recentRequests: TrafficRecord[];
  truth?: Record<string, unknown>;
}

export interface FinanceSummary {
  balance: NullableNumber;
  creditBalance: NullableNumber;
  availableBalance: NullableNumber;
  totalRecharge: NullableNumber;
  totalConsumption: NullableNumber;
  upstreamCost: NullableNumber;
  grossProfit: NullableNumber;
  grossMargin: NullableNumber;
  unsettledReservations?: NullableNumber;
  receivables?: NullableNumber;
}

export interface FinanceTrendPoint {
  date: string;
  recharge?: NullableNumber;
  consumption?: NullableNumber;
  upstreamCost?: NullableNumber;
  grossProfit?: NullableNumber;
}

export interface FinanceOverview {
  generatedAt: string;
  summary: FinanceSummary;
  timeSeries: FinanceTrendPoint[];
  customers: AdminCustomer[];
  transactions: Paginated<CustomerTransaction> | CustomerTransaction[];
  truth?: Record<string, unknown>;
}

export interface ProviderSummary {
  id: string;
  name: string;
  slug: string;
  status: string;
  apiBaseUrl?: string | null;
  apiKeyMasked?: string | null;
  modelCount: number;
  enabledRoutes: number;
  health: string;
  observedRoutes?: number;
  currentRpm?: NullableNumber;
  currentTpm?: NullableNumber;
  rpmLimit?: NullableNumber;
  tpmLimit?: NullableNumber;
  saturationRatio?: NullableNumber;
  missingApiKey?: boolean;
}

export interface ProviderRoute {
  providerId: string;
  providerName: string;
  providerStatus?: string;
  modelId: string;
  modelName?: string;
  category?: string;
  enabled: boolean;
  recommended?: boolean;
  promptPrice?: NullableNumber;
  completionPrice?: NullableNumber;
  promptCost?: NullableNumber;
  promptCostMin?: NullableNumber;
  promptCostMax?: NullableNumber;
  completionCost?: NullableNumber;
  completionCostMin?: NullableNumber;
  completionCostMax?: NullableNumber;
  costTierCount?: NullableNumber;
  costTierCoverageComplete?: boolean;
  costCoverageStatus?: "full" | "partial" | "unknown" | string;
  costPriceBookId?: string | null;
  grossMarginPrompt?: NullableNumber;
  grossMarginCompletion?: NullableNumber;
  rpmLimit?: NullableNumber;
  tpmLimit?: NullableNumber;
  concurrentLimit?: NullableNumber;
  priority?: NullableNumber;
  weight?: NullableNumber;
  currentRpm?: NullableNumber;
  currentTpm?: NullableNumber;
  saturationRatio?: NullableNumber;
  health?: string;
  healthObserved?: boolean;
  avgLatencyMs?: NullableNumber;
  availability?: NullableNumber;
  lastObservedAt?: string | null;
  lastError?: string | null;
}

export interface ProviderCostTier {
  id: string;
  priceBookId: string;
  providerId: string;
  modelId: string;
  versionLabel: string;
  pricingType: string;
  inputTierMinTokens: number;
  inputTierMaxTokens: number | null;
  promptCost: number;
  completionCost: number;
  fixedCost: number;
  cacheReadImplicitCost: number | null;
  cacheReadExplicitCost: number | null;
  cacheCreation5mCost: number | null;
  currency: string;
  effectiveFrom: string;
  effectiveTo: string | null;
  source: string;
  sourceReference: string | null;
  sourceSha256: string | null;
  sourceRowReference: string | null;
  conditionFingerprint: string | null;
  coverageStatus: "full" | "partial" | "legacy" | null;
  notes: string;
  createdAt: string;
}

export interface ProviderOperations {
  generatedAt: string;
  summary: Record<string, NullableNumber>;
  providers: ProviderSummary[];
  routes: ProviderRoute[];
  costs?: ProviderCostTier[];
  issues: AdminAlert[];
  routePolicies?: unknown[];
  routeAudits?: unknown[];
  truth?: Record<string, unknown>;
  semantics?: Record<string, unknown>;
}

export interface CatalogModel {
  id: string;
  name: string;
  provider: string;
  category: string;
  promptPrice: NullableNumber;
  completionPrice: NullableNumber;
  contextLength?: NullableNumber;
  maxOutput?: NullableNumber;
  status?: string;
  source?: "static" | "overridden" | "added" | string;
  availability?: string | null;
  supported?: string[];
}

export interface ModelCatalog {
  models: CatalogModel[];
  disabledIds?: string[];
  staticCount?: number;
  overrideCount?: number;
  truth?: Record<string, unknown>;
}

export interface LimitApproval {
  id: string;
  userId: string;
  userEmail?: string | null;
  userNickname?: string | null;
  model: string;
  requestedQpm: NullableNumber;
  requestedTpm: NullableNumber;
  reason?: string | null;
  status: string;
  adminReply?: string | null;
  reviewedBy?: string | null;
  reviewedAt?: string | null;
  createdAt: string;
}

export interface SupportTicket {
  id: string;
  userId: string;
  userEmail?: string | null;
  userNickname?: string | null;
  type: string;
  subject: string;
  description: string;
  model?: string | null;
  status: string;
  adminReply?: string | null;
  createdAt: string;
  updatedAt?: string | null;
}

export interface AuditEvent {
  id: string;
  action: string;
  resourceType?: string | null;
  resourceId?: string | null;
  actorId?: string | null;
  actorEmail?: string | null;
  actorRole?: string | null;
  requestId?: string | null;
  idempotencyKey?: string | null;
  outcome?: string | null;
  reason?: string | null;
  metadata?: Record<string, unknown> | null;
  beforeData?: unknown;
  afterData?: unknown;
  ipAddress?: string | null;
  createdAt: string;
}

export interface ReleaseRecord {
  id: string;
  sha: string;
  status: string;
  buildId?: string | null;
  environment?: string | null;
  actor?: string | null;
  startedAt?: string | null;
  completedAt?: string | null;
  nodes?: Array<{
    id: string;
    status: string;
    sha?: string | null;
    buildId?: string | null;
    health?: string | null;
  }>;
  notes?: string | null;
}

export interface AccessPrincipal {
  id: string;
  assignmentId?: string | null;
  userId?: string | null;
  email: string;
  nickname?: string | null;
  role: string;
  roles?: string[];
  permissions?: string[];
  status?: string;
  isActive?: boolean;
  bootstrap?: boolean;
  grantedBy?: string | null;
  reason?: string | null;
  createdAt?: string | null;
  revokedAt?: string | null;
  mfaEnabled?: boolean | null;
  lastLoginAt?: string | null;
}

export interface AccessOverview {
  items: AccessPrincipal[];
  assignments?: unknown[];
  roles?: Array<{
    id: string;
    name: string;
    permissions: string[];
  }>;
  pagination?: Pagination;
  truth?: Record<string, unknown>;
}
