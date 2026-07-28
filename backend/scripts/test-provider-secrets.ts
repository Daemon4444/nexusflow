import assert from "node:assert/strict";
import { closeDb, db } from "../src/db/client";
import {
  decryptProviderSecret,
  encryptProviderSecret,
  isEncryptedProviderSecret,
} from "../src/utils/provider-secrets";
import { updateProvider } from "../src/data/providers";
import { switchProviderChannel } from "../src/data/provider-channels";

process.env.PROVIDER_OUTBOUND_HOST_ALLOWLIST = [
  "example.invalid",
  "primary.example.invalid",
  "secondary.example.invalid",
].join(",");

const testKey = process.env.PROVIDER_SECRET_KEY || "";
if (
  process.env.NODE_ENV !== "production" ||
  process.env.USE_PG_MEM !== "true" ||
  testKey.length < 48
) {
  throw new Error(
    "test requires NODE_ENV=production, USE_PG_MEM=true and a test provider key"
  );
}

async function main(): Promise<void> {
  const originalConsoleError = console.error;
  console.error = () => {};

  try {
    const providerId = "provider-secret-regression";
    const providerSecret = "provider-test-secret-value";
    const primarySecret = "channel-primary-secret-value";
    const secondarySecret = "channel-secondary-secret-value";
    const encryptedProvider = encryptProviderSecret(providerSecret);
    const encryptedPrimary = encryptProviderSecret(primarySecret);
    const encryptedSecondary = encryptProviderSecret(secondarySecret);

    assert.equal(isEncryptedProviderSecret(encryptedProvider), true);
    assert.equal(decryptProviderSecret(encryptedProvider), providerSecret);
    assert.equal(encryptProviderSecret(encryptedProvider), encryptedProvider);

    await db.execute(
      `INSERT INTO providers (
         id, name, slug, api_base_url, api_key,
         contact_name, contact_email, status
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        providerId,
        "Provider Secret Regression",
        providerId,
        "https://example.invalid",
        encryptedProvider,
        "Test",
        "provider-secret@example.invalid",
        "enabled",
      ]
    );
    await db.execute(
      `INSERT INTO provider_channel_configs (
         provider_id, active_channel, channels
       ) VALUES (?, ?, ?)`,
      [
        providerId,
        "primary",
        JSON.stringify({
          primary: {
            name: "Primary",
            adapter: "dashscope",
            api_base_url: "https://primary.example.invalid",
            api_key: encryptedPrimary,
          },
          secondary: {
            name: "Secondary",
            adapter: "dashscope",
            api_base_url: "https://secondary.example.invalid",
            api_key: encryptedSecondary,
          },
        }),
      ]
    );

    delete process.env.PROVIDER_SECRET_KEY;
    assert.throws(
      () => encryptProviderSecret("must-not-be-stored"),
      /PROVIDER_SECRET_KEY/
    );
    assert.equal(decryptProviderSecret(providerSecret), "");
    assert.equal(decryptProviderSecret(encryptedProvider), "");

    assert.equal(
      await updateProvider(providerId, {
        description: "metadata-only update",
      }),
      true
    );
    await assert.rejects(
      () =>
        updateProvider(providerId, {
          api_key: "replacement-must-fail",
        }),
      /PROVIDER_SECRET_KEY/
    );
    const switched = await switchProviderChannel(providerId, "secondary");
    assert.equal(switched?.active_channel, "secondary");

    const rawProvider = await db.queryOne<{ api_key: string; description: string }>(
      "SELECT api_key, description FROM providers WHERE id = ?",
      [providerId]
    );
    assert.equal(rawProvider?.api_key, encryptedProvider);
    assert.equal(rawProvider?.description, "metadata-only update");

    const rawConfig = await db.queryOne<{ channels: string }>(
      "SELECT channels FROM provider_channel_configs WHERE provider_id = ?",
      [providerId]
    );
    const storedChannels = JSON.parse(rawConfig?.channels || "{}");
    assert.equal(storedChannels.primary.api_key, encryptedPrimary);
    assert.equal(storedChannels.secondary.api_key, encryptedSecondary);

    process.env.PROVIDER_SECRET_KEY = testKey;
    assert.equal(decryptProviderSecret(rawProvider?.api_key || ""), providerSecret);
    assert.equal(
      decryptProviderSecret(storedChannels.primary.api_key),
      primarySecret
    );
    assert.equal(
      decryptProviderSecret(storedChannels.secondary.api_key),
      secondarySecret
    );
    assert.equal(decryptProviderSecret("legacy-plaintext-secret"), "");

    process.env.NODE_ENV = "test";
    delete process.env.PROVIDER_SECRET_KEY;
    assert.equal(
      encryptProviderSecret("development-plaintext"),
      "development-plaintext"
    );
    assert.equal(
      decryptProviderSecret("development-plaintext"),
      "development-plaintext"
    );
  } finally {
    process.env.NODE_ENV = "production";
    process.env.PROVIDER_SECRET_KEY = testKey;
    console.error = originalConsoleError;
  }

  console.log(
    "provider secret fail-closed and ciphertext-preservation tests passed"
  );
}

main()
  .then(async () => {
    await closeDb();
    process.exit(0);
  })
  .catch(async (error) => {
    console.error(error);
    await closeDb();
    process.exit(1);
  });
