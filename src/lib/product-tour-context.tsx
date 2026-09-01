"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { usePathname, useRouter } from "next/navigation";
import type { UserRole } from "@prisma/client";

import {
  getProductTour,
  type ProductTourMode,
  type ProductTourSection,
  type ProductTourStep,
  type ProductTourState,
  TOUR_STORAGE_KEY,
  TOUR_VERSION,
} from "@/config/product-tour.config";

interface ProductTourContextType {
  mode: ProductTourMode | null;
  sectionIndex: number;
  stepIndex: number;
  isOpen: boolean;
  isWelcomeOpen: boolean;
  isResumeOpen: boolean;
  currentSection: ProductTourSection | null;
  currentStep: ProductTourStep | null;
  totalSections: number;
  totalStepsInSection: number;
  role: UserRole;
  startTour: (mode?: ProductTourMode) => void;
  nextStep: () => void;
  previousStep: () => void;
  skipTour: () => void;
  closeTour: () => void;
  dismissWelcome: () => void;
  resumeTour: () => void;
  restartTour: () => void;
  dismissResume: () => void;
}

const ProductTourContext = createContext<ProductTourContextType | null>(null);

function loadSavedState(): ProductTourState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(TOUR_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ProductTourState;
    if (parsed.version === TOUR_VERSION) {
      return parsed;
    }
  } catch {
    // Ignore storage parse errors
  }
  return null;
}

function saveTourState(state: ProductTourState) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(TOUR_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Ignore storage write errors
  }
}

export function ProductTourProvider({
  children,
  role = "ADMIN" as UserRole,
}: {
  children: React.ReactNode;
  role?: UserRole;
}) {
  const router = useRouter();
  const pathname = usePathname();

  const [mode, setMode] = useState<ProductTourMode | null>(null);
  const [sectionIndex, setSectionIndex] = useState(0);
  const [stepIndex, setStepIndex] = useState(0);
  const [isOpen, setIsOpen] = useState(false);
  const [isWelcomeOpen, setIsWelcomeOpen] = useState(false);
  const [isResumeOpen, setIsResumeOpen] = useState(false);
  const [completedModes, setCompletedModes] = useState<ProductTourMode[]>([]);
  const [hasInitialized, setHasInitialized] = useState(false);

  // Load saved state on mount
  useEffect(() => {
    const saved = loadSavedState();

    if (!saved) {
      // First visit: show welcome modal on dashboard routes (not login/auth)
      if (pathname && !pathname.startsWith("/login") && !pathname.startsWith("/auth")) {
        setIsWelcomeOpen(true);
      }
    } else {
      setCompletedModes(saved.completedModes ?? []);

      // If user left midway without completing or skipping, offer resume
      if (
        saved.mode &&
        !saved.completed &&
        !saved.skipped &&
        (saved.sectionIndex > 0 || saved.stepIndex > 0)
      ) {
        setMode(saved.mode);
        setSectionIndex(saved.sectionIndex);
        setStepIndex(saved.stepIndex);
        setIsResumeOpen(true);
      }
    }

    setHasInitialized(true);
  }, [pathname]);

  const currentTourDef = useMemo(() => {
    if (!mode) return null;
    return getProductTour(mode);
  }, [mode]);

  // Filter sections and steps according to role access
  const activeSections = useMemo(() => {
    if (!currentTourDef) return [];
    return currentTourDef.sections
      .map((section) => ({
        ...section,
        steps: section.steps.filter((step) => {
          if (!step.requiredRoles || step.requiredRoles.length === 0) return true;
          return step.requiredRoles.includes(role);
        }),
      }))
      .filter((section) => section.steps.length > 0);
  }, [currentTourDef, role]);

  const currentSection = activeSections[sectionIndex] ?? null;
  const currentStep = currentSection?.steps[stepIndex] ?? null;
  const totalSections = activeSections.length;
  const totalStepsInSection = currentSection?.steps.length ?? 0;

  // Persist state changes
  const persistCurrentState = useCallback(
    (
      newMode: ProductTourMode | null,
      secIdx: number,
      stIdx: number,
      isCompleted: boolean,
      isSkipped: boolean,
      modes = completedModes
    ) => {
      saveTourState({
        version: TOUR_VERSION,
        mode: newMode,
        sectionIndex: secIdx,
        stepIndex: stIdx,
        completed: isCompleted,
        skipped: isSkipped,
        completedModes: modes,
        lastVisitedAt: new Date().toISOString(),
      });
    },
    [completedModes]
  );

  const startTour = useCallback(
    (tourMode: ProductTourMode = "FULL_PLATFORM") => {
      setMode(tourMode);
      setSectionIndex(0);
      setStepIndex(0);
      setIsOpen(true);
      setIsWelcomeOpen(false);
      setIsResumeOpen(false);

      const def = getProductTour(tourMode);
      const firstSection = def.sections[0];
      const firstStep = firstSection?.steps[0];

      if (firstStep && firstStep.route && pathname !== firstStep.route) {
        router.push(firstStep.route);
      }

      persistCurrentState(tourMode, 0, 0, false, false);
    },
    [pathname, router, persistCurrentState]
  );

  const nextStep = useCallback(() => {
    if (!currentSection) return;

    if (stepIndex + 1 < currentSection.steps.length) {
      // Next step in current section
      const nextStepIdx = stepIndex + 1;
      setStepIndex(nextStepIdx);

      const nextSt = currentSection.steps[nextStepIdx];
      if (nextSt && nextSt.route && pathname !== nextSt.route) {
        router.push(nextSt.route);
      }

      persistCurrentState(mode, sectionIndex, nextStepIdx, false, false);
    } else if (sectionIndex + 1 < activeSections.length) {
      // Next section
      const nextSecIdx = sectionIndex + 1;
      setSectionIndex(nextSecIdx);
      setStepIndex(0);

      const nextSec = activeSections[nextSecIdx];
      const nextSt = nextSec.steps[0];
      if (nextSt && nextSt.route && pathname !== nextSt.route) {
        router.push(nextSt.route);
      }

      persistCurrentState(mode, nextSecIdx, 0, false, false);
    } else {
      // Completed tour
      setIsOpen(false);
      const newCompleted = mode ? Array.from(new Set([...completedModes, mode])) : completedModes;
      setCompletedModes(newCompleted);
      persistCurrentState(mode, sectionIndex, stepIndex, true, false, newCompleted);
    }
  }, [
    currentSection,
    stepIndex,
    sectionIndex,
    activeSections,
    pathname,
    router,
    mode,
    completedModes,
    persistCurrentState,
  ]);

  const previousStep = useCallback(() => {
    if (stepIndex > 0) {
      // Previous step in current section
      const prevStepIdx = stepIndex - 1;
      setStepIndex(prevStepIdx);

      const prevSt = currentSection?.steps[prevStepIdx];
      if (prevSt && prevSt.route && pathname !== prevSt.route) {
        router.push(prevSt.route);
      }

      persistCurrentState(mode, sectionIndex, prevStepIdx, false, false);
    } else if (sectionIndex > 0) {
      // Previous section, last step
      const prevSecIdx = sectionIndex - 1;
      const prevSec = activeSections[prevSecIdx];
      const lastStepIdx = (prevSec?.steps.length ?? 1) - 1;

      setSectionIndex(prevSecIdx);
      setStepIndex(lastStepIdx);

      const prevSt = prevSec?.steps[lastStepIdx];
      if (prevSt && prevSt.route && pathname !== prevSt.route) {
        router.push(prevSt.route);
      }

      persistCurrentState(mode, prevSecIdx, lastStepIdx, false, false);
    }
  }, [
    stepIndex,
    currentSection,
    sectionIndex,
    activeSections,
    pathname,
    router,
    mode,
    persistCurrentState,
  ]);

  const skipTour = useCallback(() => {
    setIsOpen(false);
    setIsWelcomeOpen(false);
    setIsResumeOpen(false);
    persistCurrentState(mode, sectionIndex, stepIndex, false, true);
  }, [mode, sectionIndex, stepIndex, persistCurrentState]);

  const closeTour = useCallback(() => {
    setIsOpen(false);
    persistCurrentState(mode, sectionIndex, stepIndex, false, false);
  }, [mode, sectionIndex, stepIndex, persistCurrentState]);

  const dismissWelcome = useCallback(() => {
    setIsWelcomeOpen(false);
    saveTourState({
      version: TOUR_VERSION,
      mode: null,
      sectionIndex: 0,
      stepIndex: 0,
      completed: false,
      skipped: true,
      completedModes,
      lastVisitedAt: new Date().toISOString(),
    });
  }, [completedModes]);

  const resumeTour = useCallback(() => {
    setIsResumeOpen(false);
    setIsOpen(true);

    if (currentStep && currentStep.route && pathname !== currentStep.route) {
      router.push(currentStep.route);
    }
  }, [currentStep, pathname, router]);

  const restartTour = useCallback(() => {
    setIsResumeOpen(false);
    startTour(mode ?? "FULL_PLATFORM");
  }, [startTour, mode]);

  const dismissResume = useCallback(() => {
    setIsResumeOpen(false);
    saveTourState({
      version: TOUR_VERSION,
      mode: null,
      sectionIndex: 0,
      stepIndex: 0,
      completed: false,
      skipped: true,
      completedModes,
      lastVisitedAt: new Date().toISOString(),
    });
  }, [completedModes]);

  const value = useMemo(
    () => ({
      mode,
      sectionIndex,
      stepIndex,
      isOpen,
      isWelcomeOpen,
      isResumeOpen,
      currentSection,
      currentStep,
      totalSections,
      totalStepsInSection,
      role,
      startTour,
      nextStep,
      previousStep,
      skipTour,
      closeTour,
      dismissWelcome,
      resumeTour,
      restartTour,
      dismissResume,
    }),
    [
      mode,
      sectionIndex,
      stepIndex,
      isOpen,
      isWelcomeOpen,
      isResumeOpen,
      currentSection,
      currentStep,
      totalSections,
      totalStepsInSection,
      role,
      startTour,
      nextStep,
      previousStep,
      skipTour,
      closeTour,
      dismissWelcome,
      resumeTour,
      restartTour,
      dismissResume,
    ]
  );

  return (
    <ProductTourContext.Provider value={value}>
      {children}
    </ProductTourContext.Provider>
  );
}

export function useProductTour() {
  const context = useContext(ProductTourContext);
  if (!context) {
    throw new Error("useProductTour must be used within a ProductTourProvider");
  }
  return context;
}
