import fs from "node:fs/promises";
import path from "node:path";

import { prisma } from "../src/lib/prisma";
import { KnowledgeFileStorage } from "../src/services/knowledge/knowledge-file-storage.service";

const execute = process.argv.includes("--execute");

async function main(): Promise<void> {
  const legacyDocuments = await prisma.knowledgeDocument.findMany({
    where: { path: { startsWith: "/uploads/knowledge/" } },
    include: { ownerUser: { select: { id: true, tenantId: true } } },
  });

  console.log(`Found ${legacyDocuments.length} legacy public knowledge document(s).`);
  if (!execute) {
    console.log("Dry run only. Re-run with --execute after configuring KNOWLEDGE_STORAGE_DIR.");
    return;
  }

  for (const document of legacyDocuments) {
    const scopeId = document.ownerUser?.tenantId ?? document.ownerUser?.id;
    const legacyPath = path.resolve(process.cwd(), "public", document.path.replace(/^\/+/, ""));

    if (!scopeId || !legacyPath.startsWith(`${path.resolve(process.cwd(), "public")}${path.sep}`)) {
      console.warn(`Skipped ${document.id}: no owner scope or invalid legacy path.`);
      continue;
    }

    let content: Buffer;
    try {
      content = await fs.readFile(legacyPath);
    } catch {
      console.warn(`Skipped ${document.id}: legacy file is missing.`);
      continue;
    }

    const stored = await KnowledgeFileStorage.store({
      scopeId,
      originalName: document.originalName,
      content,
    });

    try {
      await prisma.knowledgeDocument.update({
        where: { id: document.id },
        data: { path: stored.key, fileName: path.basename(stored.key) },
      });
    } catch (error) {
      await KnowledgeFileStorage.delete(stored.key).catch(() => undefined);
      throw error;
    }

    await fs.unlink(legacyPath);
    console.log(`Migrated knowledge document ${document.id}.`);
  }
}

main()
  .catch(() => {
    console.error("Legacy knowledge migration failed.");
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
