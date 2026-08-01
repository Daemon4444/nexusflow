const UPSTREAM_MODEL_ALIASES: Readonly<Record<string, string>> = Object.freeze({
  "deepseek-v4-flash": "deepseek-v4-flash-0731",
});

export function getUpstreamModelId(publicModelId: string): string {
  return UPSTREAM_MODEL_ALIASES[publicModelId] || publicModelId;
}

export function restorePublicModelAlias<T>(value: T, publicModelId: string): T {
  const upstreamModelId = getUpstreamModelId(publicModelId);
  if (upstreamModelId === publicModelId || !value || typeof value !== "object") {
    return value;
  }
  const visit = (current: any): void => {
    if (!current || typeof current !== "object") return;
    if (Array.isArray(current)) {
      current.forEach(visit);
      return;
    }
    for (const [key, child] of Object.entries(current)) {
      if (key === "model" && child === upstreamModelId) {
        current[key] = publicModelId;
      } else {
        visit(child);
      }
    }
  };
  visit(value);
  return value;
}

export function rewriteUpstreamModelAliasText(
  text: string,
  publicModelId: string
): string {
  const upstreamModelId = getUpstreamModelId(publicModelId);
  return upstreamModelId === publicModelId
    ? text
    : text.split(`"${upstreamModelId}"`).join(`"${publicModelId}"`);
}
