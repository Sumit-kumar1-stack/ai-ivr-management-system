import { UserRole } from "@prisma/client";

import { describe, expect, it, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  campaignFindFirst: vi.fn(),
  callFindFirst: vi.fn(),
  contactFindFirst: vi.fn(),
  knowledgeDocumentFindFirst: vi.fn(),
  ivrFlowFindFirst: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    campaign: {
      findFirst: mocks.campaignFindFirst,
    },
    call: {
      findFirst: mocks.callFindFirst,
    },
    contact: {
      findFirst: mocks.contactFindFirst,
    },
    knowledgeDocument: {
      findFirst: mocks.knowledgeDocumentFindFirst,
    },
    iVRFlow: {
      findFirst: mocks.ivrFlowFindFirst,
    },
  },
}));

import {
  assertCampaignOwnership,
  assertCallOwnership,
  assertContactOwnership,
  assertIvrFlowOwnership,
} from "@/services/security/tenant-access.service";

const owner = {
  id: "user-1",
  role: UserRole.ADMIN,
  tenantId: "tenant-1",
} as const;

describe("tenant access service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("scopes campaigns to the authenticated owner", async () => {
    mocks.campaignFindFirst.mockResolvedValue(null);

    await expect(
      assertCampaignOwnership("camp-1", owner)
    ).rejects.toThrow("Campaign not found: camp-1");

    expect(mocks.campaignFindFirst).toHaveBeenCalledWith({
      where: {
        id: "camp-1",
        ownerUser: {
          tenantId: "tenant-1",
        },
      },
      select: {
        id: true,
      },
    });
  });

  it("scopes calls through the owning campaign", async () => {
    mocks.callFindFirst.mockResolvedValue(null);

    await expect(
      assertCallOwnership("call-1", owner)
    ).rejects.toThrow("Call not found: call-1");

    expect(mocks.callFindFirst).toHaveBeenCalledWith({
      where: {
        id: "call-1",
        campaign: {
          ownerUser: {
            tenantId: "tenant-1",
          },
        },
      },
      select: {
        id: true,
      },
    });
  });

  it("scopes contacts directly by owner", async () => {
    mocks.contactFindFirst.mockResolvedValue(null);

    await expect(
      assertContactOwnership("contact-1", owner)
    ).rejects.toThrow("Contact not found: contact-1");

    expect(mocks.contactFindFirst).toHaveBeenCalledWith({
      where: {
        id: "contact-1",
        ownerUser: {
          tenantId: "tenant-1",
        },
      },
      select: {
        id: true,
      },
    });
  });

  it("scopes ivr flows by their authoritative tenant", async () => {
    mocks.ivrFlowFindFirst.mockResolvedValue(null);

    await expect(
      assertIvrFlowOwnership("flow-1", owner)
    ).rejects.toThrow("IVR flow not found: flow-1");

    expect(mocks.ivrFlowFindFirst).toHaveBeenCalledWith({
      where: {
        id: "flow-1",
        tenantId: "tenant-1",
      },
      select: {
        id: true,
      },
    });
  });
});
