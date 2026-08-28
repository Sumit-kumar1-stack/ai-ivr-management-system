import {
  describe,
  expect,
  it,
} from "vitest";

import {
  getAudienceContinueHref,
  getAudienceContinueLabel,
} from "@/components/omnibank/audience-selection-screen";
import {
  getKnowledgeBackHref,
  getKnowledgeContinueHref,
} from "@/components/omnibank/campaign-knowledge-selection-screen";
import {
  getChannelBackHref,
  getChannelContinueHref,
} from "@/components/omnibank/channel-selection-screen";
import {
  getSummaryBackHref,
} from "@/components/omnibank/campaign-summary-screen";

describe("campaign wizard navigation", () => {
  it("routes audience continue to knowledge in production", () => {
    expect(getAudienceContinueLabel(false)).toBe("Continue to Knowledge");
    expect(getAudienceContinueHref("draft-123", false)).toBe(
      "/communication/campaigns/new/knowledge?campaign=draft-123"
    );
  });

  it("routes knowledge back to audience and next to channels", () => {
    expect(getKnowledgeBackHref("draft-123")).toBe(
      "/communication/campaigns/new/audience?campaign=draft-123"
    );
    expect(getKnowledgeContinueHref("draft-123")).toBe(
      "/communication/campaigns/new/channels?campaign=draft-123"
    );
  });

  it("routes channels back to knowledge and next to summary", () => {
    expect(getChannelBackHref("draft-123", false)).toBe(
      "/communication/campaigns/new/knowledge?campaign=draft-123"
    );
    expect(getChannelContinueHref("draft-123")).toBe(
      "/communication/campaigns/new/summary?campaign=draft-123"
    );
  });

  it("routes summary back to channels", () => {
    expect(getSummaryBackHref("draft-123")).toBe(
      "/communication/campaigns/new/channels?campaign=draft-123"
    );
  });
});
