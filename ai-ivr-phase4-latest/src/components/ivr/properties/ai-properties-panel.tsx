"use client";

import type { IVRNode, IVRNodeData } from "../types";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

import AIPromptEditor from "./ai-prompt-editor";
import VoiceSettings from "./voice-settings";
import LLMParameters from "./llm-parameters";
import AIKnowledge from "./ai-knowledge";

interface Props {
  node: IVRNode;
  onChange: <K extends keyof IVRNodeData>(
    field: K,
    value: IVRNodeData[K]
  ) => void;
}

export default function AIPropertiesPanel({
  node,
  onChange,
}: Props) {
  if (!node) return null;

  const isAI =
    node.data.nodeKind === "AI";

  const isAction =
    node.data.nodeKind === "ACTION";

  const isCondition =
    node.data.nodeKind === "CONDITION";

  return (
    <div className="w-96 border-l bg-white p-6 overflow-y-auto">
      <h2 className="mb-6 text-xl font-bold">
        {isAI
          ? "AI Node"
          : isAction
            ? "Action Node"
            : isCondition
              ? "Condition Node"
              : "Flow Node"}
      </h2>

      <div className="space-y-6">
        <div>
          <label className="text-sm font-medium">
            Node Name
          </label>

          <Input
            value={node.data.label ?? ""}
            onChange={(e) =>
              onChange(
                "label",
                e.target.value
              )
            }
            />
        </div>

        <div>
          <label className="text-sm font-medium">
            Description
          </label>

          <Input
            value={node.data.description ?? ""}
            onChange={(e) =>
              onChange(
                "description",
                e.target.value
              )
            }
            placeholder="Describe what this node does"
          />
        </div>

        {(isAI || isAction || isCondition) && (
          <div>
            <label className="text-sm font-medium">
              {isCondition
                ? "Condition Expression"
                : isAction
                  ? "Action Code"
                  : "Prompt"}
            </label>

            {isAI ? (
              <AIPromptEditor
                value={node.data.prompt ?? ""}
                onChange={(value) =>
                  onChange(
                    "prompt",
                    value
                  )
                }
              />
            ) : (
            <Input
              value={
                  isAction
                    ? node.data.actionCode ?? ""
                    : node.data.conditionExpression ?? ""
                }
                onChange={(e) =>
                  isAction
                    ? onChange(
                        "actionCode",
                        e.target.value
                      )
                    : onChange(
                        "conditionExpression",
                        e.target.value
                      )
                }
                placeholder={
                  isAction
                    ? "SEND_INFORMATION"
                    : "customer.intent == 'INTERESTED'"
                }
              />
            )}
          </div>
        )}

        {isAI && (
          <>
            <VoiceSettings
              node={node}
              onChange={onChange}
            />

            <LLMParameters
              node={node}
              onChange={onChange}
            />

            <AIKnowledge
              node={node}
              onChange={onChange}
            />
          </>
        )}

        <Button className="w-full">
          Save
        </Button>
      </div>
    </div>
  );
}
