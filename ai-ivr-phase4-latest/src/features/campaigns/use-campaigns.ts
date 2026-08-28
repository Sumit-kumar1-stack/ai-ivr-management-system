"use client";

import {
  useQuery,
} from "@tanstack/react-query";

import {
  api,
} from "@/lib/axios";

import type {
  CampaignDTO,
} from "./campaign.types";

export interface CampaignDetailsDTO
  extends CampaignDTO {
  contacts: Array<{
    id: string;
    campaignId: string;
    contactId: string;
    createdAt: string;
    contact: {
      id: string;
      fullName: string;
      phone: string;
      email: string | null;
      company: string | null;
      language: string;
      status: string;
      notes: string | null;
      createdAt: string;
      updatedAt: string;
    };
  }>;

  runs: Array<{
    id: string;
    campaignId: string;
    status: string;
    total: number;
    processed: number;
    successful: number;
    failed: number;
    startedAt: string | null;
    completedAt: string | null;
    createdAt: string;
    updatedAt: string;
  }>;

  calls: Array<{
    id: string;
    status: string;
    createdAt: string;
    contact: {
      id: string;
      fullName: string;
      phone: string;
    } | null;
  }>;
}

interface CampaignsResponse {
  success: boolean;
  message: string;
  data: CampaignDTO[];
}

interface CampaignResponse {
  success: boolean;
  message: string;
  data: CampaignDetailsDTO;
}

export function useCampaigns() {
  return useQuery({
    queryKey: [
      "campaigns",
    ],

    queryFn:
      async (): Promise<CampaignDTO[]> => {
        const {
          data,
        } =
          await api.get<CampaignsResponse>(
            "/campaigns"
          );

        return data.data;
      },

    staleTime:
      15_000,
  });
}

export function useCampaign(
  campaignId: string
) {
  return useQuery({
    queryKey: [
      "campaign",
      campaignId,
    ],

    queryFn:
      async (): Promise<CampaignDetailsDTO> => {
        const {
          data,
        } =
          await api.get<CampaignResponse>(
            `/campaigns/${campaignId}`
          );

        return data.data;
      },

    enabled:
      Boolean(
        campaignId
      ),

    staleTime:
      10_000,
  });
}