import { z } from "zod";

export const CallWebhookSchema =
  z.object({
    providerCallId: z.string(),

    status: z.string(),

    duration: z.number().optional(),
  });