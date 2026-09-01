import { CallAuthenticationLevel, CallDirection } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  prisma: {
    call: {
      findUnique: vi.fn(),
    },
    communicationCampaignRecipient: {
      findFirst: vi.fn(),
    },
    $queryRaw: vi.fn(),
  },
  getCall: vi.fn(),
  retrieveKnowledge: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: mocks.prisma,
}));

vi.mock("@/services/calls/call.service", () => ({
  getCall: mocks.getCall,
}));

vi.mock("@/services/knowledge/retrieval.service", () => ({
  retrieveKnowledge: mocks.retrieveKnowledge,
}));

import { resolveOutboundConversationContext, buildOutboundContextPrompt } from "@/services/campaigns/outbound-conversation-context.service";
import { resolveStandardKnowledgeScope } from "@/services/conversations/prompt-builder.service";

describe("CommunicationCampaign outbound context & RAG scoping", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("resolves full outbound conversation context for a CommunicationCampaign call", async () => {
    mocks.prisma.call.findUnique.mockResolvedValue({
      id: "call-comm-1",
      direction: CallDirection.OUTBOUND,
      language: "English",
      campaignId: null,
      communicationCampaignId: "comm-camp-1",
      contact: {
        id: "contact-1",
        fullName: "Asha Sharma",
        phone: "+919876543210",
        language: "English",
      },
      communicationOutboundAttempt: {
        campaignRecipient: {
          externalRecipientId: "recip-ext-1",
          fullName: "Asha Sharma",
          phone: "+919876543210",
          language: "English",
        },
      },
      communicationCampaign: {
        id: "comm-camp-1",
        name: "OmniBank Summer Loan Offer",
        description: "Special loan interest rate offer",
        prompt: "Inform customer about the pre-approved 8.5% interest rate.",
        audienceSourceName: "Premium Pre-Approved Customers",
        tier: "STANDARD",
        channels: ["VOICE"],
        knowledgeDocumentIds: ["doc-loan-terms-1", "doc-faq-1"],
        ownerUserId: "user-mgr-1",
        ownerUser: {
          tenantId: "tenant-bank-1",
        },
      },
      campaign: null,
    });

    const context = await resolveOutboundConversationContext("call-comm-1");

    expect(context.outbound).toBe(true);
    expect(context.campaignId).toBe("comm-camp-1");
    expect(context.campaignName).toBe("OmniBank Summer Loan Offer");
    expect(context.campaign.objective).toBe("Premium Pre-Approved Customers");
    expect(context.campaign.runtime).toBe("STANDARD");
    expect(context.customer.name).toBe("Asha Sharma");
    expect(context.customer.reference).toBe("recip-ext-1");
    expect(context.openingMessage).toBe("Hello Asha Sharma.");
    expect(context.instruction).toContain("This is an outbound communication campaign.");
    expect(context.instruction).toContain("Campaign name: OmniBank Summer Loan Offer.");
    expect(context.instruction).toContain("Inform customer about the pre-approved 8.5% interest rate.");

    const promptText = buildOutboundContextPrompt(context);
    expect(promptText).toContain("Campaign: OmniBank Summer Loan Offer");
    expect(promptText).toContain("Customer: Asha Sharma");
    expect(promptText).toContain("Customer Reference: recip-ext-1");
  });

  it("resolves correct knowledge scope for CommunicationCampaign with knowledgeDocumentIds", async () => {
    const callData = {
      id: "call-comm-1",
      direction: CallDirection.OUTBOUND,
      tenantId: "tenant-bank-1",
      campaignId: null,
      communicationCampaignId: "comm-camp-1",
      authenticationLevel: CallAuthenticationLevel.AUTH_LEVEL_1,
      communicationCampaign: {
        id: "comm-camp-1",
        name: "OmniBank Summer Loan Offer",
        knowledgeDocumentIds: ["doc-loan-terms-1", "doc-faq-1"],
        ownerUserId: "user-mgr-1",
        ownerUser: {
          tenantId: "tenant-bank-1",
        },
      },
      campaign: null,
      inboundProfile: null,
    };

    mocks.getCall.mockResolvedValue(callData);
    mocks.prisma.call.findUnique.mockResolvedValue({
      ...callData,
      communicationOutboundAttempt: null,
      contact: null,
    });

    const scope = await resolveStandardKnowledgeScope("call-comm-1");

    expect(scope.knowledgeDocumentIds).toEqual(["doc-loan-terms-1", "doc-faq-1"]);
    expect(scope.tenantId).toBe("tenant-bank-1");
    expect(scope.ownerUserId).toBeNull(); // CommunicationCampaign scopes by document IDs + tenant, not ownerUserId
    expect(scope.callAuthenticationLevel).toBe(CallAuthenticationLevel.AUTH_LEVEL_1);
  });

  it("safely handles CommunicationCampaign with empty or missing knowledge documents", async () => {
    const callData = {
      id: "call-comm-no-kb",
      direction: CallDirection.OUTBOUND,
      tenantId: "tenant-bank-1",
      campaignId: null,
      communicationCampaignId: "comm-camp-2",
      authenticationLevel: CallAuthenticationLevel.AUTH_LEVEL_0,
      communicationCampaign: {
        id: "comm-camp-2",
        name: "OmniBank Simple Reminder",
        knowledgeDocumentIds: [],
        ownerUserId: "user-mgr-1",
        ownerUser: {
          tenantId: "tenant-bank-1",
        },
      },
      campaign: null,
      inboundProfile: null,
    };

    mocks.getCall.mockResolvedValue(callData);
    mocks.prisma.call.findUnique.mockResolvedValue({
      ...callData,
      communicationOutboundAttempt: null,
      contact: null,
    });

    const scope = await resolveStandardKnowledgeScope("call-comm-no-kb");

    expect(scope.knowledgeDocumentIds).toEqual([]);
    expect(scope.tenantId).toBe("tenant-bank-1");
    expect(scope.ownerUserId).toBeNull();
  });

  it("preserves legacy Campaign knowledge resolution and ownerUserId constraint", async () => {
    const callData = {
      id: "call-legacy-1",
      direction: CallDirection.OUTBOUND,
      tenantId: "tenant-legacy-1",
      campaignId: "legacy-camp-1",
      communicationCampaignId: null,
      authenticationLevel: CallAuthenticationLevel.AUTH_LEVEL_1,
      campaign: {
        id: "legacy-camp-1",
        name: "Legacy Collection Campaign",
        purpose: "COLLECTION",
        ownerUserId: "legacy-user-1",
        ownerUser: {
          tenantId: "tenant-legacy-1",
        },
      },
      communicationCampaign: null,
      inboundProfile: null,
    };

    mocks.getCall.mockResolvedValue(callData);
    mocks.prisma.call.findUnique.mockResolvedValue({
      ...callData,
      communicationOutboundAttempt: null,
      contact: { fullName: "Ramesh Kumar" },
    });

    mocks.prisma.$queryRaw.mockResolvedValue([
      { knowledgeDocumentId: "legacy-doc-1" },
    ]);

    const scope = await resolveStandardKnowledgeScope("call-legacy-1");

    expect(scope.knowledgeDocumentIds).toEqual(["legacy-doc-1"]);
    expect(scope.tenantId).toBe("tenant-legacy-1");
    expect(scope.ownerUserId).toBe("legacy-user-1");
  });
});
