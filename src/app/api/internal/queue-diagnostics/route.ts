import { UserRole } from "@prisma/client";
import { NextResponse } from "next/server";

import { requireRole } from "@/lib/auth";
import { createAuthErrorResponse } from "@/lib/auth-response";
import { getQueueDiagnostics } from "@/services/queues/queue-diagnostics.service";

const QUEUE_DIAGNOSTIC_ROLES = [
  UserRole.SUPER_ADMIN,
] as const;

export async function GET(): Promise<NextResponse> {
  try {
    await requireRole(QUEUE_DIAGNOSTIC_ROLES);

    return NextResponse.json({
      queues: await getQueueDiagnostics(),
    });
  } catch (error) {
    const authResponse = createAuthErrorResponse(error);

    if (authResponse) {
      return authResponse;
    }

    return NextResponse.json(
      {
        success: false,
        message: "Unable to read queue diagnostics.",
      },
      { status: 500 }
    );
  }
}
