"use client";

import { useLiveCall } from "@/hooks/useLiveCall";

interface Props {

  callId: string;

}

export default function LiveCallCard({

  callId,

}: Props) {

  const live = useLiveCall(callId);

  return (

    <div className="rounded-xl border bg-white p-6 space-y-5">

      <h2 className="text-xl font-bold">

        Live Call

      </h2>

      <div>

        <strong>State</strong>

        <div>{live.state}</div>

      </div>

      <div>

        <strong>Customer</strong>

        <div className="text-gray-700">

          {live.transcript || "-"}

        </div>

      </div>

      <div>

        <strong>Assistant</strong>

        <div className="text-blue-600">

          {live.assistant || "-"}

        </div>

      </div>

      {live.completed && (

        <div className="text-green-600 font-semibold">

          Call Completed

        </div>

      )}

    </div>

  );

}