"use client";

import Transcript from "./transcript";

import Waveform from "./waveform";

import ThinkingAnimation from "./thinking-animation";

import StatusBadge from "./status-badge";

import CallDuration from "./call-duration";

import {

ActiveCall

}

from "@/store/dashboard.store";

export default function ConversationCard({
  call,
}:{
  call:ActiveCall
}){
  return(
    <div className="rounded-xl border border-slate-200/80 bg-slate-50/50 p-5 shadow-sm">
      <div className="flex justify-between items-start">
        <div>
          <div className="font-semibold text-slate-800 text-sm">
            {call.phone}
          </div>
          <div className="text-xs text-slate-400 mt-0.5">
            <CallDuration
              startedAt={call.startedAt}
            />
          </div>
        </div>

        <StatusBadge
          status={call.status}
        />
      </div>

      <div className="mt-4">
        {call.status==="AI Thinking"&&
          <ThinkingAnimation/>
        }
        {call.status==="AI Speaking"&&
          <Waveform/>
        }
      </div>

      <div className="mt-5">
        <Transcript
          callId={call.id}
        />
      </div>
    </div>
  );
}