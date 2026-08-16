import type {
  BusinessToolDefinition,
  BusinessToolName,
} from "./tool-gateway.types";

//--------------------------------------------------
// Registry
//--------------------------------------------------

const toolRegistry =
  new Map<
    BusinessToolName,
    BusinessToolDefinition
  >();

//--------------------------------------------------
// Register Tool
//--------------------------------------------------

export function registerBusinessTool(
  definition:
    BusinessToolDefinition
): void {
  if (
    toolRegistry.has(
      definition.name
    )
  ) {
    throw new Error(
      `Business tool already registered: ${definition.name}`
    );
  }

  if (
    !Number.isFinite(
      definition.timeoutMs
    ) ||
    definition.timeoutMs <=
      0
  ) {
    throw new Error(
      `Invalid timeout for business tool: ${definition.name}`
    );
  }

  toolRegistry.set(
    definition.name,
    definition
  );
}

//--------------------------------------------------
// Replace Tool
//--------------------------------------------------

export function replaceBusinessTool(
  definition:
    BusinessToolDefinition
): void {
  if (
    !Number.isFinite(
      definition.timeoutMs
    ) ||
    definition.timeoutMs <=
      0
  ) {
    throw new Error(
      `Invalid timeout for business tool: ${definition.name}`
    );
  }

  toolRegistry.set(
    definition.name,
    definition
  );
}

//--------------------------------------------------
// Get Tool
//--------------------------------------------------

export function getBusinessTool(
  name:
    BusinessToolName
):
  | BusinessToolDefinition
  | null {
  return (
    toolRegistry.get(
      name
    ) ??
    null
  );
}

//--------------------------------------------------
// Check Registration
//--------------------------------------------------

export function hasBusinessTool(
  name:
    BusinessToolName
): boolean {
  return toolRegistry.has(
    name
  );
}

//--------------------------------------------------
// List Tools
//--------------------------------------------------

export function listBusinessTools():
  BusinessToolDefinition[] {
  return Array.from(
    toolRegistry.values()
  );
}

//--------------------------------------------------
// Clear Registry
//--------------------------------------------------

export function clearBusinessToolRegistry():
  void {
  toolRegistry.clear();
}