"use client";

interface Props {
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (value: number) => void;
}

export default function VoiceSlider({
  label,
  min,
  max,
  step,
  value,
  onChange,
}: Props) {
  return (
    <div>

      <div className="mb-2 flex justify-between">

        <span>{label}</span>

        <span>{value}</span>

      </div>

      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        className="w-full"
        onChange={(e) =>
          onChange(Number(e.target.value))
        }
      />

    </div>
  );
}