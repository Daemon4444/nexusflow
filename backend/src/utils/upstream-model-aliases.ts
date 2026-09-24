const HIMODELS_UPSTREAM_MODEL_ALIASES: Readonly<Record<string, string>> = Object.freeze({
  "claude-haiku-4-5": "claude-haiku-4-5-aws",
  "claude-sonnet-4-6": "claude-sonnet-4-6-aws",
  "claude-sonnet-5": "claude-sonnet-5-aws",
  "claude-opus-4-8": "claude-opus-4-8-aws",
  "claude-opus-5": "claude-opus-5-aws",
});

const LEGACY_RESPONSE_MODEL_ALIASES: Readonly<Record<string, readonly string[]>> = Object.freeze({
  "claude-haiku-4-5": ["claude-haiku-4-5-20260820", "claude-haiku-4-5-20251001"],
  "claude-sonnet-4-6": ["claude-sonnet-4-6-20260820"],
  "claude-sonnet-5": ["claude-sonnet-5-20260820"],
  "claude-opus-4-8": ["claude-opus-4-8-20260820"],
  "claude-opus-5": ["claude-opus-5-20260820"],
});

const PROVIDER_UPSTREAM_MODEL_ALIASES: Readonly<
  Record<string, Readonly<Record<string, string>>>
> = Object.freeze({
  himodels: HIMODELS_UPSTREAM_MODEL_ALIASES,
  "azure-ai-foundry": Object.freeze({
    "gpt-6-astra": "gpt-6-astra",
  }),
});

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const RESPONSE_MODEL_ALIASES = Object.freeze(
  Object.fromEntries(
    Object.entries(HIMODELS_UPSTREAM_MODEL_ALIASES).map(([publicModelId, upstreamModelId]) => [
      publicModelId,
      [upstreamModelId, ...(LEGACY_RESPONSE_MODEL_ALIASES[publicModelId] || [])],
    ])
  ) as Record<string, readonly string[]>
);

const RESPONSE_MODEL_ALIAS_SETS = Object.freeze(
  Object.fromEntries(
    Object.entries(RESPONSE_MODEL_ALIASES).map(([publicModelId, aliases]) => [publicModelId, new Set(aliases)])
  ) as Record<string, ReadonlySet<string>>
);

const RESPONSE_MODEL_ALIAS_PATTERNS = Object.freeze(
  Object.fromEntries(
    Object.entries(RESPONSE_MODEL_ALIASES).map(([publicModelId, aliases]) => [
      publicModelId,
      aliases.map((alias) => new RegExp(`("model"\\s*:\\s*")${escapeRegExp(alias)}(")`, "g")),
    ])
  ) as Record<string, readonly RegExp[]>
);

export function getUpstreamModelId(publicModelId: string, providerId?: string): string {
  if (!providerId) return publicModelId;
  return PROVIDER_UPSTREAM_MODEL_ALIASES[providerId]?.[publicModelId] || publicModelId;
}

export function restorePublicModelAlias<T>(value: T, publicModelId: string): T {
  const responseAliases = RESPONSE_MODEL_ALIAS_SETS[publicModelId];
  if (!responseAliases || !value || typeof value !== "object") return value;

  const visit = (current: any): void => {
    if (!current || typeof current !== "object") return;
    if (Array.isArray(current)) {
      current.forEach(visit);
      return;
    }
    for (const [key, child] of Object.entries(current)) {
      if (key === "model" && typeof child === "string" && responseAliases.has(child)) {
        current[key] = publicModelId;
      } else {
        visit(child);
      }
    }
  };
  visit(value);
  return value;
}

export function rewriteUpstreamModelAliasText(text: string, publicModelId: string): string {
  const patterns = RESPONSE_MODEL_ALIAS_PATTERNS[publicModelId];
  if (!patterns) return text;
  return patterns.reduce(
    (current, pattern) => current.replace(pattern, `$1${publicModelId}$2`),
    text
  );
}
