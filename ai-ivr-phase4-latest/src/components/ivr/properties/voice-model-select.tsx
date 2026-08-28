"use client";

interface Props {
  provider: string;
  value: string;
  onChange: (value: string) => void;
}

const models: Record<string, string[]> = {
  OpenAI: [
    "alloy",
    "ash",
    "ballad",
    "coral",
    "echo",
    "sage",
    "shimmer",
    "verse",
  ],

  ElevenLabs: [
    "Rachel",
    "Bella",
    "Josh",
    "Adam",
  ],

  Azure: [
    "en-US-JennyNeural",
    "en-US-GuyNeural",
  ],

  Google: [
    "en-US-Standard-A",
    "en-US-Standard-B",
  ],
};

export default function VoiceModelSelect({
  provider,
  value,
  onChange,
}: Props) {
  return (
    <div>

      <label className="mb-1 block text-sm font-medium">
        Voice
      </label>

      <select
        className="w-full rounded-md border p-2"
        value={value}
        onChange={(e) =>
          onChange(e.target.value)
        }
      >
        {(models[provider] ?? []).map((voice) => (
          <option
            key={voice}
            value={voice}
          >
            {voice}
          </option>
        ))}
      </select>

    </div>
  );
}