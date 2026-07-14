import { prisma } from "@/lib/prisma";
import { CallStatus } from "@prisma/client";

import {
  mapProviderStatus,
} from "@/providers/telephony/status-map";

export async function createCall(data: {
  campaignId: string;
  contactId: string;
  phone: string;
  language: string;
}) {
  return prisma.call.create({
    data,
  });
}

export async function updateCall(
  id: string,
  data: {
    providerCallId?: string;
    status?: CallStatus;
    duration?: number;
    recordingUrl?: string;
    transcript?: string;
    summary?: string;
    startedAt?: Date;
    endedAt?: Date;
  }
) {
  return prisma.call.update({
    where: {
      id,
    },
    data,
  });
}

export async function getCallByProviderId(
  providerCallId: string
) {
  return prisma.call.findFirst({
    where: {
      providerCallId,
    },
  });
}

export async function getCall(id: string) {
  return prisma.call.findUnique({
    where: {
      id,
    },
    include: {
      campaign: true,
      contact: true,
    },
  });
}

export async function updateCallStatus(data: {
  providerCallId: string;
  status: string;
  duration?: number;
}) {
  const mappedStatus = mapProviderStatus(
    data.status
  );

  return prisma.call.updateMany({
    where: {
      providerCallId:
        data.providerCallId,
    },
    data: {
      status: mappedStatus,
      duration: data.duration,
      endedAt:
        mappedStatus ===
        CallStatus.COMPLETED
          ? new Date()
          : undefined,
    },
  });
}