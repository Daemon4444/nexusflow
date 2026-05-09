export interface FirstRunState {
  hasApiKey: boolean;
  hasBalance: boolean;
  hasUsage: boolean;
  nextStep: "create-key" | "add-credit" | "copy-code" | "try-playground" | "monitor";
  completedSteps: number;
}

export function getFirstRunState(input: {
  apiKeyCount: number;
  balance: number;
  recentUsageCount: number;
}): FirstRunState {
  const hasApiKey = input.apiKeyCount > 0;
  const hasBalance = input.balance > 0;
  const hasUsage = input.recentUsageCount > 0;
  const completedSteps = [hasApiKey, hasBalance, hasUsage].filter(Boolean).length;
  let nextStep: FirstRunState["nextStep"] = "create-key";

  if (hasApiKey && !hasBalance) nextStep = "add-credit";
  if (hasApiKey && hasBalance && !hasUsage) nextStep = "copy-code";
  if (hasApiKey && hasBalance && hasUsage) nextStep = "monitor";

  return { hasApiKey, hasBalance, hasUsage, nextStep, completedSteps };
}
