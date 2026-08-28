import { afterEach, describe, expect, it, vi } from "vitest";

import { KnowledgeFileStorage } from "@/services/knowledge/knowledge-file-storage.service";

describe("private knowledge file storage", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("rejects missing production storage configuration and public storage roots", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("KNOWLEDGE_STORAGE_DIR", "");
    expect(() => KnowledgeFileStorage.resolvePath("knowledge/tenant-1/doc.pdf")).toThrow("KNOWLEDGE_STORAGE_DIR");

    vi.stubEnv("KNOWLEDGE_STORAGE_DIR", `${process.cwd()}/public/private-knowledge`);
    expect(() => KnowledgeFileStorage.resolvePath("knowledge/tenant-1/doc.pdf")).toThrow("must not be located beneath public");
  });

  it("uses an opaque non-public key and rejects path traversal", () => {
    vi.stubEnv("NODE_ENV", "test");
    expect(KnowledgeFileStorage.resolvePath("knowledge/tenant-1/doc.pdf")).not.toContain(`${process.cwd()}\\public`);
    expect(() => KnowledgeFileStorage.resolvePath("knowledge/tenant-1/../secret.pdf")).toThrow("key is invalid");
  });
});
