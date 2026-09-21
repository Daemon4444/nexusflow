import assert from "node:assert/strict";
import {
  getAnnouncedModels,
  getTokenPricingTier,
  models,
  resolveCachePricing,
} from "../src/data/models";
import {
  findProvider,
  getProviderAuthHeaders,
  isProviderModelCompatible,
} from "../src/services/providers";
import {
  DEFAULT_PROVIDER_OUTBOUND_HOSTS,
  parseAndValidateOutboundUrl,
} from "../src/services/outbound-url-policy";
import { AZURE_AI_FOUNDRY_REGION } from "../src/services/upstream";
import { getSupportedProtocols, supportsResponsesApi } from "../src/utils/model-protocols";
import { getUpstreamModelId } from "../src/utils/upstream-model-aliases";
import { getOpenAiPromptCacheUsage } from "../src/utils/cache-billing";

const modelId = "gpt-6-astra";
const provider = findProvider(modelId);
assert.ok(provider);
assert.equal(provider.id, "azure-ai-foundry");
assert.equal(provider.apiKeyEnv, "AZURE_AI_FOUNDRY_API_KEY");
assert.equal(
  provider.baseUrl,
  "https://developerhelena-1129-resource.services.ai.azure.com/openai/v1"
);
assert.equal(AZURE_AI_FOUNDRY_REGION, "eastus2");
assert.equal(isProviderModelCompatible(provider.id, modelId), true);
assert.equal(isProviderModelCompatible("dashscope", modelId), false);

assert.deepEqual(getProviderAuthHeaders(provider.id, "test-key"), {
  "api-key": "test-key",
});
assert.deepEqual(getProviderAuthHeaders("dashscope", "test-key"), {
  Authorization: "Bearer test-key",
});

assert.ok(
  DEFAULT_PROVIDER_OUTBOUND_HOSTS.includes(
    "developerhelena-1129-resource.services.ai.azure.com"
  )
);
assert.equal(
  parseAndValidateOutboundUrl(provider.baseUrl, {
    allowlist: new Set(DEFAULT_PROVIDER_OUTBOUND_HOSTS),
  }).pathname,
  "/openai/v1"
);

assert.equal(getUpstreamModelId(modelId, provider.id), modelId);
assert.equal(supportsResponsesApi(modelId), true);
assert.equal(getAnnouncedModels().some((model) => model.id === modelId), false);
const astra = models.find((model) => model.id === modelId);
assert.ok(astra);
assert.equal(astra.promptPrice, 68);
assert.equal(astra.completionPrice, 340);
assert.equal(getTokenPricingTier(astra, 272_000)?.promptPrice, 68);
assert.equal(getTokenPricingTier(astra, 272_001)?.promptPrice, 136);
assert.equal(resolveCachePricing(astra, getTokenPricingTier(astra, 272_000)).implicitHit, 6.8);
assert.equal(resolveCachePricing(astra, getTokenPricingTier(astra, 272_000)).explicitCreation, 85);
assert.equal(resolveCachePricing(astra, getTokenPricingTier(astra, 272_001)).implicitHit, 13.6);
assert.equal(resolveCachePricing(astra, getTokenPricingTier(astra, 272_001)).explicitCreation, 170);
assert.equal(getOpenAiPromptCacheUsage({
  prompt_tokens: 100,
  prompt_tokens_details: {
    cache_write_tokens: 40,
    cache_creation_input_tokens: 99,
  },
}).cacheCreationTokens, 40, "Azure cache_write_tokens must be authoritative without double counting");
assert.deepEqual(getSupportedProtocols(astra), [
  "openai/chat-completions",
  "openai/responses",
]);

console.log("azure-provider-contract-ok");
