import { Check } from "lucide-react";

export type CampaignWizardStepState =
  | "done"
  | "active"
  | "pending";

export interface CampaignWizardStep {
  number: number;
  label: string;
  state: CampaignWizardStepState;
}

export interface CampaignWizardStepperProps {
  steps: CampaignWizardStep[];
  className?: string;
}

export default function CampaignWizardStepper({
  steps,
  className,
}: CampaignWizardStepperProps) {
  return (
    <div className={className ?? "flex items-center gap-3 text-xs font-semibold"}>
      {steps.map((step, index) => {
        const isLast = index === steps.length - 1;

        return (
          <div key={step.number} className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <div
                className={[
                  "flex h-9 w-9 items-center justify-center rounded-full ring-4",
                  step.state === "done"
                    ? "bg-[#0066cc] text-white ring-[#d7e3ff]"
                    : step.state === "active"
                      ? "bg-[#004e9f] text-white ring-[#d7e3ff]"
                      : "border border-[#d1d5db] bg-white text-[#6b7280] ring-transparent",
                ].join(" ")}
              >
                {step.state === "done" ? <Check size={16} /> : step.number}
              </div>

              <span
                className={[
                  "font-semibold",
                  step.state === "pending" ? "text-[#6b7280]" : "text-black",
                ].join(" ")}
              >
                {step.label}
              </span>
            </div>

            {!isLast && <div className="h-[2px] w-8 bg-slate-300" />}
          </div>
        );
      })}
    </div>
  );
}

export function buildCampaignWizardSteps(
  flow: "production" | "quick-test",
  activeStep: number
): CampaignWizardStep[] {
  const labels =
    flow === "production"
      ? ["Audience", "Knowledge", "Channels", "Summary"]
      : ["Audience", "Channels", "Summary"];

  return labels.map((label, index) => {
    const stepNumber = index + 1;

    return {
      number: stepNumber,
      label,
      state:
        stepNumber < activeStep
          ? "done"
          : stepNumber === activeStep
            ? "active"
            : "pending",
    };
  });
}

export function getCampaignWizardStepCount(
  flow: "production" | "quick-test"
): number {
  return flow === "production" ? 4 : 3;
}
