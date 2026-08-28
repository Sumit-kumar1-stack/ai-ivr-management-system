import { NextRequest } from "next/server";

import { UserRole } from "@prisma/client";

import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

const mocks = vi.hoisted(() => ({
  requireRole: vi.fn(),
  createAuthErrorResponse: vi.fn(),
  findById: vi.fn(),
  findByIdForTenant: vi.fn(),
  update: vi.fn(),
  updateForTenant: vi.fn(),
  delete: vi.fn(),
  deleteForTenant: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  requireRole: mocks.requireRole,
}));

vi.mock("@/lib/auth-response", () => ({
  createAuthErrorResponse: mocks.createAuthErrorResponse,
}));

vi.mock("@/features/users/user.repository", () => ({
  UserRepository: {
    findById: mocks.findById,
    findByIdForTenant: mocks.findByIdForTenant,
    update: mocks.update,
    updateForTenant: mocks.updateForTenant,
    delete: mocks.delete,
    deleteForTenant: mocks.deleteForTenant,
  },
}));

import {
  DELETE,
  GET,
  PUT,
} from "@/app/api/users/[id]/route";

describe("users id route", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mocks.requireRole.mockResolvedValue({
      id: "user-1",
      role: UserRole.ADMIN,
      tenantId: "tenant-a",
    });

    mocks.createAuthErrorResponse.mockReturnValue(null);
    mocks.findById.mockResolvedValue(null);
    mocks.findByIdForTenant.mockResolvedValue(null);
    mocks.update.mockResolvedValue(null);
    mocks.updateForTenant.mockResolvedValue(null);
    mocks.delete.mockResolvedValue(null);
    mocks.deleteForTenant.mockResolvedValue(null);
  });

  it("scopes user reads to the authenticated tenant", async () => {
    const response = await GET(
      new NextRequest(
        "https://example.com/api/users/user-b"
      ),
      {
        params: Promise.resolve({
          id: "user-b",
        }),
      }
    );

    expect(response.status).toBe(404);
    expect(mocks.findByIdForTenant).toHaveBeenCalledWith(
      "user-b",
      "tenant-a"
    );
    expect(mocks.findById).not.toHaveBeenCalled();
  });

  it("rejects raw tenantId mutation in the update payload", async () => {
    const response = await PUT(
      new NextRequest(
        "https://example.com/api/users/user-b",
        {
          method: "PUT",
          body: JSON.stringify({
            fullName: "Updated User",
            tenantId: "tenant-b",
          }),
        }
      ),
      {
        params: Promise.resolve({
          id: "user-b",
        }),
      }
    );

    expect(response.status).toBe(400);
    expect(mocks.updateForTenant).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("rejects SUPER_ADMIN promotion in the update payload", async () => {
    const response = await PUT(
      new NextRequest(
        "https://example.com/api/users/user-b",
        {
          method: "PUT",
          body: JSON.stringify({
            fullName: "Updated User",
            role: "SUPER_ADMIN",
          }),
        }
      ),
      {
        params: Promise.resolve({
          id: "user-b",
        }),
      }
    );

    expect(response.status).toBe(400);
    expect(mocks.updateForTenant).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("rejects the platform users scope for tenant admins on delete", async () => {
    const response = await DELETE(
      new NextRequest(
        "https://example.com/api/users/user-b?scope=platform",
        {
          method: "DELETE",
        }
      ),
      {
        params: Promise.resolve({
          id: "user-b",
        }),
      }
    );

    expect(response.status).toBe(403);
    expect(mocks.delete).not.toHaveBeenCalled();
  });
});
