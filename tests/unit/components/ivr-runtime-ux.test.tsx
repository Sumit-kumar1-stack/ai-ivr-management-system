import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import IVRToolbar from "@/components/ivr/ivr-toolbar";
import NodePropertiesPanel from "@/components/ivr/node-properties";

const mockUseIVRBuilder = {
  resourceCatalog: {
    knowledgeDocuments: [],
    actions: [],
    transferDestinations: [],
    callbackConfigurations: [],
    approvedMessageTemplates: [],
    inboundProfiles: [],
    campaigns: [],
    businessHoursPolicies: [],
    authenticationLevels: ["LEVEL_1"],
  },
  flowName: "FAQ support flow",
};

vi.mock("@/components/ivr/ivr-builder-context", () => ({
  useIVRBuilder: () => mockUseIVRBuilder,
}));

vi.mock("@/features/ivr/use-flow", () => ({
  useFlow: () => ({ data: null }),
}));

describe("ivr runtime ux", () => {
  it("renders STANDARD, PREMIUM, and AUTO runtime options", () => {
    const html = renderToStaticMarkup(
      <NodePropertiesPanel
        node={{
          id: "start",
          type: "ivr",
          position: { x: 0, y: 0 },
          data: {
            nodeKind: "START",
            label: "Start",
            description: "Entry point",
            runtimeMode: "AUTO",
            runtimeDefault: "STANDARD",
          },
        } as never}
        onChange={vi.fn()}
      />
    );

    expect(html).toContain("Voice Runtime");
    expect(html).toContain("STANDARD");
    expect(html).toContain("PREMIUM");
    expect(html).toContain("AUTO");
    expect(html).toContain("Expected entry selection");
    expect(html).toContain("Informational FAQ flow");
  });

  it("loads an existing runtime config and disables published edits in the toolbar", () => {
    const html = renderToStaticMarkup(
      <NodePropertiesPanel
        node={{
          id: "start",
          type: "ivr",
          position: { x: 0, y: 0 },
          data: {
            nodeKind: "START",
            label: "Start",
            description: "Entry point",
            runtimeMode: "PREMIUM",
            runtimeDefault: "PREMIUM",
          },
        } as never}
        onChange={vi.fn()}
      />
    );

    expect(html).toContain('value="PREMIUM" selected=""');

    const toolbar = renderToStaticMarkup(
      <IVRToolbar
        onSave={vi.fn()}
        onSubmitForApproval={vi.fn()}
        saving={false}
        submitting={false}
        canSubmit={false}
        canEdit={false}
        isPublished
        onShowProperties={vi.fn()}
        onShowValidation={vi.fn()}
        onShowSimulator={vi.fn()}
        onAutoLayout={vi.fn()}
        onUndo={vi.fn()}
        onRedo={vi.fn()}
        canUndo={true}
        canRedo={true}
        searchQuery="runtime"
        onSearchQueryChange={vi.fn()}
        searchResults={[]}
        onSearchResult={vi.fn()}
        onDuplicate={vi.fn()}
        canDuplicate={false}
        onDelete={vi.fn()}
        canDelete={false}
      />
    );

    expect(toolbar).toContain("disabled");
    expect(toolbar).toContain("Published");
    expect(toolbar).toContain("Search flow nodes");
  });
});
