import { z } from "zod";


export const CreateCampaignSchema = z.object({

    name: z
        .string()
        .min(3, "Campaign name must be at least 3 characters"),


    description: z
        .string()
        .optional(),


    language: z
        .string()
        .default("English"),


    voice: z
        .string()
        .default("Female"),


    prompt: z
        .string()
        .optional(),


});


export type CreateCampaignInput =
    z.infer<typeof CreateCampaignSchema>;