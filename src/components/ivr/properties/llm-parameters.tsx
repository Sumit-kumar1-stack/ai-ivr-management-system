"use client";

import ParameterSlider from "./parameter-slider";
import ParameterNumber from "./parameter-number";
import ParameterHelp from "./parameter-help";

interface Props {
  node: any;
  onChange: (field: string, value: any) => void;
}

export default function LLMParameters({
  node,
  onChange,
}: Props) {
  return (
    <div className="space-y-6">

      <h3 className="text-lg font-semibold">

        LLM Parameters

      </h3>

      <ParameterSlider
        label="Temperature"
        value={node.data.temperature ?? 0.7}
        min={0}
        max={2}
        step={0.1}
        onChange={(v) =>
          onChange("temperature", v)
        }
      />

      <ParameterSlider
        label="Top P"
        value={node.data.topP ?? 1}
        min={0}
        max={1}
        step={0.05}
        onChange={(v) =>
          onChange("topP", v)
        }
      />

      <ParameterNumber
        label="Max Tokens"
        value={node.data.maxTokens ?? 1024}
        onChange={(v) =>
          onChange("maxTokens", v)
        }
      />

      <ParameterSlider
        label="Presence Penalty"
        value={node.data.presencePenalty ?? 0}
        min={-2}
        max={2}
        step={0.1}
        onChange={(v) =>
          onChange("presencePenalty", v)
        }
      />

      <ParameterSlider
        label="Frequency Penalty"
        value={node.data.frequencyPenalty ?? 0}
        min={-2}
        max={2}
        step={0.1}
        onChange={(v) =>
          onChange("frequencyPenalty", v)
        }
      />

      <ParameterHelp />

    </div>
  );
}