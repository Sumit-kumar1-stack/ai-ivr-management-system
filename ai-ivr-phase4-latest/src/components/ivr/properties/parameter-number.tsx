"use client";

import { Input } from "@/components/ui/input";

interface Props {
  label: string;
  value: number;
  onChange: (value: number) => void;
}

export default function ParameterNumber({
  label,
  value,
  onChange,
}: Props) {
  return (
    <div>

      <label className="text-sm font-medium">

        {label}

      </label>

      <Input
        type="number"
        value={value}
        onChange={(e) =>
          onChange(Number(e.target.value))
        }
      />

    </div>
  );
}