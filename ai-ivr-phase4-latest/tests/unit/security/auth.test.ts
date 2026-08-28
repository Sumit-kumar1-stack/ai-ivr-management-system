import {
  AccountStatus,
  TenantStatus,
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
    () => ({
      cookies:
        vi.fn(),

      verifyToken:
        vi.fn(),

      findUnique:
        vi.fn(),
    })
  );

//--------------------------------------------------
// Dependency Mocks
//--------------------------------------------------

vi.mock(
  "next/headers",
  () => ({
    cookies:
      mocks.cookies,
  })
);

vi.mock(
  "@/lib/jwt",
  () => ({
    verifyToken:
      mocks.verifyToken,
  })
);

vi.mock(
  "@/lib/prisma",
  () => ({
    prisma: {
      user: {
        findUnique:
          mocks.findUnique,
      },
    },
  })
);

//--------------------------------------------------
// Import Real Auth Helper
//--------------------------------------------------

import {
  AUTH_COOKIE_NAME,
  AuthenticationError,
  AuthorizationError,
  getCurrentUser,
  isAuthenticationError,
  isAuthorizationError,
  requireRole,
  requireUser,
} from "@/lib/auth";

//--------------------------------------------------
// Fixtures
//--------------------------------------------------

const activeAdmin = {
  id:
    "user-1",

  fullName:
    "Test Admin",

  email:
    "admin@example.com",

  role:
    UserRole.ADMIN,

  phone:
    null,

  avatar:
    null,

  tenantId:
    null,

  tenantName:
    null,

  tenantStatus:
    null,

  accountStatus:
    AccountStatus.ACTIVE,

  isActive:
    true,
};

function mockCookie(
  token:
    string |
    undefined
) {
  mocks.cookies.mockResolvedValue({
    get:
      vi.fn(
        (
          name: string
        ) => {
          if (
            name !==
              AUTH_COOKIE_NAME ||
            !token
          ) {
            return undefined;
          }

          return {
            value:
              token,
          };
        }
      ),
  });
}

//--------------------------------------------------
// Tests
//--------------------------------------------------

describe(
  "authentication helpers",
  () => {
    beforeEach(
      () => {
        vi.clearAllMocks();

        mockCookie(
          "valid-token"
        );

        mocks
          .verifyToken
          .mockReturnValue({
            userId:
              "user-1",

            role:
              UserRole.AGENT,
          });

        mocks
          .findUnique
          .mockResolvedValue(
            activeAdmin
          );
      }
    );

    //------------------------------------------------
    // getCurrentUser
    //------------------------------------------------

    describe(
      "getCurrentUser",
      () => {
        it(
          "returns null when the authentication cookie is missing",
          async () => {
            mockCookie(
              undefined
            );

            const result =
              await getCurrentUser();

            expect(
              result
            ).toBeNull();

            expect(
              mocks.verifyToken
            ).not.toHaveBeenCalled();

            expect(
              mocks.findUnique
            ).not.toHaveBeenCalled();
          }
        );

        it(
          "returns null when token verification fails",
          async () => {
            mocks
              .verifyToken
              .mockImplementation(
                () => {
                  throw new Error(
                    "Invalid token"
                  );
                }
              );

            const result =
              await getCurrentUser();

            expect(
              result
            ).toBeNull();

            expect(
              mocks.findUnique
            ).not.toHaveBeenCalled();
          }
        );

        it(
          "returns null when the user does not exist",
          async () => {
            mocks
              .findUnique
              .mockResolvedValue(
                null
              );

            const result =
              await getCurrentUser();

            expect(
              result
            ).toBeNull();
          }
        );

        it(
          "returns null when the user is inactive",
          async () => {
            mocks
              .findUnique
              .mockResolvedValue({
                ...activeAdmin,

                isActive:
                  false,
              });

            const result =
              await getCurrentUser();

            expect(
              result
            ).toBeNull();
          }
        );

        it(
          "returns the active database user",
          async () => {
            const result =
              await getCurrentUser();

            expect(
              result
            ).toEqual(
              activeAdmin
            );

            expect(
              mocks.findUnique
            ).toHaveBeenCalledWith({
              where: {
                id:
                  "user-1",
              },

              select: {
                id:
                  true,

                fullName:
                  true,

                email:
                  true,

                role:
                  true,

                phone:
                  true,

                avatar:
                  true,

                tenantId:
                  true,

                accountStatus:
                  true,

                isActive:
                  true,

                tenant: {
                  select: {
                    name:
                      true,

                    status:
                      true,
                  },
                },
              },
            });
        }
        );

        it(
          "uses the current database role instead of the JWT role",
          async () => {
            mocks
              .verifyToken
              .mockReturnValue({
                userId:
                  "user-1",

                role:
                  UserRole.AGENT,
              });

            mocks
              .findUnique
              .mockResolvedValue({
                ...activeAdmin,

                role:
                  UserRole.SUPER_ADMIN,
              });

            const result =
              await getCurrentUser();

            expect(
              result?.role
            ).toBe(
              UserRole.SUPER_ADMIN
            );
          }
        );

        it(
          "returns null when the tenant is suspended",
          async () => {
            mocks.findUnique.mockResolvedValue({
              ...activeAdmin,
              tenantStatus: TenantStatus.SUSPENDED,
              tenant: {
                name: "Tenant",
                status: TenantStatus.SUSPENDED,
              },
            });

            const result = await getCurrentUser();

            expect(result).toBeNull();
          }
        );

        it(
          "returns null when the database lookup fails",
          async () => {
            mocks
              .findUnique
              .mockRejectedValue(
                new Error(
                  "Database unavailable"
                )
              );

            const result =
              await getCurrentUser();

            expect(
              result
            ).toBeNull();
          }
        );
      }
    );

    //------------------------------------------------
    // requireUser
    //------------------------------------------------

    describe(
      "requireUser",
      () => {
        it(
          "returns the authenticated user",
          async () => {
            await expect(
              requireUser()
            ).resolves.toEqual(
              activeAdmin
            );
          }
        );

        it(
          "throws AuthenticationError when no valid user exists",
          async () => {
            mockCookie(
              undefined
            );

            await expect(
              requireUser()
            ).rejects.toBeInstanceOf(
              AuthenticationError
            );
          }
        );

        it(
          "uses status code 401 for authentication errors",
          () => {
            const error =
              new AuthenticationError();

            expect(
              error.statusCode
            ).toBe(
              401
            );

            expect(
              error.message
            ).toBe(
              "Authentication required"
            );
          }
        );
      }
    );

    //------------------------------------------------
    // requireRole
    //------------------------------------------------

    describe(
      "requireRole",
      () => {
        it(
          "allows a user whose role is included",
          async () => {
            await expect(
              requireRole([
                UserRole.ADMIN,
                UserRole.SUPER_ADMIN,
              ])
            ).resolves.toEqual(
              activeAdmin
            );
          }
        );

        it(
          "rejects a user whose role is not included",
          async () => {
            await expect(
              requireRole([
                UserRole.SUPER_ADMIN,
              ])
            ).rejects.toBeInstanceOf(
              AuthorizationError
            );
          }
        );

        it(
          "uses status code 403 for authorization errors",
          () => {
            const error =
              new AuthorizationError();

            expect(
              error.statusCode
            ).toBe(
              403
            );

            expect(
              error.message
            ).toBe(
              "You do not have permission to perform this action"
            );
          }
        );

        it(
          "throws AuthenticationError before checking roles when no user exists",
          async () => {
            mockCookie(
              undefined
            );

            await expect(
              requireRole([
                UserRole.ADMIN,
              ])
            ).rejects.toBeInstanceOf(
              AuthenticationError
            );
          }
        );
      }
    );

    //------------------------------------------------
    // Error Guards
    //------------------------------------------------

    describe(
      "error type guards",
      () => {
        it(
          "identifies AuthenticationError correctly",
          () => {
            const authenticationError =
              new AuthenticationError();

            expect(
              isAuthenticationError(
                authenticationError
              )
            ).toBe(
              true
            );

            expect(
              isAuthorizationError(
                authenticationError
              )
            ).toBe(
              false
            );
          }
        );

        it(
          "identifies AuthorizationError correctly",
          () => {
            const authorizationError =
              new AuthorizationError();

            expect(
              isAuthorizationError(
                authorizationError
              )
            ).toBe(
              true
            );

            expect(
              isAuthenticationError(
                authorizationError
              )
            ).toBe(
              false
            );
          }
        );

        it(
          "does not classify normal errors as auth errors",
          () => {
            const error =
              new Error(
                "Unexpected failure"
              );

            expect(
              isAuthenticationError(
                error
              )
            ).toBe(
              false
            );

            expect(
              isAuthorizationError(
                error
              )
            ).toBe(
              false
            );
          }
        );
      }
    );
  }
);
