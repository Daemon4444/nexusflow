const HIMODELS_UPSTREAM_MODEL_ALIASES: Readonly<Record<string, string>> = Object.freeze({
  "claude-haiku-4-5": "claude-haiku-4-5-aws",
  "claude-sonnet-4-6": "claude-sonnet-4-6-aws",
  "claude-sonnet-5": "claude-sonnet-5-aws",
  "claude-opus-4-8": "claude-opus-4-8-aws",
  "claude-opus-5": "claude-opus-5-aws",
});

const PROVIDER_UPSTREAM_MODEL_ALIASES: Readonly<
  Record<string, Readonly<Record<string, string>>>
> = Object.freeze({
  himodels: HIMODELS_UPSTREAM_MODEL_ALIASES,
  "azure-ai-foundry": Object.freeze({
    "gpt-6-astra": "gpt-6-astra",
  }),
});

// HiModels' AWS-backed upstream does not echo back the alias we send as the
// `model` field; it returns its own opaque internal identifier (observed:
// "MaaS_Cl_Haiku_4.5_20251016_PREM"-style strings). A fixed allowlist of
// expected upstream strings is therefore unreliable and has already needed
// patching more than once. For every model routed through HiModels we
// instead force the client-visible `model` field back to the stable public
// id unconditionally, rather than trying to recognize the upstream's value.
const HIMODELS_PUBLIC_MODEL_ID_SET: ReadonlySet<string> = new Set(
  Object.keys(HIMODELS_UPSTREAM_MODEL_ALIASES)
);

const MODEL_FIELD_PATTERN = /("model"\s*:\s*")[^"]*(")/g;

export function getUpstreamModelId(publicModelId: string, providerId?: string): string {
  if (!providerId) return publicModelId;
  return PROVIDER_UPSTREAM_MODEL_ALIASES[providerId]?.[publicModelId] || publicModelId;
}

export function restorePublicModelAlias<T>(value: T, publicModelId: string): T {
  if (!HIMODELS_PUBLIC_MODEL_ID_SET.has(publicModelId) || !value || typeof value !== "object") {
    return value;
  }
  // These five HiModels-routed ids never support tools (see
  // model-capabilities), so a parsed response object never carries
  // tool-call-argument JSON that could coincidentally contain its own
  // unrelated "model" key; every literal `model` key in the object graph is
  // therefore safe to force back to the public id unconditionally.
  const visit = (current: unknown): void => {
    if (!current || typeof current !== "object") return;
    if (Array.isArray(current)) {
      current.forEach(visit);
      return;
    }
    for (const [key, child] of Object.entries(current as Record<string, unknown>)) {
      if (key === "model" && typeof child === "string") {
        (current as Record<string, unknown>)[key] = publicModelId;
      } else {
        visit(child);
      }
    }
  };
  visit(value);
  return value;
}

export function rewriteUpstreamModelAliasText(text: string, publicModelId: string): string {
  if (!HIMODELS_PUBLIC_MODEL_ID_SET.has(publicModelId)) return text;
  // Only the unescaped `"model":"..."` JSON-key position matches here; a
  // literal quote inside an SSE text delta's own string content is escaped
  // (\") by JSON encoding, so streamed assistant/tool text is never touched.
  return text.replace(MODEL_FIELD_PATTERN, `$1${publicModelId}$2`);
}
