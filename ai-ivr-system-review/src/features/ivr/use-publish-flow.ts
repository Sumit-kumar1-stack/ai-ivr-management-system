"use client";

import {
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";

import {
  toast,
} from "sonner";

import {
  api,
} from "@/lib/axios";

//--------------------------------------------------
// Publish Flow
//--------------------------------------------------

export function usePublishFlow() {
  const queryClient =
    useQueryClient();

  return useMutation({
    //------------------------------------------------
    // Request
    //------------------------------------------------

    mutationFn:
      async (
        flowId: string
      ) => {
        const {
          data,
        } =
          await api.post(
            `/ivr-flows/${flowId}/publish`
          );

        return data.data;
      },

    //------------------------------------------------
    // Success
    //------------------------------------------------

    onSuccess(
      flow
    ) {
      toast.success(
        "IVR flow published"
      );

      //------------------------------------------------
      // Refresh Flow List
      //------------------------------------------------

      queryClient.invalidateQueries({
        queryKey: [
          "ivr-flows",
        ],
      });

      //------------------------------------------------
      // Refresh Active Flow
      //------------------------------------------------

      if (
        flow?.id
      ) {
        queryClient.invalidateQueries({
          queryKey: [
            "ivr-flow",
            flow.id,
          ],
        });
      }
    },

    //------------------------------------------------
    // Error
    //------------------------------------------------

    onError(
      error
    ) {
      console.error(
        "IVR flow publish failed",
        error
      );

      toast.error(
        "Flow could not be published. Check the campaign and keypad configuration."
      );
    },
  });
}