import {
  CallDirection,
  CallStatus,
  CampaignStatus,
  Prisma,
} from "@prisma/client";

import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

//--------------------------------------------------
// Hoisted Mocks
//--------------------------------------------------

const mocks =
  vi.hoisted(
    () => {
      const logger = {
        debug:
          vi.fn(),

        info:
          vi.fn(),

        warn:
          vi.fn(),

        error:
          vi.fn(),
      };

      const transaction = {
        campaign: {
          upsert:
            vi.fn(),
        },

        contact: {
          upsert:
            vi.fn(),
        },

        call: {
          create:
            vi.fn(),
        },
      };

      const prisma = {
        call: {
          findUnique:
            vi.fn(),
        },

        $transaction:
          vi.fn(),
      };

      const ivrMenuSession = {
        reset:
          vi.fn(),
      };

      return {
        logger,
        transaction,
        prisma,
        ivrMenuSession,
      };
    }
  );

//--------------------------------------------------
// Module Mocks
//--------------------------------------------------

vi.mock(
  "@/lib/prisma",
  () => ({
    prisma:
      mocks.prisma,
  })
);
vi.mock(
  "@/lib/logger",
  () => ({
    createLogger:
      vi.fn(
        () =>
          mocks.logger
      ),

    createServerLogger:
      vi.fn(
        () =>
          mocks.logger
      ),

    createCallLogger:
      vi.fn(
        () =>
          mocks.logger
      ),

    maskPhoneNumber:
      vi.fn(
        (
          phoneNumber: string
        ) =>
          phoneNumber.length >= 4
            ? `***${phoneNumber.slice(-4)}`
            : "***"
      ),

    normalizeError:
      vi.fn(
        (
          error: unknown
        ) => ({
          message:
            error instanceof Error
              ? error.message
              : String(
                  error
                ),
        })
      ),
  })
);


vi.mock(
  "@/services/ivr/ivr-menu-session.service",
  () => ({
    IVRMenuSessionService:
      mocks.ivrMenuSession,
  })
);

//--------------------------------------------------
// Import Service After Mocks
//--------------------------------------------------

import {
  createOrGetInboundCall,
} from "@/services/calls/inbound-call.service";

//--------------------------------------------------
// Constants
//--------------------------------------------------

const PROVIDER_CALL_ID =
  "CA123456789";

const CALL_ID =
  "call-1";

const CONTACT_ID =
  "contact-1";

const CAMPAIGN_ID =
  "campaign-1";

const CALLER_NUMBER =
  "+919876543210";

const CALLED_NUMBER =
  "+914012345678";

const TENANT_ID =
  "tenant-1";

const INBOUND_PROFILE_ID =
  "inbound-profile-1";

//--------------------------------------------------
// Default Mock Setup
//--------------------------------------------------

function configureSuccessfulCreation(): void {
  mocks
    .ivrMenuSession
    .reset
    .mockResolvedValue(
      undefined
    );

  mocks
    .transaction
    .campaign
    .upsert
    .mockResolvedValue({
      id:
        CAMPAIGN_ID,
    });

  mocks
    .transaction
    .contact
    .upsert
    .mockResolvedValue({
      id:
        CONTACT_ID,

      language:
        "English",
    });

  mocks
    .transaction
    .call
    .create
    .mockResolvedValue({
      id:
        CALL_ID,

      contactId:
        CONTACT_ID,

      campaignId:
        CAMPAIGN_ID,

      language:
        "English",
    });

  mocks
    .prisma
    .$transaction
    .mockImplementation(
      async (
        callback: (
          transaction:
            typeof mocks.transaction
        ) => Promise<unknown>
      ) =>
        callback(
          mocks.transaction
        )
    );
}

//--------------------------------------------------
// Tests
//--------------------------------------------------

describe(
  "createOrGetInboundCall",
  () => {
    beforeEach(
      () => {
        vi.clearAllMocks();

        mocks
          .prisma
          .call
          .findUnique
          .mockResolvedValue(
            null
          );

        configureSuccessfulCreation();
      }
    );

    //------------------------------------------------
    // Validation
    //------------------------------------------------

    it(
      "rejects an empty provider CallSid",
      async () => {
        await expect(
          createOrGetInboundCall({
            providerCallId:
              "   ",

            callerNumber:
              CALLER_NUMBER,

            calledNumber:
              CALLED_NUMBER,

            tenantId:
              TENANT_ID,

            inboundProfileId:
              INBOUND_PROFILE_ID,
          })
        ).rejects.toThrow(
          "Provider CallSid is required"
        );

        expect(
          mocks
            .prisma
            .$transaction
        ).not.toHaveBeenCalled();
      }
    );

    it(
      "rejects an empty caller phone number",
      async () => {
        await expect(
          createOrGetInboundCall({
            providerCallId:
              PROVIDER_CALL_ID,

            callerNumber:
              "   ",

            calledNumber:
              CALLED_NUMBER,

            tenantId:
              TENANT_ID,

            inboundProfileId:
              INBOUND_PROFILE_ID,
          })
        ).rejects.toThrow(
          "Caller phone number is required"
        );

        expect(
          mocks
            .prisma
            .$transaction
        ).not.toHaveBeenCalled();
      }
    );

    it(
      "rejects an empty called phone number",
      async () => {
        await expect(
          createOrGetInboundCall({
            providerCallId:
              PROVIDER_CALL_ID,

            callerNumber:
              CALLER_NUMBER,

            calledNumber:
              "   ",

            tenantId:
              TENANT_ID,

            inboundProfileId:
              INBOUND_PROFILE_ID,
          })
        ).rejects.toThrow(
          "Called phone number is required"
        );

        expect(
          mocks
            .prisma
            .$transaction
        ).not.toHaveBeenCalled();
      }
    );

    it(
      "rejects caller numbers longer than E.164 maximum length",
      async () => {
        await expect(
          createOrGetInboundCall({
            providerCallId:
              PROVIDER_CALL_ID,

            callerNumber:
              "+1234567890123456",

            calledNumber:
              CALLED_NUMBER,

            tenantId:
              TENANT_ID,

            inboundProfileId:
              INBOUND_PROFILE_ID,
          })
        ).rejects.toThrow(
          "Caller phone number is required"
        );

        expect(
          mocks
            .prisma
            .$transaction
        ).not.toHaveBeenCalled();
      }
    );

    it(
      "rejects called numbers longer than E.164 maximum length",
      async () => {
        await expect(
          createOrGetInboundCall({
            providerCallId:
              PROVIDER_CALL_ID,

            callerNumber:
              CALLER_NUMBER,

            calledNumber:
              "+1234567890123456",

            tenantId:
              TENANT_ID,

            inboundProfileId:
              INBOUND_PROFILE_ID,
          })
        ).rejects.toThrow(
          "Called phone number is required"
        );
      }
    );

    //------------------------------------------------
    // Input Normalization
    //------------------------------------------------

    it(
      "trims the provider CallSid and normalizes phone numbers",
      async () => {
        const result =
          await createOrGetInboundCall({
            providerCallId:
              `  ${PROVIDER_CALL_ID}  `,

            callerNumber:
              "+91 98765-43210",

            calledNumber:
              "+91 (40) 1234-5678",

            tenantId:
              TENANT_ID,

            inboundProfileId:
              INBOUND_PROFILE_ID,
          });

        expect(
          mocks
            .prisma
            .call
            .findUnique
        ).toHaveBeenCalledWith({
          where: {
            providerCallId:
              PROVIDER_CALL_ID,
          },

          select: {
            id:
              true,

            contactId:
              true,

            campaignId:
              true,

            direction:
              true,

            status:
              true,

            tenantId:
              true,

            inboundProfileId:
              true,
          },
        });

        expect(
          mocks
            .transaction
            .contact
            .upsert
        ).toHaveBeenCalledWith(
          expect.objectContaining({
            where: {
              tenantId_phone: {
                tenantId: TENANT_ID,
                phone: CALLER_NUMBER,
              },
            },
          })
        );

        expect(
          mocks
            .transaction
            .call
            .create
        ).toHaveBeenCalledWith(
          expect.objectContaining({
            data:
              expect.objectContaining({
                providerCallId:
                  PROVIDER_CALL_ID,

                callerNumber:
                  CALLER_NUMBER,

                calledNumber:
                  CALLED_NUMBER,

            tenantId:
              TENANT_ID,

            inboundProfileId:
              INBOUND_PROFILE_ID,
              }),
          })
        );

        expect(
          result
        ).toEqual({
          callId:
            CALL_ID,

          contactId:
            CONTACT_ID,

          campaignId:
            CAMPAIGN_ID,

          tenantId:
            TENANT_ID,

          inboundProfileId:
            INBOUND_PROFILE_ID,

          created:
            true,
        });
      }
    );

    //------------------------------------------------
    // Idempotency
    //------------------------------------------------

    it(
      "returns an existing inbound call without creating duplicate records",
      async () => {
        mocks
          .prisma
          .call
          .findUnique
          .mockResolvedValue({
            id:
              CALL_ID,

            contactId:
              CONTACT_ID,

            campaignId:
              CAMPAIGN_ID,

            direction:
              CallDirection.INBOUND,

            tenantId:
              TENANT_ID,

            inboundProfileId:
              INBOUND_PROFILE_ID,
          });

        const result =
          await createOrGetInboundCall({
            providerCallId:
              PROVIDER_CALL_ID,

            callerNumber:
              CALLER_NUMBER,

            calledNumber:
              CALLED_NUMBER,

            tenantId:
              TENANT_ID,

            inboundProfileId:
              INBOUND_PROFILE_ID,
          });

        expect(
          result
        ).toEqual({
          callId:
            CALL_ID,

          contactId:
            CONTACT_ID,

          campaignId:
            CAMPAIGN_ID,

          tenantId:
            TENANT_ID,

          inboundProfileId:
            INBOUND_PROFILE_ID,

          created:
            false,
        });

        expect(
          mocks
            .prisma
            .$transaction
        ).not.toHaveBeenCalled();

      }
    );

    it(
      "rejects a provider CallSid already associated with an outbound call",
      async () => {
        mocks
          .prisma
          .call
          .findUnique
          .mockResolvedValue({
            id:
              CALL_ID,

            contactId:
              CONTACT_ID,

            campaignId:
              CAMPAIGN_ID,

            direction:
              CallDirection.OUTBOUND,
          });

        await expect(
          createOrGetInboundCall({
            providerCallId:
              PROVIDER_CALL_ID,

            callerNumber:
              CALLER_NUMBER,

            calledNumber:
              CALLED_NUMBER,

            tenantId:
              TENANT_ID,

            inboundProfileId:
              INBOUND_PROFILE_ID,
          })
        ).rejects.toThrow(
          "Provider CallSid is already associated with an outbound call"
        );

        expect(
          mocks
            .prisma
            .$transaction
        ).not.toHaveBeenCalled();
      }
    );

    //------------------------------------------------
    // Transaction Creation
    //------------------------------------------------

    it(
      "creates the inbound system campaign",
      async () => {
        await createOrGetInboundCall({
          providerCallId:
            PROVIDER_CALL_ID,

          callerNumber:
            CALLER_NUMBER,

          calledNumber:
            CALLED_NUMBER,

            tenantId:
              TENANT_ID,

            inboundProfileId:
              INBOUND_PROFILE_ID,

          language:
            "Hindi",
        });

        expect(
          mocks
            .transaction
            .campaign
            .upsert
        ).toHaveBeenCalledWith({
          where: {
              systemKey:
                `INBOUND_ENQUIRIES:${TENANT_ID}`,
          },

          update: {
            status:
              CampaignStatus.RUNNING,

            language:
              "Hindi",
          },

          create: {
            name:
              "Inbound Enquiries",

            description:
              "System campaign used to track incoming enquiry calls.",

              systemKey:
                `INBOUND_ENQUIRIES:${TENANT_ID}`,

            language:
              "Hindi",

            voice:
              "Female",

            status:
              CampaignStatus.RUNNING,

            startedAt:
              expect.any(
                Date
              ),
          },

          select: {
            id:
              true,
          },
        });
      }
    );

    it(
      "creates a placeholder contact for an unknown inbound caller",
      async () => {
        await createOrGetInboundCall({
          providerCallId:
            PROVIDER_CALL_ID,

          callerNumber:
            CALLER_NUMBER,

          calledNumber:
            CALLED_NUMBER,

            tenantId:
              TENANT_ID,

            inboundProfileId:
              INBOUND_PROFILE_ID,

          language:
            "Hindi",
        });

        expect(
          mocks
            .transaction
            .contact
            .upsert
        ).toHaveBeenCalledWith({
            where: {
              tenantId_phone: {
                tenantId: TENANT_ID,
                phone: CALLER_NUMBER,
              },
            },

          update: {
            language:
              "Hindi",
          },

          create: {
            fullName:
              "Inbound Caller 3210",

              phone:
                CALLER_NUMBER,

              tenantId:
                TENANT_ID,

            language:
              "Hindi",
          },

          select: {
            id:
              true,
          },
        });
      }
    );

    it(
      "uses the requested language for the inbound call",
      async () => {
        mocks
          .transaction
          .contact
          .upsert
          .mockResolvedValue({
            id:
              CONTACT_ID,
          });

        await createOrGetInboundCall({
          providerCallId:
            PROVIDER_CALL_ID,

          callerNumber:
            CALLER_NUMBER,

          calledNumber:
            CALLED_NUMBER,

            tenantId:
              TENANT_ID,

            inboundProfileId:
              INBOUND_PROFILE_ID,

          language:
            "Hindi",
        });

        expect(
          mocks
            .transaction
            .call
            .create
        ).toHaveBeenCalledWith(
          expect.objectContaining({
            data:
              expect.objectContaining({
                language:
                  "Hindi",
              }),
          })
        );
      }
    );

    it(
      "creates an answered inbound call and conversation atomically",
      async () => {
        await createOrGetInboundCall({
          providerCallId:
            PROVIDER_CALL_ID,

          callerNumber:
            CALLER_NUMBER,

          calledNumber:
            CALLED_NUMBER,

            tenantId:
              TENANT_ID,

            inboundProfileId:
              INBOUND_PROFILE_ID,
        });

        expect(
          mocks
            .prisma
            .$transaction
        ).toHaveBeenCalledOnce();

        expect(
          mocks
            .transaction
            .call
            .create
        ).toHaveBeenCalledWith({
          data:
            expect.objectContaining({
              providerCallId:
                PROVIDER_CALL_ID,

              direction:
                CallDirection.INBOUND,

              callerNumber:
                CALLER_NUMBER,

              calledNumber:
                CALLED_NUMBER,

            tenantId:
              TENANT_ID,

            inboundProfileId:
              INBOUND_PROFILE_ID,

              campaignId:
                CAMPAIGN_ID,

              campaignRunId:
                null,

              contactId:
                CONTACT_ID,

              contactPhoneSnapshot:
                CALLER_NUMBER,

              providerDestination:
                CALLED_NUMBER,

              usedDevelopmentOverride:
                false,

              language:
                "English",

              status:
                CallStatus.ANSWERED,

              attemptNumber:
                1,

              maxAttempts:
                1,

              requestedAt:
                expect.any(
                  Date
                ),

              queuedAt:
                expect.any(
                  Date
                ),

              answeredAt:
                expect.any(
                  Date
                ),

              startedAt:
                expect.any(
                  Date
                ),

              conversation: {
                create: {},
              },
            }),

          select: {
            id:
              true,

            contactId:
              true,

            campaignId:
              true,
          },
        });
      }
    );

    it(
      "pins the inbound call to the profile-selected IVR version and Premium runtime",
      async () => {
        await createOrGetInboundCall({
          providerCallId: PROVIDER_CALL_ID,
          callerNumber: CALLER_NUMBER,
          calledNumber: CALLED_NUMBER,
          tenantId: TENANT_ID,
          inboundProfileId: INBOUND_PROFILE_ID,
          ivrFlowVersionId: "published-version-2",
          requestedRuntime: "GEMINI_LIVE",
        });

        expect(mocks.transaction.call.create).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({
              ivrFlowVersionId: "published-version-2",
              requestedRuntime: "GEMINI_LIVE",
              effectiveRuntime: null,
              fallbackUsed: false,
              fallbackReason: null,
            }),
          })
        );
      }
    );

    it(
      "uses English when no language is provided",
      async () => {
        await createOrGetInboundCall({
          providerCallId:
            PROVIDER_CALL_ID,

          callerNumber:
            CALLER_NUMBER,

          calledNumber:
            CALLED_NUMBER,

            tenantId:
              TENANT_ID,

            inboundProfileId:
              INBOUND_PROFILE_ID,
        });

        expect(
          mocks
            .transaction
            .campaign
            .upsert
        ).toHaveBeenCalledWith(
          expect.objectContaining({
            create:
              expect.objectContaining({
                language:
                  "English",
              }),
          })
        );
      }
    );

    it(
      "returns the created inbound call result",
      async () => {
        const result =
          await createOrGetInboundCall({
            providerCallId:
              PROVIDER_CALL_ID,

            callerNumber:
              CALLER_NUMBER,

            calledNumber:
              CALLED_NUMBER,

            tenantId:
              TENANT_ID,

            inboundProfileId:
              INBOUND_PROFILE_ID,
          });

        expect(
          result
        ).toEqual({
          callId:
            CALL_ID,

          contactId:
            CONTACT_ID,

          campaignId:
            CAMPAIGN_ID,

          tenantId:
            TENANT_ID,

          inboundProfileId:
            INBOUND_PROFILE_ID,

          created:
            true,
        });

        expect(
          mocks
            .logger
            .info
        ).toHaveBeenCalledWith(
          expect.objectContaining({
            event:
              "inbound.call.created",

            direction:
              CallDirection.INBOUND,

            tenantId:
              TENANT_ID,

          inboundProfileId:
            INBOUND_PROFILE_ID,

            callerNumber:
              "***3210",

          calledNumber:
            "***5678",
        }),
          "Inbound call record created"
        );
      }
    );

    //------------------------------------------------
    // Concurrent Duplicate Handling
    //------------------------------------------------

    it(
      "resolves a concurrent P2002 duplicate webhook",
      async () => {
        const duplicateError =
          new Prisma
            .PrismaClientKnownRequestError(
              "Unique constraint failed",
              {
                code:
                  "P2002",

                clientVersion:
                  "6.19.3",

                meta: {
                  target: [
                    "providerCallId",
                  ],
                },
              }
            );

        mocks
          .prisma
          .call
          .findUnique
          .mockResolvedValueOnce(
            null
          )
          .mockResolvedValueOnce({
            id:
              CALL_ID,

            contactId:
              CONTACT_ID,

            campaignId:
              CAMPAIGN_ID,

            direction:
              CallDirection.INBOUND,

            tenantId:
              TENANT_ID,

            inboundProfileId:
              INBOUND_PROFILE_ID,
          });

        mocks
          .prisma
          .$transaction
          .mockRejectedValue(
            duplicateError
          );

        const result =
          await createOrGetInboundCall({
            providerCallId:
              PROVIDER_CALL_ID,

            callerNumber:
              CALLER_NUMBER,

            calledNumber:
              CALLED_NUMBER,

            tenantId:
              TENANT_ID,

            inboundProfileId:
              INBOUND_PROFILE_ID,
          });

        expect(
          result
        ).toEqual({
          callId:
            CALL_ID,

          contactId:
            CONTACT_ID,

          campaignId:
            CAMPAIGN_ID,

          tenantId:
            TENANT_ID,

          inboundProfileId:
            INBOUND_PROFILE_ID,

          created:
            false,
        });

      }
    );

    it(
      "does not return an outbound call after a concurrent duplicate error",
      async () => {
        const duplicateError =
          new Prisma
            .PrismaClientKnownRequestError(
              "Unique constraint failed",
              {
                code:
                  "P2002",

                clientVersion:
                  "6.19.3",

                meta: {
                  target: [
                    "providerCallId",
                  ],
                },
              }
            );

        mocks
          .prisma
          .call
          .findUnique
          .mockResolvedValueOnce(
            null
          )
          .mockResolvedValueOnce({
            id:
              CALL_ID,

            contactId:
              CONTACT_ID,

            campaignId:
              CAMPAIGN_ID,

            direction:
              CallDirection.OUTBOUND,
          });

        mocks
          .prisma
          .$transaction
          .mockRejectedValue(
            duplicateError
          );

        await expect(
          createOrGetInboundCall({
            providerCallId:
              PROVIDER_CALL_ID,

            callerNumber:
              CALLER_NUMBER,

            calledNumber:
              CALLED_NUMBER,

            tenantId:
              TENANT_ID,

            inboundProfileId:
              INBOUND_PROFILE_ID,
          })
        ).rejects.toBe(
          duplicateError
        );

        expect(
          mocks
            .logger
            .error
        ).toHaveBeenCalledWith(
          expect.objectContaining({
            event:
              "inbound.call.create.failed",
          }),
          "Inbound call creation failed"
        );
      }
    );

    //------------------------------------------------
    // Unexpected Failure
    //------------------------------------------------

    it(
      "logs and rethrows unexpected transaction failures",
      async () => {
        const databaseError =
          new Error(
            "Database unavailable"
          );

        mocks
          .prisma
          .$transaction
          .mockRejectedValue(
            databaseError
          );

        await expect(
          createOrGetInboundCall({
            providerCallId:
              PROVIDER_CALL_ID,

            callerNumber:
              CALLER_NUMBER,

            calledNumber:
              CALLED_NUMBER,

            tenantId:
              TENANT_ID,

            inboundProfileId:
              INBOUND_PROFILE_ID,
          })
        ).rejects.toBe(
          databaseError
        );

        expect(
          mocks
            .logger
            .error
        ).toHaveBeenCalledWith(
          expect.objectContaining({
            event:
              "inbound.call.create.failed",

            callerNumber:
              "***3210",

            calledNumber:
              "***5678",

            tenantId:
              TENANT_ID,

            inboundProfileId:
              INBOUND_PROFILE_ID,


            error: {
              message:
                "Database unavailable",
            },
          }),
          "Inbound call creation failed"
        );
      }
    );
  }
);
