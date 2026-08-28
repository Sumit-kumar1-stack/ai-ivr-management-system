export interface NormalizePstnNumberOptions {
  /** A provider has documented that callbacks contain country-code digits
   * without the E.164 plus marker. This never infers a country code. */
  allowCountryCodeWithoutPlus?: boolean;
}

/**
 * Canonicalizes a provider PSTN value to an explicit E.164 string. Formatting
 * and a `tel:` URI prefix are accepted; local numbers and ambiguous values are
 * rejected rather than being assigned a country code.
 */
export function normalizePstnNumber(value: unknown, options: NormalizePstnNumberOptions = {}): string | null {
  if (typeof value !== "string") return null;

  const trimmed = value.trim();
  const withoutTelPrefix = trimmed.replace(/^tel:/i, "");
  const compact = withoutTelPrefix.replace(/[\s().-]/g, "");
  const hasExplicitPlus = compact.startsWith("+");

  if (!hasExplicitPlus && !options.allowCountryCodeWithoutPlus) return null;
  if (!/^\+?[1-9]\d{7,14}$/.test(compact)) return null;

  return `+${compact.replace(/^\+/, "")}`;
}

/** Plivo documents `From` and `To` as country-code numbers. Its callback may
 * omit only the E.164 plus marker, which is notation rather than a country
 * inference. */
export function normalizePlivoPstnNumber(value: unknown): string | null {
  return normalizePstnNumber(value, { allowCountryCodeWithoutPlus: true });
}

export function normalizeInboundProviderNumber(provider: string, value: unknown): string | null {
  return provider.trim().toUpperCase() === "PLIVO"
    ? normalizePlivoPstnNumber(value)
    : normalizePstnNumber(value);
}
