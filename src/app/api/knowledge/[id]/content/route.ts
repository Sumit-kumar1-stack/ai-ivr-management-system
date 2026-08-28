import { UserRole } from "@prisma/client";
import { NextResponse } from "next/server";

import { requireRole } from "@/lib/auth";
import { createAuthErrorResponse } from "@/lib/auth-response";
import { getKnowledgeDocumentForUser } from "@/services/knowledge/knowledge-document.service";
import { KnowledgeFileStorage } from "@/services/knowledge/knowledge-file-storage.service";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(_request: Request, context: RouteContext) {
  try {
    const currentUser = await requireRole([UserRole.AGENT, UserRole.ADMIN, UserRole.SUPER_ADMIN]);
    const { id } = await context.params;
    const document = await getKnowledgeDocumentForUser(id, currentUser);

    if (!document) {
      return NextResponse.json({ success: false, message: "Knowledge document not found" }, { status: 404 });
    }

    const content = await KnowledgeFileStorage.read(document.path);
    return new NextResponse(new Uint8Array(content), {
      headers: {
        "Content-Type": document.mimeType || "application/octet-stream",
        "Content-Disposition": `inline; filename="${encodeURIComponent(document.originalName.replace(/[\r\n"]/g, "_"))}"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    const authResponse = createAuthErrorResponse(error);
    if (authResponse) return authResponse;

    return NextResponse.json({ success: false, message: "Knowledge document is unavailable" }, { status: 404 });
  }
}
