import {
  NextRequest,
} from "next/server";

import {
  UserRole,
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
      class MockAuthenticationError
        extends Error {
        readonly statusCode =
          401;

        constructor(
          message =
            "Authentication required"
        ) {
          super(
            message
          );

          this.name =
            "AuthenticationError";
        }
      }

      class MockAuthorizationError
        extends Error {
        readonly statusCode =
          403;

        constructor(
          message =
            "You do not have permission to perform this action"
        ) {
          super(
            message
          );

          this.name =
            "AuthorizationError";
        }
      }

      return {
        requireRole:
          vi.fn(),

        callFindMany:
          vi.fn(),

        callCount:
          vi.fn(),

        callFindUnique:
          vi.fn(),

        transaction:
          vi.fn(),

        MockAuthenticationError,

        MockAuthorizationError,
      };
    }
  );

//--------------------------------------------------
// Auth Mock
//--------------------------------------------------

vi.mock(
  "@/lib/auth",
  () => ({
    AuthenticationError:
      mocks.MockAuthenticationError,

    AuthorizationError:
      mocks.MockAuthorizationError,

    requireRole:
      mocks.requireRole,

    isAuthenticationError:
      (
        error: unknown
      ) =>
        error instanceof
        mocks.MockAuthenticationError,

    isAuthorizationError:
      (
        error: unknown
      ) =>
        error instanceof
        mocks.MockAuthorizationError,
  })
);

//--------------------------------------------------
// Prisma Mock
//--------------------------------------------------

vi.mock(
  "@/lib/prisma",
  () => ({
    prisma: {
      call: {
        findMany:
          mocks.callFindMany,

        count:
          mocks.callCount,

        findUnique:
          mocks.callFindUnique,
      },

      $transaction:
        mocks.transaction,
    },
  })
);

vi.mock(
  "@/services/security/tenant-access.service",
  () => ({
    assertCallOwnership:
      vi.fn(
        async () => undefined
      ),
  })
);

//--------------------------------------------------
// Route Imports After Mocks
//--------------------------------------------------

import {
  GET as getCalls,
} from "@/app/api/calls/route";

import {
  GET as getCallDetails,
} from "@/app/api/calls/[id]/route";

//--------------------------------------------------
// Request Helpers
//--------------------------------------------------

function createCallsRequest(
  query = ""
): NextRequest {
  return new NextRequest(
    `https://example.com/api/calls${query}`,
    {
      method:
        "GET",
    }
  );
}

function createDetailsRequest():
  NextRequest {
  return new NextRequest(
    "https://example.com/api/calls/call-1",
    {
      method:
        "GET",
    }
  );
}

function createContext(
  id: string
) {
  return {
    params:
      Promise.resolve({
        id,
      }),
  };
}

//--------------------------------------------------
// Tests
//--------------------------------------------------

describe(
  "call route authorization",
  () => {
    beforeEach(
      () => {
        vi.clearAllMocks();

        mocks
          .requireRole
          .mockResolvedValue({
            id:
              "user-1",

            fullName:
              "Test Agent",

            email:
              "agent@example.com",

            role:
              UserRole.AGENT,

            phone:
              null,

            avatar:
              null,

            isActive:
              true,
          });

        mocks
          .callFindMany
          .mockResolvedValue(
            []
          );

        mocks
          .callCount
          .mockResolvedValue(
            0
          );

        mocks
          .callFindUnique
          .mockResolvedValue({
            id:
              "call-1",

            providerCallId:
              "CA123",

            status:
              "COMPLETED",

            language:
              "en",

            duration:
              42,

            transcript:
              "Existing transcript",

            summary:
              "Summary",

            contact:
              null,

            campaign:
              null,

            campaignRun:
              null,

            retryOfCall:
              null,

            retryAttempts:
              [],

            conversation:
              null,

            events:
              [],
          } as never);

        mocks
          .transaction
          .mockImplementation(
            async (
              operations: unknown[]
            ) =>
              Promise.all(
                operations
              )
          );

        vi.spyOn(
          console,
          "error"
        ).mockImplementation(
          () => undefined
        );
      }
    );

    //------------------------------------------------
    // Call List Authentication
    //------------------------------------------------

    describe(
      "GET /api/calls",
      () => {
        it(
          "returns 401 when authentication is missing",
          async () => {
            mocks
              .requireRole
              .mockRejectedValue(
                new mocks
                  .MockAuthenticationError()
              );

            const response =
              await getCalls(
                createCallsRequest()
              );

            const body =
              await response.json();

            expect(
              response.status
            ).toBe(
              401
            );

            expect(
              body
            ).toEqual({
              success:
                false,

              message:
                "Authentication required",
            });

            expect(
              mocks.callFindMany
            ).not.toHaveBeenCalled();

            expect(
              mocks.callCount
            ).not.toHaveBeenCalled();

            expect(
              mocks.transaction
            ).not.toHaveBeenCalled();
          }
        );

        it(
          "returns 403 when the user lacks an allowed role",
          async () => {
            mocks
              .requireRole
              .mockRejectedValue(
                new mocks
                  .MockAuthorizationError()
              );

            const response =
              await getCalls(
                createCallsRequest()
              );

            const body =
              await response.json();

            expect(
              response.status
            ).toBe(
              403
            );

            expect(
              body
            ).toEqual({
              success:
                false,

              message:
                "You do not have permission to perform this action",
            });

            expect(
              mocks.transaction
            ).not.toHaveBeenCalled();
          }
        );

        it(
          "allows AGENT, ADMIN and SUPER_ADMIN roles",
          async () => {
            const response =
              await getCalls(
                createCallsRequest()
              );

            expect(
              response.status
            ).toBe(
              200
            );

            expect(
              mocks.requireRole
            ).toHaveBeenCalledWith([
              UserRole.AGENT,
              UserRole.ADMIN,
              UserRole.SUPER_ADMIN,
            ]);

            expect(
              mocks.transaction
            ).toHaveBeenCalledOnce();
          }
        );

        it(
          "returns an empty paginated response for an authorized user",
          async () => {
            const response =
              await getCalls(
                createCallsRequest()
              );

            const body =
              await response.json();

            expect(
              body
            ).toEqual({
              success:
                true,

              data:
                [],

              meta: {
                page:
                  1,

                limit:
                  10,

                total:
                  0,

                totalPages:
                  0,

                hasPreviousPage:
                  false,

                hasNextPage:
                  false,
              },

              filters: {
                search:
                  null,

                status:
                  null,

                campaignId:
                  null,

                dateFrom:
                  null,

                dateTo:
                  null,
              },
            });
          }
        );

        it(
          "returns 500 without exposing internal errors",
          async () => {
            mocks
              .transaction
              .mockRejectedValue(
                new Error(
                  "SECRET_DATABASE_FAILURE"
                )
              );

            const response =
              await getCalls(
                createCallsRequest()
              );

            const body =
              await response.json();

            expect(
              response.status
            ).toBe(
              500
            );

            expect(
              body
            ).toEqual({
              success:
                false,

              message:
                "Failed to fetch calls",
            });

            expect(
              JSON.stringify(
                body
              )
            ).not.toContain(
              "SECRET_DATABASE_FAILURE"
            );
          }
        );
      }
    );

    //------------------------------------------------
    // Call Details Authentication
    //------------------------------------------------

    describe(
      "GET /api/calls/[id]",
      () => {
        it(
          "returns 401 before looking up call details",
          async () => {
            mocks
              .requireRole
              .mockRejectedValue(
                new mocks
                  .MockAuthenticationError()
              );

            const response =
              await getCallDetails(
                createDetailsRequest(),
                createContext(
                  "call-1"
                )
              );

            expect(
              response.status
            ).toBe(
              401
            );

            expect(
              mocks.callFindUnique
            ).not.toHaveBeenCalled();
          }
        );

        it(
          "returns 403 before looking up call details",
          async () => {
            mocks
              .requireRole
              .mockRejectedValue(
                new mocks
                  .MockAuthorizationError()
              );

            const response =
              await getCallDetails(
                createDetailsRequest(),
                createContext(
                  "call-1"
                )
              );

            expect(
              response.status
            ).toBe(
              403
            );

            expect(
              mocks.callFindUnique
            ).not.toHaveBeenCalled();
          }
        );

        it(
          "uses the same allowed call-viewing roles",
          async () => {
            await getCallDetails(
              createDetailsRequest(),
              createContext(
                "call-1"
              )
            );

            expect(
              mocks.requireRole
            ).toHaveBeenCalledWith([
              UserRole.AGENT,
              UserRole.ADMIN,
              UserRole.SUPER_ADMIN,
            ]);
          }
        );

        it(
          "returns 400 for a blank call ID",
          async () => {
            const response =
              await getCallDetails(
                createDetailsRequest(),
                createContext(
                  "   "
                )
              );

            const body =
              await response.json();

            expect(
              response.status
            ).toBe(
              400
            );

            expect(
              body
            ).toEqual({
              success:
                false,

              message:
                "Call ID is required",
            });

            expect(
              mocks.callFindUnique
            ).not.toHaveBeenCalled();
          }
        );

        it(
          "returns 404 when an authorized user requests a missing call",
          async () => {
            mocks
              .callFindUnique
              .mockResolvedValue(
                null
              );

            const response =
              await getCallDetails(
                createDetailsRequest(),
                createContext(
                  "call-404"
                )
              );

            const body =
              await response.json();

            expect(
              response.status
            ).toBe(
              404
            );

            expect(
              body
            ).toEqual({
              success:
                false,

              message:
                "Call not found",
            });

            expect(
              mocks.callFindUnique
            ).toHaveBeenCalledWith(
              expect.objectContaining({
                where: {
                  id:
                    "call-404",
                },
              })
            );
          }
        );

        it(
          "returns a safe 500 response for unexpected lookup failures",
          async () => {
            mocks
              .callFindUnique
              .mockRejectedValue(
                new Error(
                  "SECRET_PRISMA_ERROR"
                )
              );

            const response =
              await getCallDetails(
                createDetailsRequest(),
                createContext(
                  "call-1"
                )
              );

            const body =
              await response.json();

            expect(
              response.status
            ).toBe(
              500
            );

            expect(
              body
            ).toEqual({
              success:
                false,

              message:
                "Failed to fetch call details",
            });

            expect(
              JSON.stringify(
                body
              )
            ).not.toContain(
              "SECRET_PRISMA_ERROR"
            );
          }
        );

        it(
          "redacts the raw transcript for AGENT users",
          async () => {
            mocks
              .callFindUnique
              .mockResolvedValue({
                id:
                  "call-1",

                providerCallId:
                  "CA123",

                status:
                  "COMPLETED",

                language:
                  "en",

                duration:
                  42,

                transcript:
                  "Sensitive call transcript",

                summary:
                  "Summary",

                contact:
                  null,

                campaign:
                  null,

                campaignRun:
                  null,

                retryOfCall:
                  null,

                retryAttempts:
                  [],

                conversation:
                  null,

                events:
                  [],
              } as never);

            const response =
              await getCallDetails(
                createDetailsRequest(),
                createContext(
                  "call-1"
                )
              );

            const body =
              await response.json();

            expect(
              response.status
            ).toBe(200);

            expect(
              body.data.transcript
            ).toBeNull();
          }
        );
      }
    );
  }
);
