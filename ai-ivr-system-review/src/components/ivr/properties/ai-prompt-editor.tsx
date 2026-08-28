"use client";

import { Textarea } from "@/components/ui/textarea";

import PromptVariables from "./prompt-variables";
import PromptTips from "./prompt-tips";
import TokenCounter from "./token-counter";

interface Props {
  value: string;
  onChange: (value: string) => void;
}

export default function AIPromptEditor({
  value,
  onChange,
}: Props) {
  return (
    <div className="space-y-5">

      <div>

        <label className="font-medium">
          System Prompt
        </label>

        <Textarea
          rows={10}
          value={value}
onChange={(
  e: React.ChangeEvent<HTMLTextAreaElement>
) =>
  onChange(e.target.value)
}
          placeholder="You are an AI assistant..."
        />

      </div>

      <PromptVariables />

      <PromptTips />

      <TokenCounter prompt={value} />

    </div>
  );
}