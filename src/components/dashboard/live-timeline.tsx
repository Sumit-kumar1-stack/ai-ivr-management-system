"use client";

import {
  useDashboardStore,
} from "@/store/dashboard.store";

export default function LiveTimeline() {

  const timeline =
    useDashboardStore(
      s => s.timeline
    );

  return (

    <div className="rounded-xl border p-5">

      <h2 className="font-bold mb-4">

        Live Timeline

      </h2>

      <div className="space-y-3">

        {

          timeline.map(

            (item,index)=>(

              <div
                key={index}
                className="border-b pb-2"
              >

                <div className="font-medium">

                  {item.event}

                </div>

                <div className="text-xs opacity-60">

                  {new Date(
                    item.timestamp
                  ).toLocaleTimeString()}

                </div>

              </div>

            )

          )

        }

      </div>

    </div>

  );

}