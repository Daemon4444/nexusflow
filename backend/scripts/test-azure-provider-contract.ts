import assert from "node:assert/strict";
import { getAnnouncedModels, models } from "../src/data/models";
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
const announced = getAnnouncedModels().find((model) => model.id === modelId);
assert.ok(announced);
assert.equal(announced.promptPrice, null);
assert.equal(announced.completionPrice, null);
assert.equal(announced.pricingStatus, "unpublished");
assert.equal(announced.lifecycle, "announced");
assert.deepEqual(getSupportedProtocols(announced), [
  "openai/chat-completions",
  "openai/responses",
]);
assert.equal(
  models.some((model) => model.id === modelId),
  false,
  "unpriced Azure model must not enter billable runtime catalog"
);

console.log("azure-provider-contract-ok");
