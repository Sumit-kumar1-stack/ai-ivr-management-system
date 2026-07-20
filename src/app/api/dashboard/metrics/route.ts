import { success } from "@/lib/api-response";
import { asyncHandler } from "@/lib/async-handler";

export const GET = asyncHandler(

  async ()=>{

    return success({

      averageLatency:0,

      averageThinkingTime:0,

      averageSpeakingTime:0,

      averageCallDuration:0,

      bargeIns:0

    });

  }

);