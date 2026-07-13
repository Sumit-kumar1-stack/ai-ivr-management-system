"use client";

import { Button } from "@/components/ui/button";

interface Props {
  flows: any[];
  onSelect: (id: string) => void;
}

export default function FlowList({
  flows,
  onSelect,
}: Props) {
  return (
    <div className="space-y-2">

      {flows.map((flow) => (

        <Button
          key={flow.id}
          variant="outline"
          className="w-full justify-start"
          onClick={() => onSelect(flow.id)}
        >
          {flow.name}
        </Button>

      ))}

    </div>
  );
}