import { describe, expect, it } from "vitest";

import {
  createApiKeyMaterial,
  createWebhookSecretMaterial,
  isSafeWebhookUrl,
} from "@/services/developer/developer-security.service";

describe("developer security helpers", () => {
  it("generates API key material with a prefix and hash", () => {
    const material = createApiKeyMaterial();

    expect(material.prefix).toMatch(/^ivk_[a-f0-9]{8}$/);
    expect(material.plaintext).toContain(material.prefix);
    expect(material.hash).toHaveLength(64);
    expect(material.hash).not.toBe(material.plaintext);
  });

  it("generates webhook secret material with a prefix and hash", () => {
    const material = createWebhookSecretMaterial();

    expect(material.prefix).toMatch(/^whsec_[a-f0-9]{8}$/);
    expect(material.plaintext).toContain(material.prefix);
    expect(material.hash).toHaveLength(64);
  });

  it("accepts public HTTPS webhook URLs and rejects private or insecure destinations", () => {
    expect(isSafeWebhookUrl("https://example.com/webhooks/ivr")).toBe(true);
    expect(isSafeWebhookUrl("http://example.com/webhooks/ivr")).toBe(false);
    expect(isSafeWebhookUrl("https://localhost/webhooks/ivr")).toBe(false);
    expect(isSafeWebhookUrl("https://192.168.1.25/webhooks/ivr")).toBe(false);
  });
});

