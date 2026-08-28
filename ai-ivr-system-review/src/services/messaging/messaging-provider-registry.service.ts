import type {
  MessagingChannel,
  MessagingProviderAdapter,
  MessagingProviderName,
} from "./messaging.types";

//--------------------------------------------------
// Registry
//--------------------------------------------------

const adapters =
  new Map<
    MessagingProviderName,
    MessagingProviderAdapter
  >();

//--------------------------------------------------
// Register
//--------------------------------------------------

export function registerMessagingProvider(
  adapter:
    MessagingProviderAdapter
): void {
  adapters.set(
    adapter.provider,
    adapter
  );
}

//--------------------------------------------------
// Get Provider
//--------------------------------------------------

export function getMessagingProvider(
  provider:
    MessagingProviderName
):
  | MessagingProviderAdapter
  | null {
  return (
    adapters.get(
      provider
    ) ??
    null
  );
}

//--------------------------------------------------
// Supports Channel
//--------------------------------------------------

export function providerSupportsChannel(
  provider:
    MessagingProviderName,

  channel:
    MessagingChannel
): boolean {
  const adapter =
    getMessagingProvider(
      provider
    );

  return Boolean(
    adapter &&
    adapter.channels.includes(
      channel
    )
  );
}

//--------------------------------------------------
// Clear
//--------------------------------------------------

export function clearMessagingProviders():
  void {
  adapters.clear();
}