import { z } from "zod";

export const CreateCallEventSchema = z.object({
  callId: z.string(),

  message: z.string().optional(),

  metadata: z
    .record(
      z.string(),
      z.unknown()
    )
    .optional(),
});