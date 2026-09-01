import { describe, expect, it, vi, beforeEach } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const mockRouter = {
  push: vi.fn(),
  replace: vi.fn(),
  prefetch: vi.fn(),
  back: vi.fn(),
};

vi.mock("next/navigation", () => ({
  useRouter: () => mockRouter,
  usePathname: () => "/dashboard",
}));

import ProductTourOverlay from "@/components/tour/product-tour-overlay";
import ProductTourWelcomeModal from "@/components/tour/product-tour-welcome-modal";
import ProductTourResumeDialog from "@/components/tour/product-tour-resume-dialog";
import ProductTourHelpMenu from "@/components/tour/product-tour-help-menu";
import { ProductTourProvider } from "@/lib/product-tour-context";

describe("Product Tour UI Components", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders ProductTourHelpMenu with dropdown trigger button", () => {
    const html = renderToStaticMarkup(
      React.createElement(
        ProductTourProvider,
        null,
        React.createElement(ProductTourHelpMenu)
      )
    );

    expect(html).toContain("Product Tour");
    expect(html).toContain("data-tour=\"help-tour-menu\"");
  });

  it("renders ProductTourWelcomeModal safely with provider", () => {
    const html = renderToStaticMarkup(
      React.createElement(
        ProductTourProvider,
        null,
        React.createElement(ProductTourWelcomeModal)
      )
    );

    expect(html).toBeDefined();
  });

  it("renders ProductTourOverlay and ProductTourResumeDialog safely without crashing", () => {
    const html = renderToStaticMarkup(
      React.createElement(
        ProductTourProvider,
        null,
        React.createElement(ProductTourOverlay),
        React.createElement(ProductTourResumeDialog)
      )
    );

    expect(html).toBeDefined();
  });
});
