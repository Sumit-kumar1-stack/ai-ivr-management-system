"use client";

interface Props {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
}

export default function ParameterSlider({
  label,
  value,
  min,
  max,
  step,
  onChange,
}: Props) {
  return (
    <div className="space-y-2">

      <div className="flex justify-between">

        <label className="text-sm font-medium">
          {label}
        </label>

        <span className="text-sm text-gray-500">
          {value}
        </span>

      </div>

      <input
        className="w-full"
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) =>
          onChange(Number(e.target.value))
        }
      />

    </div>
  );
}