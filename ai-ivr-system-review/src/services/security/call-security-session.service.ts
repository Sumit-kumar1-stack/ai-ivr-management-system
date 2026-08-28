import {
  CallAuthenticationLevel,
  CallDirection,
  CallRiskLevel,
  Prisma,
} from "@prisma/client";

import {
  AppEvent,
  EventPublisher,
} from "@/core/events";

import {
  prisma,
} from "@/lib/prisma";

//--------------------------------------------------
// Types
//--------------------------------------------------

export interface CallSecuritySession {
  callId: string;
  campaignId: string;
  contactId: string;
  direction: CallDirection;
  authenticationLevel: CallAuthenticationLevel;
  riskLevel: CallRiskLevel;
  authenticationVerifiedAt: Date | null;
  securityFlags: Record<string, unknown>;
  allowedActions: string[];
  updatedAt: Date;
}

export interface UpdateCallSecuritySessionInput {
  authenticationLevel?: CallAuthenticationLevel;
  riskLevel?: CallRiskLevel;
  securityFlags?: Record<string, unknown>;
  trusted?: boolean;
}

export type UpdateCallSecuritySessionResult =
  | {
      success: true;
      session: CallSecuritySession;
    }
  | {
      success: false;
      code: string;
      message: string;
      session?: CallSecuritySession;
    };

//--------------------------------------------------
// Auth Level Order
//--------------------------------------------------

const AUTH_LEVEL_ORDER: Record<
  CallAuthenticationLevel,
  number
> = {
  AUTH_LEVEL_0: 0,
  AUTH_LEVEL_1: 1,
  AUTH_LEVEL_2: 2,
  AUTH_LEVEL_3: 3,
};

//--------------------------------------------------
// Session Loader
//--------------------------------------------------

export async function getCallSecuritySession(
  callId: string
): Promise<CallSecuritySession | null> {
  const normalizedCallId =
    callId.trim();

  if (
    !normalizedCallId
  ) {
    return null;
  }

  const call =
    await prisma.call.findUnique({
      where: {
        id: normalizedCallId,
      },

      select: {
        id: true,
        campaignId: true,
        contactId: true,
        direction: true,
        authenticationLevel: true,
        authenticationVerifiedAt: true,
        riskLevel: true,
        securityFlags: true,
        updatedAt: true,
      },
    });

  if (
    !call
  ) {
    return null;
  }

  return buildSessionSnapshot(
    call
  );
}

//--------------------------------------------------
// Update Session
//--------------------------------------------------

export async function updateCallSecuritySession(
  callId: string,
  input: UpdateCallSecuritySessionInput
): Promise<UpdateCallSecuritySessionResult> {
  const session =
    await getCallSecuritySession(
      callId
    );

  if (
    !session
  ) {
    return {
      success: false,
      code: "CALL_NOT_FOUND",
      message: "Call was not found",
    };
  }

  const currentLevel =
    session.authenticationLevel ??
    "AUTH_LEVEL_0";

  const nextLevel =
    input.authenticationLevel ??
    currentLevel;

  void EventPublisher.publish(
    AppEvent.AUTH_REQUESTED,
    {
      callId: session.callId,

      campaignId: session.campaignId,

      contactId: session.contactId,

      authenticationLevel: nextLevel,

      actorType:
        input.trusted
          ? "SYSTEM"
          : "USER",

      requestedBy:
        input.trusted
          ? "SYSTEM"
          : "USER",

      timestamp:
        Date.now(),
    }
  );

  const hasMutableSecurityInput =
    input.authenticationLevel !==
      undefined ||
    input.riskLevel !==
      undefined ||
    input.securityFlags !==
      undefined;

  if (
    !input.trusted &&
    hasMutableSecurityInput
  ) {
    void EventPublisher.publish(
      AppEvent.AUTH_FAILED,
      {
        callId: session.callId,

        campaignId: session.campaignId,

        contactId: session.contactId,

        authenticationLevel:
          currentLevel,

        reason:
          "UNTRUSTED_SECURITY_UPDATE_REJECTED",

        actorType:
          "USER",

        timestamp:
          Date.now(),
      }
    );

    return {
      success: false,
      code: "UNTRUSTED_SECURITY_UPDATE_REJECTED",
      message:
        "Only trusted backend verification can change the call security session.",
      session,
    };
  }

  if (
    !input.trusted &&
    AUTH_LEVEL_ORDER[
      nextLevel
    ] >
      AUTH_LEVEL_ORDER[
        currentLevel
      ]
  ) {
    void EventPublisher.publish(
      AppEvent.AUTH_FAILED,
      {
        callId: session.callId,

        campaignId: session.campaignId,

        contactId: session.contactId,

        authenticationLevel:
          currentLevel,

        reason:
          "AUTH_LEVEL_UPGRADE_REJECTED",

        actorType:
          "USER",

        timestamp:
          Date.now(),
      }
    );

    return {
      success: false,
      code: "AUTH_LEVEL_UPGRADE_REJECTED",
      message:
        "Authentication level can only be raised by trusted backend verification.",
      session,
    };
  }

  const updated =
    await prisma.call.update({
      where: {
        id: session.callId,
      },

      data: {
        authenticationLevel:
          nextLevel,

        riskLevel:
          input.riskLevel ??
          session.riskLevel,

        authenticationVerifiedAt:
          input.authenticationLevel &&
          AUTH_LEVEL_ORDER[
            input.authenticationLevel
          ] >
            AUTH_LEVEL_ORDER[
              currentLevel
            ]
            ? new Date()
            : session.authenticationVerifiedAt,

        securityFlags:
          input.securityFlags
            ? (input.securityFlags as Prisma.InputJsonValue)
            : (session.securityFlags as Prisma.InputJsonValue),
      },

      select: {
        id: true,
        campaignId: true,
        contactId: true,
        direction: true,
        authenticationLevel: true,
        authenticationVerifiedAt: true,
        riskLevel: true,
        securityFlags: true,
        updatedAt: true,
    },
  });

  void EventPublisher.publish(
    AppEvent.AUTH_SUCCEEDED,
    {
      callId: updated.id,

      campaignId: updated.campaignId,

      contactId: updated.contactId,

      authenticationLevel:
        updated.authenticationLevel,

      riskLevel:
        updated.riskLevel,

      actorType:
        "SYSTEM",

      timestamp:
        Date.now(),
    }
  );

  return {
    success: true,
    session:
      await buildSessionSnapshot(
        updated
      ),
  };
}

//--------------------------------------------------
// Helpers
//--------------------------------------------------

export function hasSufficientAuthLevel(
  currentLevel:
    CallAuthenticationLevel | string | null | undefined,
  requiredLevel:
    CallAuthenticationLevel | string | null | undefined
): boolean {
  const current =
    normalizeAuthLevel(
      currentLevel
    );

  const required =
    normalizeAuthLevel(
      requiredLevel
    );

  return (
    AUTH_LEVEL_ORDER[current] >=
    AUTH_LEVEL_ORDER[required]
  );
}

function normalizeAuthLevel(
  level:
    CallAuthenticationLevel | string | null | undefined
): CallAuthenticationLevel {
  if (
    level === "AUTH_LEVEL_1" ||
    level === "AUTH_LEVEL_2" ||
    level === "AUTH_LEVEL_3"
  ) {
    return level;
  }

  return "AUTH_LEVEL_0";
}

function normalizeSecurityFlags(
  value:
    unknown
): Record<string, unknown> {
  if (
    value &&
    typeof value === "object" &&
    !Array.isArray(value)
  ) {
    return value as Record<
      string,
      unknown
    >;
  }

  return {};
}

async function buildSessionSnapshot(
  call: {
    id: string;
    campaignId: string;
    contactId: string;
    direction: CallDirection;
    authenticationLevel:
      CallAuthenticationLevel;
    authenticationVerifiedAt:
      Date | null;
    riskLevel: CallRiskLevel;
    securityFlags: unknown;
    updatedAt: Date;
  }
): Promise<CallSecuritySession> {
  const communicationCampaign =
    await prisma.communicationCampaign.findUnique({
      where: {
        voiceCampaignId:
          call.campaignId,
      },

      select: {
        id: true,
      },
    });

  const allowedActions =
    communicationCampaign
      ? (
          await prisma.campaignAction.findMany({
            where: {
              communicationCampaignId:
                communicationCampaign.id,

              enabled: true,
            },

            select: {
              actionCode: true,

              requiredAuthLevel: true,
            },
          })
        )
          .filter(action =>
            hasSufficientAuthLevel(
              call.authenticationLevel,
              action.requiredAuthLevel
            )
          )
          .map(action => action.actionCode)
      : [];

  return {
    callId: call.id,
    campaignId: call.campaignId,
    contactId: call.contactId,
    direction: call.direction,
    authenticationLevel:
      call.authenticationLevel,
    riskLevel: call.riskLevel,
    authenticationVerifiedAt:
      call.authenticationVerifiedAt,
    securityFlags:
      normalizeSecurityFlags(
        call.securityFlags
      ),
    allowedActions,
    updatedAt: call.updatedAt,
  };
}
