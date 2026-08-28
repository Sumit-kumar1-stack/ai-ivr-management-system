"use client";

import {
  Input,
} from "@/components/ui/input";

import type {
  IVREdge,
  IVREdgeData,
  IVRTransitionTrigger,
} from "./types";

interface Props {
  edge:
    IVREdge;

  onChange: (
    data:
      IVREdgeData
  ) => void;
}

const triggers:
  IVRTransitionTrigger[] =
  [
    "DEFAULT",
    "DTMF",
    "VOICE_INTENT",
    "ACTION_SUCCESS",
    "ACTION_FAILURE",
    "TIMEOUT",
    "HUMAN_TRANSFER",
  ];

export default function EdgePropertiesPanel({
  edge,
  onChange,
}: Props) {
  const data =
    edge.data ?? {};

  return (
    <aside className="w-[360px] overflow-y-auto border-l bg-white p-5">
      <div className="mb-5">
        <h3 className="text-lg font-semibold">
          Transition
        </h3>

        <p className="mt-1 text-sm text-muted-foreground">
          Configure when this edge should be followed.
        </p>
      </div>

      <div className="space-y-5">
        <div>
          <label className="mb-2 block text-sm font-medium">
            Trigger
          </label>

          <select
            className="h-9 w-full rounded-md border bg-background px-3 text-sm"
            value={data.trigger ?? "DEFAULT"}
            onChange={event =>
              onChange({
                ...data,
                trigger:
                  event.target.value as IVRTransitionTrigger,
              })
            }
          >
            {triggers.map(trigger => (
              <option
                key={trigger}
                value={trigger}
              >
                {trigger}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium">
            Value
          </label>

          <Input
            value={data.value ?? ""}
            onChange={event =>
              onChange({
                ...data,
                value: event.target.value,
              })
            }
            placeholder="INTERESTED, 1, SEND_INFORMATION"
          />
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium">
            Label
          </label>

          <Input
            value={data.label ?? ""}
            onChange={event =>
              onChange({
                ...data,
                label: event.target.value,
              })
            }
            placeholder="Interested"
          />
        </div>
      </div>
    </aside>
  );
}
