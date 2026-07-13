"use client";

import {
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";

import { api } from "@/lib/axios";
import { toast } from "sonner";

export function useAssignContacts() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      campaignId,
      contactIds,
    }: {
      campaignId: string;
      contactIds: string[];
    }) => {
      const { data } = await api.post(
        `/campaigns/${campaignId}/contacts`,
        {
          contactIds,
        }
      );

      return data;
    },

    onSuccess: (_, variables) => {
      toast.success(
        "Contacts assigned successfully"
      );

      queryClient.invalidateQueries({
        queryKey: [
          "campaign-contacts",
          variables.campaignId,
        ],
      });

      queryClient.invalidateQueries({
        queryKey: [
          "campaigns",
        ],
      });

      queryClient.invalidateQueries({
        queryKey: [
          "campaign-stats",
          variables.campaignId,
        ],

        
      });
    },

onError(error:any){

toast.error(error.message);

},
  });
}