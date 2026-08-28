import { ContactStatus } from "@prisma/client";

import { describe, expect, it, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  contactFindMany: vi.fn(),
  contactCount: vi.fn(),
  contactCreate: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    contact: {
      findMany: mocks.contactFindMany,
      count: mocks.contactCount,
      create: mocks.contactCreate,
    },
  },
}));

import { ContactRepository } from "@/features/contacts/contact.repository";

describe("contact repository ownership scoping", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("filters contact lists by owner", async () => {
    mocks.contactFindMany.mockResolvedValue([]);
    mocks.contactCount.mockResolvedValue(0);

    await ContactRepository.findMany(
      { page: 1, limit: 10 },
      "user-1"
    );

    expect(mocks.contactFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          ownerUserId: "user-1",
        },
      })
    );
  });

  it("counts statistics within the owner boundary", async () => {
    mocks.contactCount
      .mockResolvedValueOnce(3)
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(0);

    const stats = await ContactRepository.getStatistics("user-1");

    expect(stats.total).toBe(3);
    expect(mocks.contactCount).toHaveBeenNthCalledWith(
      1,
      {
        where: {
          ownerUserId: "user-1",
        },
      }
    );
    expect(mocks.contactCount).toHaveBeenNthCalledWith(
      2,
      {
        where: {
          ownerUserId: "user-1",
          status: ContactStatus.PENDING,
        },
      }
    );
  });

  it("stamps the owner on new contacts", async () => {
    mocks.contactCreate.mockResolvedValue({
      id: "contact-1",
    });

    await ContactRepository.create(
      {
        fullName: "Test User",
        phone: "+15555550123",
        language: "English",
      },
      "user-1"
    );

    expect(mocks.contactCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          ownerUserId: "user-1",
        }),
      })
    );
  });
});
