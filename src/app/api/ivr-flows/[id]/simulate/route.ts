import { AuditEventOutcome, UserRole } from "@prisma/client";

import { NextRequest } from "next/server";

import { success } from "@/lib/api-response";
import { AppError } from "@/lib/app-error";
import { asyncHandler } from "@/lib/async-handler";
import { requireRole } from "@/lib/auth";
import { recordAuditEvent } from "@/services/audit/audit-event.service";

import { IVRFlowService } from "@/services/ivr-flow.service";
import { runIVRSimulationScenario } from "@/services/ivr/ivr-simulation-scenario.service";
import { simulateIVRFlow } from "@/services/ivr/ivr-simulator.service";
import { assertIvrFlowOwnership } from "@/services/security/tenant-access.service";

const FLOW_ROLES = [UserRole.SUPER_ADMIN, UserRole.ADMIN] as const;

export const POST = asyncHandler(
  async (
    request: NextRequest,
    {
      params,
    }: {
      params: Promise<{
        id: string;
      }>;
    }
  ) => {
    const currentUser = await requireRole(FLOW_ROLES);
    const { id } = await params;

    await assertIvrFlowOwnership(id, currentUser);

    const flow = await IVRFlowService.findById(id);

    if (!flow) {
      throw new Error("IVR flow not found.");
    }

    const body = await request.json().catch(() => ({}));
    const nodes =
      Array.isArray(body.nodes) && body.nodes.length > 0
        ? body.nodes
        : Array.isArray(flow.nodes)
          ? flow.nodes
          : [];
    const edges =
      Array.isArray(body.edges) && body.edges.length > 0
        ? body.edges
        : Array.isArray(flow.edges)
          ? flow.edges
          : [];

    const scenario =
      body.scenario !== undefined
        ? parseSimulationScenario(body.scenario)
        : Array.isArray(body.steps)
          ? { name: typeof body.name === "string" ? body.name : "Ad hoc scenario", description: typeof body.description === "string" ? body.description : undefined, steps: body.steps }
          : null;

    if (body.scenario !== undefined && !scenario) {
      throw new AppError("Malformed simulation scenario.", 422, "IVR_SIMULATION_INVALID_SCENARIO");
    }

    if (scenario && Array.isArray((scenario as { steps?: unknown[] }).steps)) {
      const simulationResult = runIVRSimulationScenario({
        nodes,
        edges,
        scenario: scenario as Parameters<typeof runIVRSimulationScenario>[0]["scenario"],
        tenantId: flow.tenantId ?? null,
      });

      await recordAuditEvent({
        tenantId: flow.tenantId ?? "",
        actor: currentUser,
        entityType: "IVR_FLOW",
        entityId: id,
        action: "ivr.builder.simulated",
        outcome: AuditEventOutcome.SUCCEEDED,
        metadata: {
          mode: "SCENARIO",
          blocked: simulationResult.blocked,
          status: simulationResult.status,
          validationValid: simulationResult.validation.valid,
          stepCount: simulationResult.steps.length,
          nodeCount: nodes.length,
          edgeCount: edges.length,
        },
      });

      return success(simulationResult);
    }

    const simulation = simulateIVRFlow({
      nodes,
      edges,
      currentNodeId: typeof body.currentNodeId === "string" ? body.currentNodeId : null,
      startNodeId: typeof body.startNodeId === "string" ? body.startNodeId : null,
      inputMode: body.inputMode === "VOICE" || body.inputMode === "SILENCE" ? body.inputMode : "DTMF",
      input: typeof body.input === "string" ? body.input : "",
      tenantId: flow.tenantId ?? null,
    });

    await recordAuditEvent({
      tenantId: flow.tenantId ?? "",
      actor: currentUser,
      entityType: "IVR_FLOW",
      entityId: id,
      action: "ivr.builder.simulated",
      outcome: AuditEventOutcome.SUCCEEDED,
      metadata: {
        mode: "LEGACY",
        status: simulation.validation.valid ? "PASS" : "FAIL",
        resultingNodeId: simulation.resultingNodeId,
        nodeCount: nodes.length,
        edgeCount: edges.length,
      },
    });

    return success(simulation);
  }
);

function parseSimulationScenario(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const scenario = value as Record<string, unknown>;
  if (!Array.isArray(scenario.steps)) {
    return null;
  }

  return scenario;
}
