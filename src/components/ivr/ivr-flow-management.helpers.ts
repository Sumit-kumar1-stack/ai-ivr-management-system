export type FlowValidationDisplay = {
  draftValidation: string;
  publishedValidation: string | null;
};

export function getFlowValidationDisplay(input: {
  validationStatus: string;
  versions: Array<{ status: string; validationStatus: string }>;
}): FlowValidationDisplay {
  const published = input.versions.find(version => version.status === "PUBLISHED");
  return {
    draftValidation: input.validationStatus,
    publishedValidation: published?.validationStatus ?? null,
  };
}

export function maskInboundNumber(number: string): string {
  const digits = number.replace(/\D/g, "");
  return digits.length < 5
    ? "••••"
    : `${number.trim().startsWith("+") ? "+" : ""}${digits.slice(0, 2)}••••${digits.slice(-4)}`;
}
