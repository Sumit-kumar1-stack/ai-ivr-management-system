import { UserRole } from "@prisma/client";
import { NextRequest } from "next/server";

import { success } from "@/lib/api-response";
import { asyncHandler } from "@/lib/async-handler";
import { requireRole } from "@/lib/auth";
import {
  getMessagingProviderDescriptors,
  getPreferredMessagingProvider,
} from "@/services/messaging/messaging-provider-registry.service";

const SETTINGS_ROLES = [
  UserRole.SUPER_ADMIN,
  UserRole.ADMIN,
] as const;

export const GET = asyncHandler(
  async (_request: NextRequest) => {
    await requireRole(SETTINGS_ROLES);

    const providers =
      getMessagingProviderDescriptors();

    const preferred = {
      sms: getPreferredMessagingProvider("SMS"),
      whatsapp: getPreferredMessagingProvider("WHATSAPP"),
    };

    return success(
      {
        providers,
        preferred,
      },
      "Messaging providers retrieved successfully"
    );
  }
);
