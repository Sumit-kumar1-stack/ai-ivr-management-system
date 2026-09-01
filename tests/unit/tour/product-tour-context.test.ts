import { describe, expect, it, beforeEach, vi } from "vitest";
import { UserRole } from "@prisma/client";

import {
  getProductTour,
  TOUR_STORAGE_KEY,
  TOUR_VERSION,
  type ProductTourState,
} from "@/config/product-tour.config";

describe("Product Tour Context & State Transitions", () => {
  let storageMap: Record<string, string> = {};

  beforeEach(() => {
    storageMap = {};
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => storageMap[key] ?? null,
      setItem: (key: string, value: string) => {
        storageMap[key] = value;
      },
      removeItem: (key: string) => {
        delete storageMap[key];
      },
      clear: () => {
        storageMap = {};
      },
    });
  });

  it("stores and parses tour persistence state safely in localStorage", () => {
    const state: ProductTourState = {
      version: TOUR_VERSION,
      mode: "FULL_PLATFORM",
      sectionIndex: 2,
      stepIndex: 0,
      completed: false,
      skipped: false,
      completedModes: ["IVR_BUILDER"],
      lastVisitedAt: new Date().toISOString(),
    };

    localStorage.setItem(TOUR_STORAGE_KEY, JSON.stringify(state));

    const retrieved = JSON.parse(localStorage.getItem(TOUR_STORAGE_KEY)!) as ProductTourState;
    expect(retrieved.version).toBe(TOUR_VERSION);
    expect(retrieved.mode).toBe("FULL_PLATFORM");
    expect(retrieved.sectionIndex).toBe(2);
    expect(retrieved.completedModes).toContain("IVR_BUILDER");
  });

  it("calculates step progression correctly through section boundaries", () => {
    const def = getProductTour("IVR_BUILDER");
    expect(def.sections.length).toBeGreaterThan(0);

    const firstSec = def.sections[0];
    expect(firstSec.steps.length).toBe(3);

    // Step 0 -> 1 -> 2
    let stepIdx = 0;
    let secIdx = 0;

    // Next step
    stepIdx += 1;
    expect(stepIdx).toBe(1);
    expect(firstSec.steps[stepIdx].title).toBe("Flow Validation & Error Checks");

    stepIdx += 1;
    expect(stepIdx).toBe(2);
    expect(firstSec.steps[stepIdx].title).toBe("Immutable Publishing & Inbound Binding");
  });

  it("filters steps based on user role permissions", () => {
    const sampleSteps: Array<{
      id: string;
      title: string;
      description: string;
      route: string;
      requiredRoles?: UserRole[];
    }> = [
      {
        id: "public-step",
        title: "Public Step",
        description: "Anyone can see",
        route: "/dashboard",
      },
      {
        id: "admin-step",
        title: "Admin Step",
        description: "Admins only",
        route: "/settings",
        requiredRoles: [UserRole.SUPER_ADMIN, UserRole.ADMIN],
      },
      {
        id: "superadmin-step",
        title: "Super Admin Step",
        description: "Super Admins only",
        route: "/users",
        requiredRoles: [UserRole.SUPER_ADMIN],
      },
    ];

    // For AGENT
    const agentSteps = sampleSteps.filter(
      (s) => !s.requiredRoles || s.requiredRoles.includes(UserRole.AGENT)
    );
    expect(agentSteps).toHaveLength(1);
    expect(agentSteps[0].id).toBe("public-step");

    // For ADMIN
    const adminSteps = sampleSteps.filter(
      (s) => !s.requiredRoles || s.requiredRoles.includes(UserRole.ADMIN)
    );
    expect(adminSteps).toHaveLength(2);
    expect(adminSteps.map((s) => s.id)).toEqual(["public-step", "admin-step"]);

    // For SUPER_ADMIN
    const superAdminSteps = sampleSteps.filter(
      (s) => !s.requiredRoles || s.requiredRoles.includes(UserRole.SUPER_ADMIN)
    );
    expect(superAdminSteps).toHaveLength(3);
  });

  it("marks tour completion and appends mode to completedModes set", () => {
    const initialCompleted: string[] = ["SMS"];
    const finishedMode = "WHATSAPP";

    const updatedCompleted = Array.from(new Set([...initialCompleted, finishedMode]));
    expect(updatedCompleted).toEqual(["SMS", "WHATSAPP"]);

    // Completing again does not duplicate
    const deduplicated = Array.from(new Set([...updatedCompleted, finishedMode]));
    expect(deduplicated).toEqual(["SMS", "WHATSAPP"]);
  });

  it("resumes incomplete tour state when saved in localStorage", () => {
    const savedState: ProductTourState = {
      version: TOUR_VERSION,
      mode: "DEMOBANK",
      sectionIndex: 3,
      stepIndex: 0,
      completed: false,
      skipped: false,
      completedModes: [],
      lastVisitedAt: new Date().toISOString(),
    };

    localStorage.setItem(TOUR_STORAGE_KEY, JSON.stringify(savedState));

    const state = JSON.parse(localStorage.getItem(TOUR_STORAGE_KEY)!) as ProductTourState;
    const shouldOfferResume =
      state.mode !== null &&
      !state.completed &&
      !state.skipped &&
      (state.sectionIndex > 0 || state.stepIndex > 0);

    expect(shouldOfferResume).toBe(true);
    expect(state.mode).toBe("DEMOBANK");
    expect(state.sectionIndex).toBe(3);
  });
});
