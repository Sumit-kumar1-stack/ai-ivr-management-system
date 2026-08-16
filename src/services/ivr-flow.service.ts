import {
  Prisma,
} from "@prisma/client";

import {
  prisma,
} from "@/lib/prisma";

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

    const nested =
      parseRuntimeMenu(
        node.data
          .runtimeMenu
      );

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

        nodes:
          data.nodes,

        edges:
          data.edges,

        isPublished:
          false,
      },
    });
  }

  //------------------------------------------------
  // All
  //------------------------------------------------

  static async findAll() {
    return prisma.iVRFlow.findMany({
      orderBy: {
        updatedAt:
          "desc",
      },
    });
  }

  //------------------------------------------------
  // By ID
  //------------------------------------------------

  static async findById(
    id: string
  ) {
    return prisma.iVRFlow.findUnique({
      where: {
        id,
      },
    });
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
    }
  ) {
    validateNodesAndEdges(
      data.nodes,
      data.edges
    );

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

        nodes:
          data.nodes,

        edges:
          data.edges,

        isPublished:
          false,
      },
    });
  }

  //------------------------------------------------
  // Validate For Publication
  //------------------------------------------------

  static async validateForPublish(
    id: string
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

    if (
      !flow.campaignId
        ?.trim()
    ) {
      throw new Error(
        "A campaign must be assigned before publishing the IVR flow."
      );
    }

    //------------------------------------------------
    // Campaign Must Exist
    //------------------------------------------------

    const campaign =
      await prisma.campaign
        .findUnique({
          where: {
            id:
              flow.campaignId,
          },

          select: {
            id:
              true,
          },
        });

    if (
      !campaign
    ) {
      throw new Error(
        "The assigned campaign does not exist."
      );
    }

    //------------------------------------------------
    // Runtime Menu Must Be Valid
    //------------------------------------------------

    const menu =
      this.getRuntimeMenu(
        flow
      );

    if (
      !menu
    ) {
      throw new Error(
        "The flow must contain one valid DTMF menu before publishing."
      );
    }

    return {
      flow,
      menu,
    };
  }

  //------------------------------------------------
  // Publish
  //------------------------------------------------

  static async publish(
    id: string
  ) {
    const {
      flow,
    } =
      await this
        .validateForPublish(
          id
        );

    const campaignId =
      flow.campaignId;

    if (
      !campaignId
    ) {
      throw new Error(
        "Campaign is required."
      );
    }

    /*
     * Only one live flow is allowed for a campaign.
     */
    return prisma.$transaction(
      async transaction => {
        await transaction
          .iVRFlow
          .updateMany({
            where: {
              campaignId,

              isPublished:
                true,

              NOT: {
                id,
              },
            },

            data: {
              isPublished:
                false,
            },
          });

        return transaction
          .iVRFlow
          .update({
            where: {
              id,
            },

            data: {
              isPublished:
                true,
            },
          });
      }
    );
  }

  //------------------------------------------------
  // Delete
  //------------------------------------------------

  static async delete(
    id: string
  ) {
    return prisma.iVRFlow.delete({
      where: {
        id,
      },
    });
  }
}