import { UserRole } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";

import { asyncHandler } from "@/lib/async-handler";
import { requireRole } from "@/lib/auth";
import { CallEventRepository } from "@/features/call-events/call-event.repository";

const HISTORY_ROLES = [
  UserRole.SUPER_ADMIN,
  UserRole.ADMIN,
  UserRole.AGENT,
] as const;

export const GET = asyncHandler(
  async (_request: NextRequest) => {
    const currentUser = await requireRole(HISTORY_ROLES);

    const events = await CallEventRepository.getLatest(
      100,
      currentUser.role === UserRole.SUPER_ADMIN
        ? undefined
        : currentUser.id
    );

    return NextResponse.json(events);
  }
);
