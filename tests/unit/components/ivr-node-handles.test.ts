import { describe, expect, it } from "vitest";

import { getMenuOptionHandleIds } from "@/components/ivr/ivr-node-handles";

describe("IVR menu node handles", () => {
  it("creates one dynamic source handle for every canonical DemoBank digit", () => {
    expect(getMenuOptionHandleIds([
      { digit: "1", label: "Loan information", action: "LOAN_INFORMATION", destinationNodeId: "knowledge" },
      { digit: "2", label: "Eligibility", action: "LOAN_INFORMATION", destinationNodeId: "knowledge" },
      { digit: "3", label: "Documents", action: "LOAN_INFORMATION", destinationNodeId: "knowledge" },
      { digit: "4", label: "Agent", action: "HUMAN_AGENT", destinationNodeId: "human_transfer" },
      { digit: "9", label: "End", action: "END_CALL", destinationNodeId: "end_call" },
    ])).toEqual(["1", "2", "3", "4", "9"]);
  });

  it("does not duplicate a handle when options share a destination", () => {
    expect(getMenuOptionHandleIds([
      { digit: "1", label: "One", action: "LOAN_INFORMATION", destinationNodeId: "knowledge" },
      { digit: "2", label: "Two", action: "LOAN_INFORMATION", destinationNodeId: "knowledge" },
      { digit: "1", label: "Duplicate", action: "LOAN_INFORMATION", destinationNodeId: "knowledge" },
    ])).toEqual(["1", "2"]);
  });
});
