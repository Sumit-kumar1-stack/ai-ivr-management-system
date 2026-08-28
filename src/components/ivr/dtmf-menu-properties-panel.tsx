"use client";

import {
  Button,
} from "@/components/ui/button";

import {
  Input,
} from "@/components/ui/input";

import {
  Textarea,
} from "@/components/ui/textarea";

import type {
  IVRNode,
  IVRRuntimeAction,
  IVRRuntimeMenuConfig,
  IVRRuntimeMenuOption,
} from "./types";

//--------------------------------------------------
// Props
//--------------------------------------------------

interface Props {
  node:
    IVRNode;

  onChange: (
    runtimeMenu: Omit<IVRRuntimeMenuConfig, "options">,
    options: IVRRuntimeMenuOption[]
  ) => void;
}

//--------------------------------------------------
// Supported Semantic Actions
//--------------------------------------------------

const actions:
  IVRRuntimeAction[] =
  [
    "LOAN_INFORMATION",
    "DEPOSIT_INFORMATION",
    "BRANCH_INFORMATION",
    "REQUEST_CALLBACK",
    "HUMAN_AGENT",
    "AGENT_REQUEST",
    "REPEAT_MENU",
    "CONTINUE_AI",
    "END_CALL",
    "CUSTOM",
  ];

//--------------------------------------------------
// Default Runtime Menu
//--------------------------------------------------

function createDefaultMenu():
  IVRRuntimeMenuConfig {
  return {
    type:
      "DTMF_MENU",

    prompt:
      "Press 1 for loan information, 2 for deposits, 3 for branch information, 4 to request a callback, 9 for a human agent.",

    invalidPrompt:
      "That option is not available. Please try again.",

    timeoutPrompt:
      "I did not receive a selection. Please try again.",

    exhaustedPrompt:
      "I am having trouble receiving your keypad selection. Please continue using the voice assistant.",

    maxAttempts:
      3,

    timeoutSeconds: 8,

    options: [
      {
        digit:
          "1",

        action:
          "LOAN_INFORMATION",

        label:
          "Loan information",

        response:
          "You selected loan information.",
      },

      {
        digit:
          "2",

        action:
          "DEPOSIT_INFORMATION",

        label:
          "Deposit information",

        response:
          "You selected deposit information.",
      },

      {
        digit:
          "3",

        action:
          "BRANCH_INFORMATION",

        label:
          "Branch information",

        response:
          "You selected branch information.",
      },

      {
        digit:
          "4",

        action:
          "REQUEST_CALLBACK",

        label:
          "Request callback",

        response:
          "You selected callback.",
      },

      {
        digit:
          "9",

        action:
          "HUMAN_AGENT",

        label:
          "Human agent",

response:
  "You requested a human agent. I will check whether an agent is available.",
      },

      {
        digit:
          "0",

        action:
          "REPEAT_MENU",

        label:
          "Repeat menu",

        response:
          "Repeating the menu.",
      },
    ],
  };
}

//--------------------------------------------------
// Normalize DTMF Digit
//--------------------------------------------------

function normalizeDigit(
  value: string
): string {
  const normalized =
    value.trim();

  if (
    normalized ===
      "#" ||
    normalized ===
      "*"
  ) {
    return normalized;
  }

  return normalized
    .replace(
      /\D/g,
      ""
    )
    .slice(
      0,
      1
    );
}

//--------------------------------------------------
// Component
//--------------------------------------------------

export default function DTMFMenuPropertiesPanel({
  node,
  onChange,
}: Props) {
  const defaultMenu = createDefaultMenu();
  const legacyMenu = node.data.runtimeMenu;
  const menu: IVRRuntimeMenuConfig = {
    ...defaultMenu,
    ...legacyMenu,
    options: node.data.options ?? legacyMenu?.options ?? defaultMenu.options,
  };

  //------------------------------------------------
  // Update Menu Field
  //------------------------------------------------

  function updateMenu<
    K extends keyof IVRRuntimeMenuConfig
  >(
    field: K,
    value:
      IVRRuntimeMenuConfig[K]
  ): void {
    const updatedMenu = {
      ...menu,
      [field]:
        value,
    };
    const { options, ...runtimeMenu } = updatedMenu;
    onChange(runtimeMenu, options);
  }

  //------------------------------------------------
  // Update Option
  //------------------------------------------------

  function updateOption(
    index: number,
    patch:
      Partial<
        IVRRuntimeMenuOption
      >
  ): void {
    const options =
      menu.options.map(
        (
          option,
          optionIndex
        ) =>
          optionIndex ===
            index
            ? {
                ...option,
                ...patch,
              }
            : option
      );

    updateMenu(
      "options",
      options
    );
  }

  //------------------------------------------------
  // Add Option
  //------------------------------------------------

  function addOption():
    void {
    updateMenu(
      "options",
      [
        ...menu.options,

        {
          digit:
            "",

          action:
            "CUSTOM",

          label:
            "New option",

          response:
            "",

          value:
            "",
        },
      ]
    );
  }

  //------------------------------------------------
  // Remove Option
  //------------------------------------------------

  function removeOption(
    index: number
  ): void {
    updateMenu(
      "options",
      menu.options.filter(
        (
          _option,
          optionIndex
        ) =>
          optionIndex !==
          index
      )
    );
  }

  //------------------------------------------------
  // Render
  //------------------------------------------------

  return (
    <aside className="w-[390px] overflow-y-auto border-l bg-white p-5">

      {/* ----------------------------------------
          Header
      ---------------------------------------- */}

      <div className="mb-5">

        <h3 className="text-lg font-semibold">
          Keypad Menu
        </h3>

        <p className="mt-1 text-sm text-muted-foreground">
          Configure the live DTMF menu used by callers.
        </p>

      </div>

      <div className="space-y-5">

        {/* ----------------------------------------
            Menu Prompt
        ---------------------------------------- */}

        <div>

          <label className="mb-2 block text-sm font-medium">
            Menu prompt
          </label>

          <Textarea
            value={
              menu.prompt
            }

            onChange={
              event =>
                updateMenu(
                  "prompt",
                  event.target
                    .value
                )
            }

            placeholder="Tell callers which keypad options are available."
          />

        </div>

        {/* ----------------------------------------
            Invalid Selection
        ---------------------------------------- */}

        <div>

          <label className="mb-2 block text-sm font-medium">
            Invalid-selection prompt
          </label>

          <Textarea
            value={
              menu.invalidPrompt
            }

            onChange={
              event =>
                updateMenu(
                  "invalidPrompt",
                  event.target
                    .value
                )
            }

            placeholder="Played when the caller presses an unsupported key."
          />

        </div>

        {/* ----------------------------------------
            Timeout
        ---------------------------------------- */}

        <div>

          <label className="mb-2 block text-sm font-medium">
            Timeout prompt
          </label>

          <Textarea
            value={
              menu.timeoutPrompt
            }

            onChange={
              event =>
                updateMenu(
                  "timeoutPrompt",
                  event.target
                    .value
                )
            }

            placeholder="Played when no keypad input is received."
          />

        </div>

        {/* ----------------------------------------
            Maximum Attempts Fallback
        ---------------------------------------- */}

        <div>

          <label className="mb-2 block text-sm font-medium">
            Maximum-attempt fallback
          </label>

          <Textarea
            value={
              menu.exhaustedPrompt
            }

            onChange={
              event =>
                updateMenu(
                  "exhaustedPrompt",
                  event.target
                    .value
                )
            }

            placeholder="Played after the maximum number of failed keypad attempts."
          />

          <p className="mt-1 text-xs text-muted-foreground">
            After this prompt, the caller can continue through the conversational voice runtime.
          </p>

        </div>

        {/* ----------------------------------------
            Max Attempts
        ---------------------------------------- */}

        <div>

          <label className="mb-2 block text-sm font-medium">
            Maximum attempts
          </label>

          <Input
            type="number"

            min={
              1
            }

            max={
              5
            }

            value={
              menu.maxAttempts
            }

            onChange={
              event => {
                const parsed =
                  Number(
                    event.target
                      .value
                  );

                const value =
                  Number.isInteger(
                    parsed
                  )
                    ? Math.min(
                        5,
                        Math.max(
                          1,
                          parsed
                        )
                      )
                    : 3;

                updateMenu(
                  "maxAttempts",
                  value
                );
              }
            }
          />

          <p className="mt-1 text-xs text-muted-foreground">
            Allowed range: 1–5 attempts.
          </p>

        </div>

        <div>
          <label className="mb-2 block text-sm font-medium">Entry timeout (seconds)</label>
          <Input type="number" min={1} max={60} value={menu.timeoutSeconds ?? 8} onChange={event => updateMenu("timeoutSeconds", Math.min(60, Math.max(1, Number(event.target.value) || 8)))} />
          <p className="mt-1 text-xs text-muted-foreground">For staged Plivo entry, no selection falls through to realtime AI after this timeout.</p>
        </div>

        {/* ----------------------------------------
            Options
        ---------------------------------------- */}

        <div className="border-t pt-5">

          <div className="mb-4 flex items-center justify-between">

            <div>

              <h4 className="font-medium">
                Keypad options
              </h4>

              <p className="text-xs text-muted-foreground">
                Each digit maps to one semantic action.
              </p>

            </div>

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={
                addOption
              }
            >
              Add option
            </Button>

          </div>

          <div className="space-y-4">

            {menu.options.map(
              (
                option,
                index
              ) => (
                <div
                  key={
                    `${index}-${option.digit}-${option.action}`
                  }

                  className="space-y-3 rounded-lg border p-3"
                >

                  {/* --------------------------------
                      Digit + Action
                  -------------------------------- */}

                  <div className="flex gap-2">

                    <div className="w-20">

                      <label className="mb-1 block text-xs font-medium">
                        Digit
                      </label>

                      <Input
                        maxLength={
                          1
                        }

                        value={
                          option.digit
                        }

                        onChange={
                          event =>
                            updateOption(
                              index,
                              {
                                digit:
                                  normalizeDigit(
                                    event.target
                                      .value
                                  ),
                              }
                            )
                        }

                        placeholder="1"
                      />

                    </div>

                    <div className="flex-1">

                      <label className="mb-1 block text-xs font-medium">
                        Action
                      </label>

                      <select
                        className="h-9 w-full rounded-md border bg-background px-3 text-sm"

                        value={
                          option.action
                        }

                        onChange={
                          event =>
                            updateOption(
                              index,
                              {
                                action:
                                  event.target
                                    .value as
                                    IVRRuntimeAction,
                              }
                            )
                        }
                      >

                        {actions.map(
                          action => (
                            <option
                              key={
                                action
                              }

                              value={
                                action
                              }
                            >
                              {action}
                            </option>
                          )
                        )}

                      </select>

                    </div>

                  </div>

                  {/* --------------------------------
                      Label
                  -------------------------------- */}

                  <div>

                    <label className="mb-1 block text-xs font-medium">
                      Label
                    </label>

                    <Input
                      value={
                        option.label
                      }

                      onChange={
                        event =>
                          updateOption(
                            index,
                            {
                              label:
                                event.target
                                  .value,
                            }
                          )
                      }

                      placeholder="Loan information"
                    />

                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="mb-1 block text-xs font-medium">Intent</label>
                      <Input value={option.intent ?? ""} onChange={event => updateOption(index, { intent: event.target.value })} placeholder="PERSONAL_LOAN" />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium">Target node ID</label>
                      <Input value={option.destinationNodeId ?? ""} onChange={event => updateOption(index, { destinationNodeId: event.target.value })} placeholder="personal-loan" />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium">Department</label>
                      <Input value={option.department ?? ""} onChange={event => updateOption(index, { department: event.target.value })} placeholder="Optional" />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium">Preferred language</label>
                      <select className="h-9 w-full rounded-md border bg-background px-3 text-sm" value={option.language ?? ""} onChange={event => updateOption(index, { language: (event.target.value || undefined) as IVRRuntimeMenuOption["language"] })}>
                        <option value="">No language change</option><option value="English">English</option><option value="Hindi">Hindi</option><option value="Hinglish">Hinglish</option><option value="AUTO">Auto-detect</option>
                      </select>
                    </div>
                  </div>

                  {/* --------------------------------
                      Spoken Response
                  -------------------------------- */}

                  <div>

                    <label className="mb-1 block text-xs font-medium">
                      Spoken response
                    </label>

                    <Textarea
                      value={
                        option.response ??
                        ""
                      }

                      onChange={
                        event =>
                          updateOption(
                            index,
                            {
                              response:
                                event.target
                                  .value,
                            }
                          )
                      }

                      placeholder="Optional acknowledgement spoken after selection."
                    />

                  </div>

                  {/* --------------------------------
                      CUSTOM Value
                  -------------------------------- */}

                  {option.action ===
                    "CUSTOM" && (
                    <div>

                      <label className="mb-1 block text-xs font-medium">
                        Custom value
                      </label>

                      <Input
                        value={
                          option.value ??
                          ""
                        }

                        onChange={
                          event =>
                            updateOption(
                              index,
                              {
                                value:
                                  event.target
                                    .value,
                              }
                            )
                        }

                        placeholder="Custom semantic value"
                      />

                      <p className="mt-1 text-xs text-muted-foreground">
                        CUSTOM actions require a value before the flow can be published.
                      </p>

                    </div>
                  )}

                  {/* --------------------------------
                      Remove
                  -------------------------------- */}

                  <div className="flex justify-end">

                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={
                        () =>
                          removeOption(
                            index
                          )
                      }
                    >
                      Remove
                    </Button>

                  </div>

                </div>
              )
            )}

            {menu.options.length ===
              0 && (
              <div className="rounded-lg border border-dashed p-4 text-center">

                <p className="text-sm text-muted-foreground">
                  No keypad options configured.
                </p>

                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="mt-3"
                  onClick={
                    addOption
                  }
                >
                  Add first option
                </Button>

              </div>
            )}

          </div>

        </div>

      </div>

    </aside>
  );
}
