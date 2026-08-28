import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

const STORAGE_PREFIX = "knowledge";

export type StoredKnowledgeFile = {
  key: string;
  localPath: string;
};

function storageRoot(): string {
  const configured = process.env.KNOWLEDGE_STORAGE_DIR?.trim();

  if (process.env.NODE_ENV === "production" && !configured) {
    throw new Error("KNOWLEDGE_STORAGE_DIR must be configured in production");
  }

  const root = path.resolve(configured || path.join(process.cwd(), "storage", "knowledge"));
  const publicRoot = path.resolve(process.cwd(), "public");

  if (root === publicRoot || root.startsWith(`${publicRoot}${path.sep}`)) {
    throw new Error("Knowledge storage must not be located beneath public/");
  }

  return root;
}

function extensionFor(originalName: string): string {
  const extension = path.extname(path.basename(originalName)).toLowerCase();
  return /^[.][a-z0-9]{1,10}$/.test(extension) ? extension : "";
}

function scopedKey(scopeId: string, originalName: string): string {
  const normalizedScope = scopeId.trim();
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(normalizedScope)) {
    throw new Error("Knowledge storage scope is invalid");
  }

  return path.posix.join(STORAGE_PREFIX, normalizedScope, `${crypto.randomUUID()}${extensionFor(originalName)}`);
}

function localPathFor(key: string): string {
  if (!key.startsWith(`${STORAGE_PREFIX}/`) || key.includes("\\") || key.split("/").some(part => !part || part === "." || part === "..")) {
    throw new Error("Knowledge storage key is invalid");
  }

  const root = storageRoot();
  const localPath = path.resolve(root, ...key.split("/"));
  if (!localPath.startsWith(`${root}${path.sep}`)) {
    throw new Error("Knowledge storage path escapes its root");
  }

  return localPath;
}

export const KnowledgeFileStorage = {
  async store(input: { scopeId: string; originalName: string; content: Buffer }): Promise<StoredKnowledgeFile> {
    const key = scopedKey(input.scopeId, input.originalName);
    const localPath = localPathFor(key);
    await fs.mkdir(path.dirname(localPath), { recursive: true });
    await fs.writeFile(localPath, input.content, { flag: "wx" });
    return { key, localPath };
  },

  resolvePath(key: string): string {
    return localPathFor(key);
  },

  async read(key: string): Promise<Buffer> {
    return fs.readFile(localPathFor(key));
  },

  async delete(key: string): Promise<void> {
    await fs.unlink(localPathFor(key));
  },
};
