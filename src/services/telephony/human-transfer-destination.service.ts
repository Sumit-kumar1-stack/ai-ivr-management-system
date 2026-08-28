import { AccountStatus, UserRole } from "@prisma/client";

import { prisma } from "@/lib/prisma";

export type HumanTransferDestinationResolution =
  | { ok: true; destination: string; destinationUserId: string }
  | { ok: false; code: "TRANSFER_DESTINATION_NOT_FOUND" | "TRANSFER_DESTINATION_CROSS_TENANT" | "TRANSFER_DESTINATION_INACTIVE" | "TRANSFER_DESTINATION_PHONE_MISSING" | "TRANSFER_DESTINATION_INVALID"; message: string };

function normalizePhone(value: string): string | null {
  const normalized = value.trim().replace(/[\s()-]/g, "");
  return /^\+[1-9]\d{7,14}$/.test(normalized) ? normalized : null;
}

export async function resolveTenantHumanTransferDestination(input: {
  tenantId: string | null;
  destinationUserId: string;
}): Promise<HumanTransferDestinationResolution> {
  if (!input.tenantId?.trim() || !input.destinationUserId.trim()) {
    return { ok: false, code: "TRANSFER_DESTINATION_NOT_FOUND", message: "The selected human transfer destination is unavailable." };
  }

  const user = await prisma.user.findUnique({
    where: { id: input.destinationUserId.trim() },
    select: { id: true, tenantId: true, phone: true, role: true, isActive: true, accountStatus: true },
  });

  if (!user) {
    return { ok: false, code: "TRANSFER_DESTINATION_NOT_FOUND", message: "The selected human transfer destination is unavailable." };
  }

  if (user.tenantId !== input.tenantId.trim()) {
    return { ok: false, code: "TRANSFER_DESTINATION_CROSS_TENANT", message: "The selected human transfer destination is unavailable." };
  }

  if (user.role !== UserRole.ADMIN && user.role !== UserRole.AGENT) {
    return { ok: false, code: "TRANSFER_DESTINATION_NOT_FOUND", message: "The selected human transfer destination is unavailable." };
  }

  if (!user.isActive || user.accountStatus !== AccountStatus.ACTIVE) {
    return { ok: false, code: "TRANSFER_DESTINATION_INACTIVE", message: "The selected human agent is not available right now." };
  }

  if (!user.phone?.trim()) {
    return { ok: false, code: "TRANSFER_DESTINATION_PHONE_MISSING", message: "The selected human agent does not have a phone number." };
  }

  const destination = normalizePhone(user.phone);
  if (!destination) {
    return { ok: false, code: "TRANSFER_DESTINATION_INVALID", message: "The selected human agent does not have a valid phone number." };
  }

  return { ok: true, destination, destinationUserId: user.id };
}
