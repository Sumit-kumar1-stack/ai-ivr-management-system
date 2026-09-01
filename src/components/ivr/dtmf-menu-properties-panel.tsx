"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

import type {
  IVRConversationalEscapeReturnBehavior,
  IVRNode,
  IVRNodeData,
  IVRPostActionMode,
  IVRRuntimeAction,
  IVRRuntimeMenuConfig,
  IVRRuntimeMenuOption,
} from "./types";

import { createDefaultRuntimeMenu } from "./default-runtime-menu";
import { useIVRBuilder } from "./ivr-builder-context";
import { NodeDestinationPicker } from "./node-properties";

//--------------------------------------------------
// Props
//--------------------------------------------------

interface Props {
  node: IVRNode;
  onChange: (
    runtimeMenu: Omit<IVRRuntimeMenuConfig, "options">,
    options: IVRRuntimeMenuOption[]
  ) => void;
  onNodeDataChange?: <K extends keyof IVRNodeData>(field: K, value: IVRNodeData[K]) => void;
}

const actions: IVRRuntimeAction[] = [
  "REQUEST_CALLBACK",
  "HUMAN_AGENT",
  "AGENT_REQUEST",
  "REPEAT_MENU",
  "CONTINUE_AI",
  "END_CALL",
  "CUSTOM",
];

//--------------------------------------------------
// Normalize DTMF Digit
//--------------------------------------------------

function normalizeDigit(value: string): string {
  const normalized = value.trim();

  if (normalized === "#" || normalized === "*") {
    return normalized;
  }

  return normalized.replace(/\D/g, "").slice(0, 1);
}

//--------------------------------------------------
// Component
//--------------------------------------------------

export default function DTMFMenuPropertiesPanel({
  node,
  onChange,
  onNodeDataChange,
}: Props) {
  const { nodes = [] } = useIVRBuilder();
  const defaultMenu = createDefaultRuntimeMenu();
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
          Menu
        </h3>

        <p className="mt-1 text-sm text-muted-foreground">
          Configure the live keypad and speech menu used by callers.
        </p>

      </div>

      <div className="space-y-5">

        <div>
          <label className="mb-2 block text-sm font-medium">Input mode</label>
          <select
            className="h-10 w-full rounded-md border bg-background px-3 text-sm"
            value={menu.inputMode ?? "BOTH"}
            onChange={event => updateMenu("inputMode", event.target.value as "DTMF" | "SPEECH" | "BOTH")}
          >
            <option value="DTMF">DTMF only</option>
            <option value="SPEECH">Speech only</option>
            <option value="BOTH">DTMF and speech</option>
          </select>
          <p className="mt-1 text-xs text-muted-foreground">Keep the spoken prompt consistent with the selected provider input.</p>
        </div>

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
          <label className="mb-2 block text-sm font-medium">Repeat prompt</label>
          <Textarea
            value={menu.repeatPrompt ?? ""}
            onChange={event => updateMenu("repeatPrompt", event.target.value)}
            placeholder="Played when the configured repeat option is selected."
          />
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium">Entry timeout (seconds)</label>
          <Input type="number" min={1} max={60} value={menu.timeoutSeconds ?? 8} onChange={event => updateMenu("timeoutSeconds", Math.min(60, Math.max(1, Number(event.target.value) || 8)))} />
          <p className="mt-1 text-xs text-muted-foreground">How long the provider waits for one menu response.</p>
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

                      placeholder="Sales"
                    />

                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="mb-1 block text-xs font-medium">Intent</label>
                      <Input value={option.intent ?? ""} onChange={event => updateOption(index, { intent: event.target.value })} placeholder="SALES" />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium">Target node ID</label>
                      <select
                        className="h-9 w-full rounded-md border bg-background px-3 text-sm"
                        value={option.destinationNodeId ?? ""}
                        onChange={event => updateOption(index, { destinationNodeId: event.target.value })}
                      >
                        <option value="">Select a node</option>
                        {nodes.map(target => (
                          <option key={target.id} value={target.id}>
                            {target.data.label || target.data.nodeKind || target.id} ({target.id})
                          </option>
                        ))}
                      </select>
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

                  <div>
                    <label className="mb-1 block text-xs font-medium">Speech aliases</label>
                    <Textarea
                      value={(option.voicePhrases ?? []).join(", ")}
                      onChange={event => updateOption(index, {
                        voicePhrases: event.target.value
                          .split(/[,\n]/)
                          .map(value => value.trim())
                          .filter(Boolean),
                      })}
                      placeholder="sales, new sales"
                    />
                    <p className="mt-1 text-xs text-muted-foreground">Comma- or line-separated phrases matched only within this menu.</p>
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

            {menu.options.length === 0 && (
              <div className="rounded-lg border border-dashed p-4 text-center">
                <p className="text-sm text-muted-foreground">
                  No keypad options configured.
                </p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="mt-3"
                  onClick={addOption}
                >
                  Add first option
                </Button>
              </div>
            )}
          </div>
        </div>

        {/* ----------------------------------------
            Conversational Escape (Phase 5)
        ---------------------------------------- */}
        <div className="space-y-3 rounded-lg border border-slate-200 bg-white p-4">
          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700">Conversational Escape</h4>
          <p className="text-xs text-slate-500">Allow callers to ask business questions directly from this menu without converting the menu into an unconstrained router.</p>

          <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
            <input
              type="checkbox"
              checked={node.data.conversationalEscape?.enabled === true}
              onChange={event => {
                const enabled = event.target.checked;
                if (!enabled) {
                  if (onNodeDataChange) {
                    onNodeDataChange("conversationalEscape", undefined);
                  }
                } else {
                  if (onNodeDataChange) {
                    onNodeDataChange("conversationalEscape", {
                      enabled: true,
                      targetNodeId: node.data.conversationalEscape?.targetNodeId ?? "",
                      prompt: node.data.conversationalEscape?.prompt ?? null,
                      returnBehavior: node.data.conversationalEscape?.returnBehavior ?? "RETURN_CONTEXT",
                    });
                  }
                }
              }}
            />
            Enable Conversational Escape
          </label>

          {node.data.conversationalEscape?.enabled && (
            <div className="mt-3 space-y-3 border-t pt-3">
              <div>
                <label className="mb-1 block text-xs font-medium">Target Assistant / Knowledge Node</label>
                <NodeDestinationPicker
                  nodes={nodes}
                  value={node.data.conversationalEscape.targetNodeId}
                  onChange={val => {
                    if (onNodeDataChange) {
                      onNodeDataChange("conversationalEscape", {
                        enabled: true,
                        ...node.data.conversationalEscape,
                        targetNodeId: val,
                      });
                    }
                  }}
                  placeholder="Select assistant / knowledge node..."
                  filterKinds={["KNOWLEDGE", "AI", "AI_CONVERSATION"]}
                  excludeNodeId={node.id}
                />
                <p className="mt-1 text-xs text-slate-500">Destination node to handle free-form questions from callers.</p>
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium">After Answering</label>
                <select
                  value={node.data.conversationalEscape.returnBehavior ?? "RETURN_CONTEXT"}
                  onChange={event => {
                    if (onNodeDataChange) {
                      onNodeDataChange("conversationalEscape", {
                        enabled: true,
                        ...node.data.conversationalEscape,
                        returnBehavior: event.target.value as IVRConversationalEscapeReturnBehavior,
                      });
                    }
                  }}
                  className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm"
                >
                  <option value="RETURN_CONTEXT">Return to this menu (Side-turn)</option>
                  <option value="STAY_CONVERSATIONAL">Stay in assistant for follow-up questions</option>
                  <option value="FOLLOW_TARGET_POST_ACTION">Follow assistant's configured next step</option>
                </select>
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium">Optional Entry Prompt</label>
                <Input
                  value={node.data.conversationalEscape.prompt ?? ""}
                  onChange={event => {
                    if (onNodeDataChange) {
                      onNodeDataChange("conversationalEscape", {
                        enabled: true,
                        ...node.data.conversationalEscape,
                        prompt: event.target.value,
                      });
                    }
                  }}
                  placeholder="e.g. Sure, let me check that for you."
                />
              </div>
            </div>
          )}
        </div>

        {/* ----------------------------------------
            Adaptive Global Navigation (Phase 1)
        ---------------------------------------- */}
        <div className="space-y-3 rounded-lg border border-slate-200 bg-white p-4">
          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700">Adaptive Global Navigation</h4>
          <p className="text-xs text-slate-500">Configure global semantic shortcuts available across menus. Current-menu options take precedence if digits or phrases conflict.</p>

          {/* HOME */}
          <div className="space-y-2 border-t pt-2">
            <label className="flex items-center gap-2 text-xs font-medium text-slate-700">
              <input
                type="checkbox"
                checked={node.data.navigation?.home?.enabled !== false && Boolean(node.data.navigation?.home)}
                onChange={event => {
                  if (onNodeDataChange) {
                    const nav = node.data.navigation ?? {};
                    const home = nav.home ?? {};
                    onNodeDataChange("navigation", { ...nav, home: { ...home, enabled: event.target.checked } });
                  }
                }}
              />
              Enable HOME Command
            </label>
            {node.data.navigation?.home?.enabled !== false && Boolean(node.data.navigation?.home) && (
              <div className="space-y-2">
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <span className="text-slate-600">Digits (comma separated)</span>
                    <Input
                      className="h-8 text-xs"
                      value={node.data.navigation?.home?.digits?.join(", ") ?? ""}
                      placeholder="0"
                      onChange={event => {
                        if (onNodeDataChange) {
                          const nav = node.data.navigation ?? {};
                          const home = nav.home ?? {};
                          const digits = event.target.value.split(",").map(s => s.trim()).filter(Boolean);
                          onNodeDataChange("navigation", { ...nav, home: { ...home, digits } });
                        }
                      }}
                    />
                  </div>
                  <div>
                    <span className="text-slate-600">Speech Phrases</span>
                    <Input
                      className="h-8 text-xs"
                      value={node.data.navigation?.home?.phrases?.join(", ") ?? ""}
                      placeholder="main menu, start over"
                      onChange={event => {
                        if (onNodeDataChange) {
                          const nav = node.data.navigation ?? {};
                          const home = nav.home ?? {};
                          const phrases = event.target.value.split(",").map(s => s.trim()).filter(Boolean);
                          onNodeDataChange("navigation", { ...nav, home: { ...home, phrases } });
                        }
                      }}
                    />
                  </div>
                </div>
                <div>
                  <span className="text-xs text-slate-600">Specific Target Node (Optional)</span>
                  <NodeDestinationPicker
                    nodes={nodes}
                    value={node.data.navigation?.home?.targetNodeId}
                    onChange={val => {
                      if (onNodeDataChange) {
                        const nav = node.data.navigation ?? {};
                        const home = nav.home ?? {};
                        onNodeDataChange("navigation", { ...nav, home: { ...home, targetNodeId: val || undefined } });
                      }
                    }}
                    placeholder="Default root menu"
                    filterKinds={["HYBRID_MENU", "DTMF_MENU", "START"]}
                    className="h-8 text-xs"
                  />
                </div>
              </div>
            )}
          </div>

          {/* BACK */}
          <div className="space-y-2 border-t pt-2">
            <label className="flex items-center gap-2 text-xs font-medium text-slate-700">
              <input
                type="checkbox"
                checked={node.data.navigation?.back?.enabled !== false && Boolean(node.data.navigation?.back)}
                onChange={event => {
                  if (onNodeDataChange) {
                    const nav = node.data.navigation ?? {};
                    const back = nav.back ?? {};
                    onNodeDataChange("navigation", { ...nav, back: { ...back, enabled: event.target.checked } });
                  }
                }}
              />
              Enable BACK Command
            </label>
            {node.data.navigation?.back?.enabled !== false && Boolean(node.data.navigation?.back) && (
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <span className="text-slate-600">Digits (comma separated)</span>
                  <Input
                    className="h-8 text-xs"
                    value={node.data.navigation?.back?.digits?.join(", ") ?? ""}
                    placeholder="*"
                    onChange={event => {
                      if (onNodeDataChange) {
                        const nav = node.data.navigation ?? {};
                        const back = nav.back ?? {};
                        const digits = event.target.value.split(",").map(s => s.trim()).filter(Boolean);
                        onNodeDataChange("navigation", { ...nav, back: { ...back, digits } });
                      }
                    }}
                  />
                </div>
                <div>
                  <span className="text-slate-600">Speech Phrases</span>
                  <Input
                    className="h-8 text-xs"
                    value={node.data.navigation?.back?.phrases?.join(", ") ?? ""}
                    placeholder="go back, previous menu"
                    onChange={event => {
                      if (onNodeDataChange) {
                        const nav = node.data.navigation ?? {};
                        const back = nav.back ?? {};
                        const phrases = event.target.value.split(",").map(s => s.trim()).filter(Boolean);
                        onNodeDataChange("navigation", { ...nav, back: { ...back, phrases } });
                      }
                    }}
                  />
                </div>
              </div>
            )}
          </div>

          {/* REPEAT */}
          <div className="space-y-2 border-t pt-2">
            <label className="flex items-center gap-2 text-xs font-medium text-slate-700">
              <input
                type="checkbox"
                checked={node.data.navigation?.repeat?.enabled !== false && Boolean(node.data.navigation?.repeat)}
                onChange={event => {
                  if (onNodeDataChange) {
                    const nav = node.data.navigation ?? {};
                    const repeat = nav.repeat ?? {};
                    onNodeDataChange("navigation", { ...nav, repeat: { ...repeat, enabled: event.target.checked } });
                  }
                }}
              />
              Enable REPEAT Command
            </label>
            {node.data.navigation?.repeat?.enabled !== false && Boolean(node.data.navigation?.repeat) && (
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <span className="text-slate-600">Digits (comma separated)</span>
                  <Input
                    className="h-8 text-xs"
                    value={node.data.navigation?.repeat?.digits?.join(", ") ?? ""}
                    placeholder="#"
                    onChange={event => {
                      if (onNodeDataChange) {
                        const nav = node.data.navigation ?? {};
                        const repeat = nav.repeat ?? {};
                        const digits = event.target.value.split(",").map(s => s.trim()).filter(Boolean);
                        onNodeDataChange("navigation", { ...nav, repeat: { ...repeat, digits } });
                      }
                    }}
                  />
                </div>
                <div>
                  <span className="text-slate-600">Speech Phrases</span>
                  <Input
                    className="h-8 text-xs"
                    value={node.data.navigation?.repeat?.phrases?.join(", ") ?? ""}
                    placeholder="repeat, repeat options"
                    onChange={event => {
                      if (onNodeDataChange) {
                        const nav = node.data.navigation ?? {};
                        const repeat = nav.repeat ?? {};
                        const phrases = event.target.value.split(",").map(s => s.trim()).filter(Boolean);
                        onNodeDataChange("navigation", { ...nav, repeat: { ...repeat, phrases } });
                      }
                    }}
                  />
                </div>
              </div>
            )}
          </div>

          {/* END */}
          <div className="space-y-2 border-t pt-2">
            <label className="flex items-center gap-2 text-xs font-medium text-slate-700">
              <input
                type="checkbox"
                checked={node.data.navigation?.end?.enabled !== false && Boolean(node.data.navigation?.end)}
                onChange={event => {
                  if (onNodeDataChange) {
                    const nav = node.data.navigation ?? {};
                    const end = nav.end ?? {};
                    onNodeDataChange("navigation", { ...nav, end: { ...end, enabled: event.target.checked } });
                  }
                }}
              />
              Enable END Command
            </label>
            {node.data.navigation?.end?.enabled !== false && Boolean(node.data.navigation?.end) && (
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <span className="text-slate-600">Digits (comma separated)</span>
                  <Input
                    className="h-8 text-xs"
                    value={node.data.navigation?.end?.digits?.join(", ") ?? ""}
                    placeholder="9"
                    onChange={event => {
                      if (onNodeDataChange) {
                        const nav = node.data.navigation ?? {};
                        const end = nav.end ?? {};
                        const digits = event.target.value.split(",").map(s => s.trim()).filter(Boolean);
                        onNodeDataChange("navigation", { ...nav, end: { ...end, digits } });
                      }
                    }}
                  />
                </div>
                <div>
                  <span className="text-slate-600">Speech Phrases</span>
                  <Input
                    className="h-8 text-xs"
                    value={node.data.navigation?.end?.phrases?.join(", ") ?? ""}
                    placeholder="goodbye, hang up, end call"
                    onChange={event => {
                      if (onNodeDataChange) {
                        const nav = node.data.navigation ?? {};
                        const end = nav.end ?? {};
                        const phrases = event.target.value.split(",").map(s => s.trim()).filter(Boolean);
                        onNodeDataChange("navigation", { ...nav, end: { ...end, phrases } });
                      }
                    }}
                  />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ----------------------------------------
            After Completion / Post-Action (Phase 2)
        ---------------------------------------- */}
        <div className="space-y-3 rounded-lg border border-slate-200 bg-white p-4">
          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700">After Completion</h4>
          <p className="text-xs text-slate-500">Configure what happens after this menu or action executes.</p>
          <div>
            <label className="mb-1 block text-xs font-medium">Post-Action Behavior</label>
            <select
              value={node.data.postAction?.mode ?? ""}
              onChange={event => {
                const mode = event.target.value as IVRPostActionMode;
                if (onNodeDataChange) {
                  if (!mode) {
                    onNodeDataChange("postAction", undefined);
                  } else {
                    onNodeDataChange("postAction", {
                      ...node.data.postAction,
                      mode,
                    });
                  }
                }
              }}
              className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm"
            >
              <option value="">Follow Graph Edges (Default)</option>
              <option value="RETURN_HOME">Return to Main Menu</option>
              <option value="RETURN_PREVIOUS">Return to Previous</option>
              <option value="STAY_CURRENT">Stay Here</option>
              <option value="ASK_NEXT_ACTION">Ask What Next</option>
              <option value="CONTINUE_TO_NODE">Continue To...</option>
              <option value="END_CALL">End Call</option>
            </select>
          </div>

          {node.data.postAction?.mode === "CONTINUE_TO_NODE" && (
            <div className="mt-3">
              <label className="mb-1 block text-xs font-medium">Destination Node</label>
              <NodeDestinationPicker
                nodes={nodes}
                value={node.data.postAction?.targetNodeId}
                onChange={val => {
                  if (onNodeDataChange) {
                    onNodeDataChange("postAction", {
                      mode: "CONTINUE_TO_NODE",
                      ...node.data.postAction,
                      targetNodeId: val,
                    });
                  }
                }}
                placeholder="Select destination node..."
                excludeNodeId={node.id}
              />
            </div>
          )}

          {node.data.postAction?.mode === "ASK_NEXT_ACTION" && (
            <div className="mt-3">
              <label className="mb-1 block text-xs font-medium">Next-Action Prompt</label>
              <Input
                value={node.data.postAction?.prompt ?? ""}
                onChange={event => {
                  if (onNodeDataChange) {
                    onNodeDataChange("postAction", {
                      mode: "ASK_NEXT_ACTION",
                      ...node.data.postAction,
                      prompt: event.target.value,
                    });
                  }
                }}
                placeholder="e.g. Would you like more information, return to main menu, or speak with an agent?"
              />
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}
