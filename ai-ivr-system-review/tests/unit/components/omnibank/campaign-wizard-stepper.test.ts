import {
  describe,
  expect,
  it,
} from "vitest";

import {
  buildCampaignWizardSteps,
  getCampaignWizardStepCount,
} from "@/components/omnibank/campaign-wizard-stepper";

describe("campaign wizard stepper", () => {
  it("returns the four production steps in order", () => {
    const steps = buildCampaignWizardSteps("production", 4);

    expect(getCampaignWizardStepCount("production")).toBe(4);
    expect(steps.map(step => step.label)).toEqual([
      "Audience",
      "Knowledge",
      "Channels",
      "Summary",
    ]);
    expect(steps.map(step => step.state)).toEqual([
      "done",
      "done",
      "done",
      "active",
    ]);
  });

  it("returns the quick test flow without knowledge", () => {
    const steps = buildCampaignWizardSteps("quick-test", 2);

    expect(getCampaignWizardStepCount("quick-test")).toBe(3);
    expect(steps.map(step => step.label)).toEqual([
      "Audience",
      "Channels",
      "Summary",
    ]);
    expect(steps.map(step => step.state)).toEqual([
      "done",
      "active",
      "pending",
    ]);
  });
});
