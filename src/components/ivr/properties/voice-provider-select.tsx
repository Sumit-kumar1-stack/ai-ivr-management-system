"use client";

interface Props {
  value: string;
  onChange: (value: string) => void;
}

const providers = [
  "OpenAI",
  "ElevenLabs",
  "Azure",
  "Google",
];

export default function VoiceProviderSelect({
  value,
  onChange,
}: Props) {
  return (
    <div>

      <label className="mb-1 block text-sm font-medium">
        Provider
      </label>

      <select
        className="w-full rounded-md border p-2"
        value={value}
        onChange={(e) =>
          onChange(e.target.value)
        }
      >
        {providers.map((provider) => (
          <option
            key={provider}
            value={provider}
          >
            {provider}
          </option>
        ))}
      </select>

    </div>
  );
}