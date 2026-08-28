type GraphNode = {
  id: string;
  data?: Record<string, unknown>;
  [key: string]: unknown;
};

type GraphEdge = {
  id?: string;
  source: string;
  target: string;
  sourceHandle?: string | null;
  targetHandle?: string | null;
  type?: string;
  data?: Record<string, unknown>;
  [key: string]: unknown;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function token(value: unknown): string {
  return stringValue(value)?.toUpperCase() ?? "";
}

function isMenu(node: GraphNode): boolean {
  const kind = stringValue(node.data?.nodeKind)?.toUpperCase();
  return kind === "HYBRID_MENU" || kind === "DTMF_MENU";
}

/**
 * Makes menu options the single source of truth for DTMF graph routes. It is
 * intentionally presentation-safe: React Flow handles are retained, but are
 * derived from the option digit instead of trusted from generated metadata.
 */
export function normalizeIVRMenuRouting<TNode extends GraphNode, TEdge extends GraphEdge>(
  input: { nodes: TNode[]; edges: TEdge[] }
): { nodes: TNode[]; edges: TEdge[] } {
  const nodes = input.nodes.map(node => {
    if (!node.data) return node;
    const data = { ...node.data };
    if (!isMenu({ ...node, data })) {
      return { ...node, data } as TNode;
    }

    const legacyRuntimeMenu = isRecord(data.runtimeMenu) ? { ...data.runtimeMenu } : null;
    const sourceOptions = Array.isArray(data.options)
      ? data.options
      : Array.isArray(data.menuOptions)
        ? data.menuOptions
        : Array.isArray(legacyRuntimeMenu?.options)
          ? legacyRuntimeMenu.options
          : null;

    if (!sourceOptions) {
      delete data.menuOptions;
      return { ...node, data } as TNode;
    }

    data.options = sourceOptions.map(option => {
      if (!isRecord(option)) return option;
      const normalized = { ...option };
      const digit = stringValue(normalized.digit) ?? stringValue(normalized.dtmf);
      if (digit) normalized.digit = digit;
      const destinationNodeId =
        stringValue(normalized.destinationNodeId) ??
        stringValue(normalized.targetNodeId) ??
        stringValue(normalized.destination) ??
        stringValue(normalized.target);
      if (destinationNodeId) normalized.destinationNodeId = destinationNodeId;
      delete normalized.dtmf;
      delete normalized.targetNodeId;
      delete normalized.destination;
      delete normalized.target;
      return normalized;
    });

    delete data.menuOptions;
    if (legacyRuntimeMenu) {
      delete legacyRuntimeMenu.options;
      data.runtimeMenu = legacyRuntimeMenu;
    }
    return { ...node, data } as TNode;
  });

  let edges = input.edges.map(edge => ({
    ...edge,
    data: edge.data ? { ...edge.data } : undefined,
  })) as TEdge[];

  for (const menuNode of nodes.filter(isMenu)) {
    const options = Array.isArray(menuNode.data?.options)
      ? menuNode.data.options.filter(isRecord)
      : [];
    const routes = options.flatMap(option => {
      const digit = stringValue(option.digit);
      const target = stringValue(option.destinationNodeId);
      return digit && target ? [{ digit, target }] : [];
    });

    if (routes.length === 0) continue;

    const digits = new Set(routes.map(route => route.digit));
    const targets = new Set(routes.map(route => route.target));
    const existingByDigit = new Map<string, TEdge>();
    for (const edge of edges) {
      if (edge.source !== menuNode.id || token(edge.data?.trigger) !== "DTMF") {
        continue;
      }

      const digit = stringValue(edge.sourceHandle) ?? stringValue(edge.data?.value);
      if (digit && digits.has(digit) && !existingByDigit.has(digit)) {
        existingByDigit.set(digit, edge);
      }
    }

    edges = edges.filter(edge => {
      if (edge.source !== menuNode.id) return true;
      const trigger = token(edge.data?.trigger);
      const value = stringValue(edge.data?.value);
      const handle = stringValue(edge.sourceHandle);
      const isOptionRoute =
        trigger === "DTMF" ||
        (value !== null && digits.has(value)) ||
        (handle !== null && digits.has(handle)) ||
        (targets.has(edge.target) && !["DEFAULT", "FAILURE", "FALLBACK"].includes(trigger));
      return !isOptionRoute;
    });

    const usedIds = new Set(edges.map(edge => edge.id).filter((id): id is string => Boolean(id)));
    for (const route of routes) {
      const baseId = `${menuNode.id}-dtmf-${route.digit}`;
      let id = baseId;
      let suffix = 2;
      while (usedIds.has(id)) {
        id = `${baseId}-${suffix}`;
        suffix += 1;
      }
      usedIds.add(id);
      const previous = existingByDigit.get(route.digit);
      edges.push({
        id,
        source: menuNode.id,
        target: route.target,
        type: previous?.type ?? "smoothstep",
        sourceHandle: route.digit,
        targetHandle: previous?.targetHandle,
        data: { trigger: "DTMF", value: route.digit },
      } as unknown as TEdge);
    }
  }

  return { nodes, edges };
}
