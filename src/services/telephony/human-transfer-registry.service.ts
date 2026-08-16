import type {
  HumanTransferAdapter,
  HumanTransferProvider,
} from "./human-transfer.types";

//--------------------------------------------------
// Registry
//--------------------------------------------------

const adapters =
  new Map<
    HumanTransferProvider,
    HumanTransferAdapter
  >();

//--------------------------------------------------
// Register Adapter
//--------------------------------------------------

export function registerHumanTransferAdapter(
  adapter:
    HumanTransferAdapter
): void {
  adapters.set(
    adapter.provider,
    adapter
  );
}

//--------------------------------------------------
// Resolve Adapter
//--------------------------------------------------

export function getHumanTransferAdapter(
  provider:
    HumanTransferProvider
):
  | HumanTransferAdapter
  | null {
  return (
    adapters.get(
      provider
    ) ??
    null
  );
}

//--------------------------------------------------
// Capability
//--------------------------------------------------

export function canTransferToHuman(
  provider:
    HumanTransferProvider
): boolean {
  const adapter =
    getHumanTransferAdapter(
      provider
    );

  return Boolean(
    adapter &&
    adapter.isConfigured()
  );
}

//--------------------------------------------------
// Clear
//--------------------------------------------------

export function clearHumanTransferAdapters():
  void {
  adapters.clear();
}