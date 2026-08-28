import { getPlivoEnvironment } from "@/config/env";

type PlivoCallbackParams = URLSearchParams | Record<string, string | number | boolean | null | undefined>;

/** Builds provider-facing URLs from the deployment-owned public origin. */
export function getPlivoPublicCallbackUrl(pathname: string, params?: PlivoCallbackParams): URL {
  if (!pathname.startsWith("/")) throw new Error("Plivo callback pathname must start with '/'");
  const url = new URL(pathname, `${getPlivoEnvironment().publicBaseUrl}/`);
  if (!params) return url;
  if (params instanceof URLSearchParams) {
    params.forEach((value, key) => url.searchParams.append(key, value));
    return url;
  }
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null) url.searchParams.set(key, String(value));
  }
  return url;
}
