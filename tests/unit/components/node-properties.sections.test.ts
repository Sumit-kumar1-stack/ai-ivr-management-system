import { describe, expect, it } from "vitest";

import {
  getRelevantNodePropertySections,
  NODE_PROPERTY_SECTION_NAMES,
} from "@/components/ivr/node-properties";

describe("node property sections", () => {
  it("uses the standard ordered section vocabulary", () => {
    expect(NODE_PROPERTY_SECTION_NAMES).toEqual([
      "BASIC",
      "BEHAVIOR",
      "RUNTIME",
      "ROUTING",
      "SAFETY",
      "ADVANCED",
    ]);
  });

  it("shows only greeting-relevant sections", () => {
    expect(getRelevantNodePropertySections("GREETING")).toEqual([
      "BASIC",
      "BEHAVIOR",
      "ROUTING",
    ]);
  });

  it("gives AI conversations runtime, route, and safety review sections", () => {
    expect(getRelevantNodePropertySections("AI_CONVERSATION")).toEqual([
      "BASIC",
      "BEHAVIOR",
      "RUNTIME",
      "ROUTING",
      "SAFETY",
    ]);
  });

  it("keeps transfer-only advanced configuration out of callbacks", () => {
    expect(getRelevantNodePropertySections("HUMAN_TRANSFER")).toEqual([
      "BASIC",
      "BEHAVIOR",
      "ROUTING",
      "SAFETY",
      "ADVANCED",
    ]);
    expect(getRelevantNodePropertySections("CALLBACK")).not.toContain("ADVANCED");
  });

  it("preserves a focused entry configuration layout for legacy nodes without a kind", () => {
    expect(getRelevantNodePropertySections(undefined)).toEqual([
      "BASIC",
      "RUNTIME",
      "ROUTING",
    ]);
  });
});
