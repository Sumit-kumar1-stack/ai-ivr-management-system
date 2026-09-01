import {
  IVRFlowLifecycle,
  IVRFlowValidationStatus,
  Prisma,
} from "@prisma/client";

import {
  createHash,
} from "crypto";

import {
  prisma,
} from "@/lib/prisma";
import { ConflictError, NotFoundError } from "@/lib/app-error";
import { canBypassMakerCheckerForTesting } from "@/services/security/governance-override.service";

import {
  validateIVRFlowDefinition,
} from "@/services/ivr/ivr-flow-validator.service";

import {
  normalizeIVRMenuRouting,
} from "@/services/ivr/ivr-menu-routing.service";

import type {
  ValidateIVRFlowInput,
} from "@/services/ivr/ivr-flow-validator.service";

import type {
  IVRAction,
  IVRMenuOption,
  IVRRuntimeMenu,
} from "@/services/ivr/ivr-runtime.types";

//--------------------------------------------------
// Defaults
//--------------------------------------------------

const DEFAULT_INVALID_PROMPT =
  "That option is not available. Please try again.";

const DEFAULT_TIMEOUT_PROMPT =
  "I did not receive a selection. Please try again.";

const DEFAULT_EXHAUSTED_PROMPT =
  "I am having trouble receiving your keypad selection. Please continue using the voice assistant.";

const DEFAULT_MAX_ATTEMPTS =
  3;

//--------------------------------------------------
// Record Guard
//--------------------------------------------------

function isRecord(
  value: unknown
): value is Record<
  string,
  unknown
> {
  return (
    typeof value ===
      "object" &&
    value !== null &&
    !Array.isArray(
      value
    )
  );
}

//--------------------------------------------------
// Supported Actions
//--------------------------------------------------

const IVR_ACTIONS =
  new Set<
    IVRAction
  >([
    "LOAN_INFORMATION",
    "DEPOSIT_INFORMATION",
    "BRANCH_INFORMATION",
    "REQUEST_CALLBACK",
    "HUMAN_AGENT",
    "REPEAT_MENU",
    "CONTINUE_AI",
    "END_CALL",
    "CUSTOM",
  ]);

//--------------------------------------------------
// Action Parser
//--------------------------------------------------

function parseAction(
  value: unknown
): IVRAction | null {
  if (
    typeof value !==
    "string"
  ) {
    return null;
  }

  const normalized =
    value
      .trim()
      .toUpperCase();

  if (
    !IVR_ACTIONS.has(
      normalized as
        IVRAction
    )
  ) {
    return null;
  }

  return normalized as
    IVRAction;
}

//--------------------------------------------------
// Option Parser
//--------------------------------------------------

function parseMenuOption(
  value: unknown
): IVRMenuOption | null {
  if (
    !isRecord(
      value
    )
  ) {
    return null;
  }

  const digit =
    typeof value.digit ===
      "string"
      ? value.digit.trim()
      : "";

  const label =
    typeof value.label ===
      "string"
      ? value.label.trim()
      : "";

  const action =
    parseAction(
      value.action
    );

  if (
    !digit ||
    !label ||
    !action
  ) {
    return null;
  }

  if (
    !/^(?:[0-9]|#|\*)$/.test(
      digit
    )
  ) {
    return null;
  }

  const response =
    typeof value.response ===
      "string"
      ? value.response.trim()
      : undefined;

  const optionValue =
    typeof value.value ===
      "string"
      ? value.value.trim()
      : undefined;

  if (
    action ===
      "CUSTOM" &&
    !optionValue
  ) {
    return null;
  }

  return {
    digit,

    action,

    label,

    response:
      response ||
      undefined,

    value:
      optionValue ||
      undefined,
  };
}

//--------------------------------------------------
// Menu Parser
//--------------------------------------------------

function parseRuntimeMenu(
  value: unknown
): IVRRuntimeMenu | null {
  if (
    !isRecord(
      value
    )
  ) {
    return null;
  }

  if (
    value.type !==
    "DTMF_MENU"
  ) {
    return null;
  }

  const prompt =
    typeof value.prompt ===
      "string"
      ? value.prompt.trim()
      : "";

  if (
    !prompt
  ) {
    return null;
  }

  if (
    !Array.isArray(
      value.options
    )
  ) {
    return null;
  }

  const options =
    value.options
      .map(
        parseMenuOption
      )
      .filter(
        (
          option
        ): option is IVRMenuOption =>
          option !==
          null
      );

  /*
   * Invalid options must not silently disappear
   * during publication.
   */
  if (
    options.length !==
    value.options.length
  ) {
    return null;
  }

  if (
    options.length ===
    0
  ) {
    return null;
  }

  //------------------------------------------------
  // Duplicate Digit Validation
  //------------------------------------------------

  const digits =
    new Set<
      string
    >();

  for (
    const option of
    options
  ) {
    if (
      digits.has(
        option.digit
      )
    ) {
      return null;
    }

    digits.add(
      option.digit
    );
  }

  const invalidPrompt =
    typeof value.invalidPrompt ===
      "string" &&
    value.invalidPrompt.trim()
      ? value.invalidPrompt.trim()
      : DEFAULT_INVALID_PROMPT;

  const timeoutPrompt =
    typeof value.timeoutPrompt ===
      "string" &&
    value.timeoutPrompt.trim()
      ? value.timeoutPrompt.trim()
      : DEFAULT_TIMEOUT_PROMPT;

  const exhaustedPrompt =
    typeof value.exhaustedPrompt ===
      "string" &&
    value.exhaustedPrompt.trim()
      ? value.exhaustedPrompt.trim()
      : DEFAULT_EXHAUSTED_PROMPT;

  const configuredMaxAttempts =
    typeof value.maxAttempts ===
      "number"
      ? value.maxAttempts
      : Number.NaN;

  const maxAttempts =
    Number.isInteger(
      configuredMaxAttempts
    ) &&
    configuredMaxAttempts >=
      1 &&
    configuredMaxAttempts <=
      5
      ? configuredMaxAttempts
      : DEFAULT_MAX_ATTEMPTS;

  return {
    type:
      "DTMF_MENU",

    prompt,

    invalidPrompt,

    timeoutPrompt,

    exhaustedPrompt,

    options,

    maxAttempts,
  };
}

//--------------------------------------------------
// Menu From Nodes
//--------------------------------------------------

function resolveRuntimeMenuFromNodes(
  nodes: unknown
): IVRRuntimeMenu | null {
  if (
    !Array.isArray(
      nodes
    )
  ) {
    return null;
  }

  for (
    const node of
    nodes
  ) {
    //------------------------------------------------
    // Direct Runtime Node
    //------------------------------------------------

    const direct =
      parseRuntimeMenu(
        node
      );

    if (
      direct
    ) {
      return direct;
    }

    //------------------------------------------------
    // React Flow Node
    //------------------------------------------------

    if (
      !isRecord(
        node
      )
    ) {
      continue;
    }

    if (
      !isRecord(
        node.data
      )
    ) {
      continue;
    }

    const runtimeMenu = isRecord(node.data.runtimeMenu)
      ? node.data.runtimeMenu
      : {};
    const options = Array.isArray(node.data.options)
      ? node.data.options
      : Array.isArray(node.data.menuOptions)
        ? node.data.menuOptions
        : runtimeMenu.options;
    const nested = parseRuntimeMenu({
      ...runtimeMenu,
      options,
    });

    if (
      nested
    ) {
      return nested;
    }
  }

  return null;
}

//--------------------------------------------------
// Basic Draft Validation
//--------------------------------------------------

function validateNodesAndEdges(
  nodes: unknown,
  edges: unknown
): asserts nodes is Prisma.InputJsonValue[] {
  if (
    !Array.isArray(
      nodes
    )
  ) {
    throw new Error(
      "IVR flow nodes must be an array."
    );
  }

  if (
    !Array.isArray(
      edges
    )
  ) {
    throw new Error(
      "IVR flow edges must be an array."
    );
  }
}

function createFlowContentHash(
  nodes: Prisma.JsonValue,
  edges: Prisma.JsonValue
): string {
  return createHash("sha256")
    .update(JSON.stringify({ nodes, edges }))
    .digest("hex");
}

// New drafts persist top-level `options` and the canonical `digit` field.
// This read/upgrade step accepts historical menuOptions and runtimeMenu.options
// only long enough to write the canonical shape on the next create or update.
export function normalizePersistedMenuDigits(
  nodes: Prisma.InputJsonValue[]
): Prisma.InputJsonValue[] {
  return nodes.map(node => {
    const rawNode: unknown = node;
    if (!isRecord(rawNode) || !isRecord(rawNode.data)) return node;

    const data = { ...rawNode.data };
    const runtimeMenu = isRecord(data.runtimeMenu) ? { ...data.runtimeMenu } : null;
    const sourceOptions = Array.isArray(data.options)
      ? data.options
      : Array.isArray(data.menuOptions)
        ? data.menuOptions
        : Array.isArray(runtimeMenu?.options)
          ? runtimeMenu.options
          : null;
    if (!sourceOptions) return node;

    data.options = sourceOptions.map((option: unknown) => {
      if (!isRecord(option)) return option;
      const normalized = { ...option };
      if (typeof normalized.digit !== "string" && typeof normalized.dtmf === "string") {
        normalized.digit = normalized.dtmf;
      }
      delete normalized.dtmf;
      return normalized;
    });

    delete data.menuOptions;
    if (runtimeMenu) {
      delete runtimeMenu.options;
      data.runtimeMenu = runtimeMenu;
    }

    return {
      ...rawNode,
      data,
    } as Prisma.InputJsonValue;
  });
}

//--------------------------------------------------
// Service
//--------------------------------------------------

export class IVRFlowService {

  //------------------------------------------------
  // Create Draft
  //------------------------------------------------

  static async create(
    data: {
      name: string;

      description?:
        string;

      campaignId?:
        string;

      nodes:
        Prisma.InputJsonValue[];

      edges:
        Prisma.InputJsonValue[];

      ownerUserId?:
        string;

      tenantId?:
        string | null;

      updatedByUserId?: string;
    }
  ) {
    const name =
      data.name
        ?.trim();

    if (
      !name
    ) {
      throw new Error(
        "IVR flow name is required."
      );
    }

    validateNodesAndEdges(
      data.nodes,
      data.edges
    );
    const normalizedGraph = normalizeIVRMenuRouting({
      nodes: normalizePersistedMenuDigits(data.nodes) as never,
      edges: data.edges as never,
    });
    const nodes = normalizedGraph.nodes as Prisma.InputJsonValue[];
    const edges = normalizedGraph.edges as Prisma.InputJsonValue[];

    return prisma.iVRFlow.create({
      data: {
        name,

        description:
          data.description
            ?.trim() ||
          null,

        campaignId:
          data.campaignId
            ?.trim() ||
          null,

        nodes,

        edges,

        isPublished:
          false,

        lifecycle: IVRFlowLifecycle.DRAFT,

        validationStatus: IVRFlowValidationStatus.NOT_VALIDATED,

        ownerUserId:
          data.ownerUserId
            ?.trim() ||
          null,

        tenantId:
          data.tenantId?.trim() ||
          (data.ownerUserId
            ? (
                await prisma.user.findUnique({
                  where: { id: data.ownerUserId },
                  select: { tenantId: true },
                })
              )?.tenantId ?? null
            : null),

        updatedByUserId: data.updatedByUserId?.trim() || data.ownerUserId?.trim() || null,
      },
    });
  }

  //------------------------------------------------
  // All
  //------------------------------------------------

  static async findAll(tenantId?: string | null, includeArchived = false) {
    const resolvedTenantId = tenantId?.trim() ?? "";
    if (!resolvedTenantId) {
      return [];
    }

    return prisma.iVRFlow.findMany({
      where: {
        tenantId: resolvedTenantId,
        ...(includeArchived ? {} : { lifecycle: { not: IVRFlowLifecycle.ARCHIVED } }),
      },

      orderBy: {
        updatedAt:
          "desc",
      },
      include: {
        ownerUser: { select: { id: true, fullName: true, email: true } },
        inboundProfiles: {
          select: {
            id: true,
            name: true,
            active: true,
            voiceRuntime: true,
            ivrFlowVersionId: true,
            numbers: { select: { provider: true, providerNumber: true, active: true } },
          },
        },
        versions: {
          select: {
            id: true,
            versionNumber: true,
            status: true,
            validationStatus: true,
            validatedAt: true,
            publishedAt: true,
            createdAt: true,
            createdByUser: { select: { fullName: true } },
            approvedByUser: { select: { fullName: true } },
            publishedByUser: { select: { fullName: true } },
            inboundProfiles: { select: { id: true, name: true, active: true } },
          },
          orderBy: { versionNumber: "desc" },
        },
      },
    });
  }

  //------------------------------------------------
  // By ID
  //------------------------------------------------

  static async findById(
    id: string,
    ownerUserId?: string
  ) {
    const flow = await prisma.iVRFlow.findFirst({
      where: {
        id,
        ...(ownerUserId
          ? {
              ownerUserId,
            }
          : {}),
      },
      include: {
        versions: {
          orderBy: {
            versionNumber: "desc",
          },
          select: {
            id: true,
            flowId: true,
            tenantId: true,
            versionNumber: true,
            status: true,
            publishedAt: true,
            createdAt: true,
            updatedAt: true,
            createdByUserId: true,
          },
        },
      },
    });

    if (!flow || !Array.isArray(flow.nodes) || !Array.isArray(flow.edges)) {
      return flow;
    }

    // The editor always receives the canonical top-level options shape. This
    // is a read-only upgrade for saved legacy flows; create/update perform the
    // corresponding persistent normalization.
    const normalized = normalizeIVRMenuRouting({
      nodes: normalizePersistedMenuDigits(flow.nodes as Prisma.InputJsonValue[]) as never,
      edges: flow.edges as never,
    });

    return {
      ...flow,
      nodes: normalized.nodes as Prisma.JsonValue,
      edges: normalized.edges as Prisma.JsonValue,
    };
  }

  //------------------------------------------------
  // Published By Campaign
  //------------------------------------------------

  static async findPublishedForCampaign(
    campaignId:
      string
  ) {
    const normalized =
      campaignId.trim();

    if (
      !normalized
    ) {
      return null;
    }

    return prisma.iVRFlow.findFirst({
      where: {
        campaignId:
          normalized,

        isPublished:
          true,
      },

      orderBy: [
        {
          version:
            "desc",
        },

        {
          updatedAt:
            "desc",
        },
      ],
    });
  }

  //------------------------------------------------
  // Runtime Menu
  //------------------------------------------------

  static getRuntimeMenu(
    flow: {
      nodes:
        Prisma.JsonValue;
    }
  ):
    IVRRuntimeMenu | null {
    return resolveRuntimeMenuFromNodes(
      flow.nodes
    );
  }

  //------------------------------------------------
  // Runtime Menu By Campaign
  //------------------------------------------------

  static async findRuntimeMenuForCampaign(
    campaignId:
      string
  ):
    Promise<
      IVRRuntimeMenu | null
    > {
    const flow =
      await this
        .findPublishedForCampaign(
          campaignId
        );

    if (
      !flow
    ) {
      return null;
    }

    return this.getRuntimeMenu(
      flow
    );
  }

  //------------------------------------------------
  // Update Draft
  //------------------------------------------------

  static async update(
    id: string,
    data: {
      name?:
        string;

      description?:
        string | null;

      campaignId?:
        string | null;

      nodes:
        Prisma.InputJsonValue[];

      edges:
        Prisma.InputJsonValue[];

      updatedByUserId?: string;
    }
  ) {
    validateNodesAndEdges(
      data.nodes,
      data.edges
    );
    const normalizedGraph = normalizeIVRMenuRouting({
      nodes: normalizePersistedMenuDigits(data.nodes) as never,
      edges: data.edges as never,
    });
    const nodes = normalizedGraph.nodes as Prisma.InputJsonValue[];
    const edges = normalizedGraph.edges as Prisma.InputJsonValue[];

    const existing =
      await prisma.iVRFlow
        .findUnique({
          where: {
            id,
          },
        });

    if (
      !existing
    ) {
      throw new Error(
        "IVR flow not found."
      );
    }

    const name =
      data.name !==
        undefined
        ? data.name.trim()
        : existing.name;

    if (
      !name
    ) {
      throw new Error(
        "IVR flow name is required."
      );
    }

    /*
     * Any configuration change makes the current
     * version a draft again. It must be republished.
     */
    return prisma.iVRFlow.update({
      where: {
        id,
      },

      data: {
        name,

        description:
          data.description !==
            undefined
            ? data.description
                ?.trim() ||
              null
            : existing.description,

        campaignId:
          data.campaignId !==
            undefined
            ? data.campaignId
                ?.trim() ||
              null
            : existing.campaignId,

        nodes,

        edges,

        isPublished:
          false,

        lifecycle: IVRFlowLifecycle.DRAFT,

        validationStatus: IVRFlowValidationStatus.NOT_VALIDATED,

        validatedAt: null,

        submittedAt: null,

        submittedByUserId: null,

        approvedAt: null,

        approvedByUserId: null,

        rejectedAt: null,

        rejectedByUserId: null,

        rejectionReason: null,

        updatedByUserId: data.updatedByUserId?.trim() || existing.updatedByUserId,

        version:
          existing.isPublished
            ? existing.version + 1
            : existing.version,
      },
    });
  }

  //------------------------------------------------
  // Validate For Publication
  //------------------------------------------------

  static async validateForPublish(
    id: string,
    resourceAuthorization: Pick<
      ValidateIVRFlowInput,
      | "allowedKnowledgeDocumentIds"
      | "allowedActionCodes"
      | "allowedTransferDestinationIds"
      | "allowedCallbackDestinationIds"
      | "allowedTemplateIds"
      | "allowedBusinessHoursPolicyIds"
      | "allowedAuthenticationLevels"
    > = {}
  ) {
    const flow =
      await this.findById(
        id
      );

    if (
      !flow
    ) {
      throw new Error(
        "IVR flow not found."
      );
    }

    const validation =
      validateIVRFlowDefinition({
        nodes:
          Array.isArray(flow.nodes)
            ? flow.nodes
            : [],

        edges:
          Array.isArray(flow.edges)
            ? flow.edges
            : [],

        tenantId:
          flow.tenantId ?? null,

        enforcePublicationReadiness: true,

        ...resourceAuthorization,
      });

    return {
      flow,
      validation,
    };
  }

  static async recordValidation(
    id: string,
    resourceAuthorization: Parameters<typeof IVRFlowService.validateForPublish>[1] = {}
  ) {
    const result = await this.validateForPublish(id, resourceAuthorization);
    const flow = await prisma.iVRFlow.update({
      where: { id },
      data: {
        lifecycle: result.validation.valid ? IVRFlowLifecycle.VALIDATED : IVRFlowLifecycle.DRAFT,
        validationStatus: result.validation.valid ? IVRFlowValidationStatus.VALID : IVRFlowValidationStatus.INVALID,
        validatedAt: new Date(),
      },
    });
    return { flow, validation: result.validation };
  }

  static async submitForApproval(id: string, submittedByUserId: string) {
    const flow = await prisma.iVRFlow.findUnique({ where: { id } });
    if (!flow || flow.lifecycle !== IVRFlowLifecycle.VALIDATED || flow.validationStatus !== IVRFlowValidationStatus.VALID) {
      throw new ConflictError("A valid IVR draft is required before submission for approval.", "IVR_FLOW_NOT_VALIDATED");
    }
    return prisma.iVRFlow.update({ where: { id }, data: { lifecycle: IVRFlowLifecycle.PENDING_APPROVAL, submittedAt: new Date(), submittedByUserId, rejectionReason: null, rejectedAt: null, rejectedByUserId: null } });
  }

  static async withdrawSubmission(id: string, withdrawnByUserId: string) {
    const flow = await prisma.iVRFlow.findUnique({ where: { id } });
    if (!flow) throw new NotFoundError("IVR flow", id);
    if (flow.lifecycle !== IVRFlowLifecycle.PENDING_APPROVAL) {
      throw new ConflictError("Only a submitted IVR flow can be withdrawn.", "IVR_FLOW_NOT_SUBMITTED");
    }

    return prisma.iVRFlow.update({
      where: { id },
      data: {
        lifecycle: IVRFlowLifecycle.DRAFT,
        validationStatus: IVRFlowValidationStatus.NOT_VALIDATED,
        validatedAt: null,
        submittedAt: null,
        submittedByUserId: null,
        updatedByUserId: withdrawnByUserId,
      },
    });
  }

  static async approve(id: string, approvedByUserId: string) {
    const flow = await prisma.iVRFlow.findUnique({ where: { id } });
    if (!flow || flow.lifecycle !== IVRFlowLifecycle.PENDING_APPROVAL) throw new ConflictError("Only submitted IVR flows can be approved.", "IVR_FLOW_NOT_SUBMITTED");
    const approver = await prisma.user.findUnique({ where: { id: approvedByUserId }, select: { id: true, role: true } });
    const isSelf = flow.ownerUserId === approvedByUserId || flow.submittedByUserId === approvedByUserId;
    if (isSelf && !canBypassMakerCheckerForTesting(approver)) {
      throw new ConflictError("A flow creator cannot approve their own submitted flow.", "IVR_FLOW_SELF_APPROVAL_BLOCKED");
    }
    return prisma.iVRFlow.update({ where: { id }, data: { lifecycle: IVRFlowLifecycle.APPROVED, approvedAt: new Date(), approvedByUserId } });
  }

  static async reject(id: string, rejectedByUserId: string, reason: string) {
    const flow = await prisma.iVRFlow.findUnique({ where: { id } });
    if (!flow || flow.lifecycle !== IVRFlowLifecycle.PENDING_APPROVAL) throw new ConflictError("Only submitted IVR flows can be rejected.", "IVR_FLOW_NOT_SUBMITTED");
    const rejecter = await prisma.user.findUnique({ where: { id: rejectedByUserId }, select: { id: true, role: true } });
    const isSelf = flow.ownerUserId === rejectedByUserId || flow.submittedByUserId === rejectedByUserId;
    if (isSelf && !canBypassMakerCheckerForTesting(rejecter)) {
      throw new ConflictError("A flow creator cannot reject their own submitted flow.", "IVR_FLOW_SELF_APPROVAL_BLOCKED");
    }
    const rejectionReason = reason.trim();
    if (!rejectionReason) throw new ConflictError("A rejection reason is required.", "IVR_FLOW_REJECTION_REASON_REQUIRED");
    return prisma.iVRFlow.update({ where: { id }, data: { lifecycle: IVRFlowLifecycle.REJECTED, rejectedAt: new Date(), rejectedByUserId, rejectionReason } });
  }

  //------------------------------------------------
  // Publish
  //------------------------------------------------

  static async publish(
    id: string,
    resourceAuthorization: Pick<
      ValidateIVRFlowInput,
      | "allowedKnowledgeDocumentIds"
      | "allowedActionCodes"
      | "allowedTransferDestinationIds"
      | "allowedCallbackDestinationIds"
      | "allowedTemplateIds"
      | "allowedBusinessHoursPolicyIds"
      | "allowedAuthenticationLevels"
    > = {},
    publishedByUserId?: string
  ) {
    const {
      flow,
      validation,
    } =
      await this
        .validateForPublish(
          id,
          resourceAuthorization
        );

    if (!validation.valid) {
      throw new Error(validation.errors.map(issue => issue.message).join(" "));
    }

    if (flow.lifecycle !== IVRFlowLifecycle.APPROVED || flow.validationStatus !== IVRFlowValidationStatus.VALID) {
      throw new Error("An approved, valid IVR flow is required before publishing.");
    }

    /*
     * Only one live flow is allowed for a campaign.
     */
    return prisma.$transaction(
      async transaction => {
        const contentHash = createFlowContentHash(flow.nodes, flow.edges);
        const existingVersion = await transaction.iVRFlowVersion.findUnique({
          where: {
            flowId_versionNumber: {
              flowId: flow.id,
              versionNumber: flow.version,
            },
          },
        });

        if (existingVersion?.status === "PUBLISHED") {
          throw new Error("This IVR flow version is already published and immutable.");
        }

        const version = existingVersion
          ? await transaction.iVRFlowVersion.update({
              where: { id: existingVersion.id },
              data: {
                status: "PUBLISHED",
                nodes: flow.nodes as Prisma.InputJsonValue,
                edges: flow.edges as Prisma.InputJsonValue,
                contentHash,
                validationStatus: IVRFlowValidationStatus.VALID,
                validatedAt: new Date(),
                approvedByUserId: flow.approvedByUserId,
                publishedByUserId: publishedByUserId?.trim() || flow.ownerUserId,
                publishedAt: new Date(),
              },
            })
          : await transaction.iVRFlowVersion.create({
              data: {
                flowId: flow.id,
                tenantId: flow.tenantId,
                versionNumber: flow.version,
                status: "PUBLISHED",
                nodes: flow.nodes as Prisma.InputJsonValue,
                edges: flow.edges as Prisma.InputJsonValue,
                contentHash,
                createdByUserId: flow.ownerUserId,
                validationStatus: IVRFlowValidationStatus.VALID,
                validatedAt: new Date(),
                approvedByUserId: flow.approvedByUserId,
                publishedByUserId: publishedByUserId?.trim() || flow.ownerUserId,
                publishedAt: new Date(),
              },
            });

        if (flow.campaignId) {
          await transaction.iVRFlow.updateMany({
            where: {
              campaignId: flow.campaignId,
              isPublished: true,
              NOT: { id },
            },
            data: { isPublished: false },
          });
        }

        await transaction.iVRFlow.update({
            where: {
              id,
            },

            data: {
              isPublished:
                true,
              lifecycle: IVRFlowLifecycle.PUBLISHED,
            },
          });

        return {
          ...flow,
          isPublished: true,
          publishedVersion: version,
        };
      }
    );
  }

  static async findPublishedVersion(
    flowId: string
  ) {
    return prisma.iVRFlowVersion.findFirst({
      where: {
        flowId: flowId.trim(),
        status: "PUBLISHED",
      },
      orderBy: { versionNumber: "desc" },
    });
  }

  static async findVersionById(
    versionId: string
  ) {
    const id = versionId.trim();

    return id
      ? prisma.iVRFlowVersion.findUnique({ where: { id } })
      : null;
  }

  //------------------------------------------------
  // Delete
  //------------------------------------------------

  static async delete(
    id: string
  ) {
    const dependencies = await prisma.iVRFlow.findUnique({
      where: { id },
      select: {
        lifecycle: true,
        isPublished: true,
        inboundProfiles: { select: { id: true } },
        versions: { select: { id: true } },
      },
    });

    if (!dependencies) throw new NotFoundError("IVR flow", id);
    if (dependencies.lifecycle !== IVRFlowLifecycle.DRAFT && dependencies.lifecycle !== IVRFlowLifecycle.VALIDATED) {
      throw new ConflictError("Only disposable draft or validated IVR flows can be deleted.", "IVR_FLOW_DELETE_LIFECYCLE_BLOCKED");
    }
    if (dependencies.isPublished || dependencies.inboundProfiles.length || dependencies.versions.length) {
      throw new ConflictError("This IVR flow has published or applied history and must be retained.", "IVR_FLOW_DELETE_DEPENDENCY_BLOCKED");
    }

    return prisma.iVRFlow.delete({
      where: {
        id,
      },
    });
  }

  static async archive(id: string) {
    const flow = await prisma.iVRFlow.findUnique({ where: { id }, select: { lifecycle: true } });
    if (!flow) throw new NotFoundError("IVR flow", id);
    if (flow.lifecycle === IVRFlowLifecycle.ARCHIVED) {
      throw new ConflictError("This IVR flow is already archived.", "IVR_FLOW_ALREADY_ARCHIVED");
    }
    const activeBindings = await prisma.inboundProfile.count({
      where: { ivrFlowId: id, active: true, ivrFlowVersionId: { not: null } },
    });
    if (activeBindings > 0) {
      throw new ConflictError("Unapply or rebind this flow before archiving it.", "IVR_FLOW_ACTIVE_DEPLOYMENT_BLOCKED");
    }
    return prisma.iVRFlow.update({
      where: { id },
      data: { lifecycle: IVRFlowLifecycle.ARCHIVED, archivedAt: new Date() },
    });
  }
}
