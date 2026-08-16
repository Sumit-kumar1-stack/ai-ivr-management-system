"use client";

import type { IVRNode, IVRNodeData } from "../types";
import VoiceProviderSelect from "./voice-provider-select";
import VoiceModelSelect from "./voice-model-select";
import VoiceSlider from "./voice-slider";
import VoicePreview from "./voice-preview";

interface Props {
  node: IVRNode;
  onChange: <K extends keyof IVRNodeData>(field: K, value: IVRNodeData[K]) => void;
}

export default function VoiceSettings({
  node,
  onChange,
}: Props) {
  return (
    <div className="space-y-6">

      <h3 className="text-lg font-semibold">
        Voice Configuration
      </h3>

      <VoiceProviderSelect
        value={node.data.provider ?? "OpenAI"}
        onChange={(v) =>
          onChange("provider", v)
        }
      />

      <VoiceModelSelect
        provider={node.data.provider ?? "OpenAI"}
        value={node.data.voice ?? "alloy"}
        onChange={(v) =>
          onChange("voice", v)
        }
      />

      <VoiceSlider
        label="Speed"
        min={0.5}
        max={2}
        step={0.1}
        value={node.data.speed ?? 1}
        onChange={(v) =>
          onChange("speed", v)
        }
      />

      <VoiceSlider
        label="Pitch"
        min={-10}
        max={10}
        step={1}
        value={node.data.pitch ?? 0}
        onChange={(v) =>
          onChange("pitch", v)
        }
      />

      <VoicePreview />

    </div>
  );
}