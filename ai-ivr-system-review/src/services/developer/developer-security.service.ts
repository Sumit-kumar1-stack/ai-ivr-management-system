import { createHash, randomBytes } from "node:crypto";

export interface SecretMaterial {
  prefix: string;
  plaintext: string;
  hash: string;
}

export function createApiKeyMaterial(): SecretMaterial {
  const prefix = `ivk_${randomBytes(4).toString("hex")}`;
  const plaintext = `${prefix}_${randomBytes(24).toString("hex")}`;

  return {
    prefix,
    plaintext,
    hash: hashSecret(plaintext),
  };
}

export function createWebhookSecretMaterial(): SecretMaterial {
  const prefix = `whsec_${randomBytes(4).toString("hex")}`;
  const plaintext = `${prefix}_${randomBytes(24).toString("hex")}`;

  return {
    prefix,
    plaintext,
    hash: hashSecret(plaintext),
  };
}

export function hashSecret(value: string): string {
  return createHash("sha256")
    .update(value)
    .digest("hex");
}

export function isSafeWebhookUrl(value: string): boolean {
  try {
    const url = new URL(value);
    const hostname = url.hostname.trim().toLowerCase();

    if (url.protocol !== "https:") {
      return false;
    }

    if (
      !hostname ||
      hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      hostname === "0.0.0.0" ||
      hostname === "::1" ||
      hostname.endsWith(".local") ||
      hostname.startsWith("10.") ||
      hostname.startsWith("192.168.") ||
      hostname.startsWith("169.254.")
    ) {
      return false;
    }

    const private172 = hostname.match(
      /^172\.(\d+)\./
    );

    if (private172) {
      const octet = Number(private172[1]);

      if (octet >= 16 && octet <= 31) {
        return false;
      }
    }

    return true;
  } catch {
    return false;
  }
}

