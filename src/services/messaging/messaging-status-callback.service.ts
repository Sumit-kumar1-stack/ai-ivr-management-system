import type {
  MessagingProviderAdapter,
  MessagingProviderName,
} from "./messaging.types";

//--------------------------------------------------
// Options
//--------------------------------------------------

export interface BuildMessagingStatusCallbackUrlOptions {
  provider:
    | MessagingProviderName
    | MessagingProviderAdapter;

  outboundMessageId:
    string;
}

//--------------------------------------------------
// Standard Provider Callback Paths
//--------------------------------------------------

export const PROVIDER_STATUS_CALLBACK_PATHS: Record<
  MessagingProviderName,
  string
> = {
  TWILIO:
    "/api/twilio/messaging/status",

  PLIVO:
    "/api/plivo/messaging/status",

  EXOTEL:
    "/api/exotel/messaging/status",

  META:
    "/api/meta/whatsapp/webhook",

  MOCK:
    "/api/mock/messaging/status",
};

//--------------------------------------------------
// Base URL Resolver
//--------------------------------------------------

export function getMessagingProviderBaseUrl(
  provider:
    MessagingProviderName
): string | undefined {
  let envBaseUrl:
    string |
    undefined;

  switch (
    provider
  ) {
    case "TWILIO":
      envBaseUrl =
        process.env
          .TWILIO_PUBLIC_BASE_URL;
      break;

    case "PLIVO":
      envBaseUrl =
        process.env
          .PLIVO_PUBLIC_BASE_URL;
      break;

    case "EXOTEL":
      envBaseUrl =
        process.env
          .EXOTEL_PUBLIC_BASE_URL;
      break;

    case "META":
      envBaseUrl =
        process.env
          .META_PUBLIC_BASE_URL;
      break;

    default:
      envBaseUrl =
        undefined;
      break;
  }

  const rawUrl =
    (
      envBaseUrl ??
      process.env
        .APP_URL
    )
      ?.trim()
      .replace(
        /\/+$/,
        ""
      );

  return rawUrl ||
    undefined;
}

//--------------------------------------------------
// Build Status Callback URL
//--------------------------------------------------

export function buildMessagingStatusCallbackUrl(
  options:
    BuildMessagingStatusCallbackUrlOptions
): string | undefined {
  const {
    provider,
    outboundMessageId,
  } = options;

  if (
    !outboundMessageId
  ) {
    return undefined;
  }

  const providerName: MessagingProviderName =
    typeof provider ===
    "string"
      ? provider
      : provider.provider;

  const callbackPath =
    typeof provider !==
      "string" &&
    provider.statusCallbackPath
      ? provider.statusCallbackPath
      : PROVIDER_STATUS_CALLBACK_PATHS[
          providerName
        ];

  if (
    !callbackPath
  ) {
    return undefined;
  }

  const baseUrl =
    getMessagingProviderBaseUrl(
      providerName
    );

  if (
    !baseUrl
  ) {
    return undefined;
  }

  const normalizedPath =
    callbackPath.startsWith(
      "/"
    )
      ? callbackPath
      : `/${callbackPath}`;

  return (
    `${baseUrl}${normalizedPath}` +
    `?messageId=${encodeURIComponent(
      outboundMessageId
    )}`
  );
}
