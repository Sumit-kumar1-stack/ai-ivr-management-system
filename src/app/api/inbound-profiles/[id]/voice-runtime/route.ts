import { UserRole } from "@prisma/client";
import { NextRequest } from "next/server";
import { z } from "zod";

import { success } from "@/lib/api-response";
import { asyncHandler } from "@/lib/async-handler";
import { requireRole } from "@/lib/auth";
import {
  updateInboundProfileVoiceRuntime,
} from "@/services/calls/inbound-profile-runtime.service";

const SETTINGS_ROLES = [UserRole.SUPER_ADMIN, UserRole.ADMIN] as const;

const inputSchema = z.object({
  voiceRuntime: z.enum(["CASCADED", "GEMINI_LIVE"]),
});

export const PUT = asyncHandler(
  async (
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
  ) => {
    const currentUser = await requireRole(SETTINGS_ROLES);
    const { id } = await params;
    const input = inputSchema.parse(await request.json());
    const profile = await updateInboundProfileVoiceRuntime({
      inboundProfileId: id,
      voiceRuntime: input.voiceRuntime,
      actor: currentUser,
    });

    return success(profile, "Inbound voice runtime updated");
  }
);
