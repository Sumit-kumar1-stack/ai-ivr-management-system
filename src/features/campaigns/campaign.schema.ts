import {
  z,
} from "zod";

//--------------------------------------------------
// Purpose
//--------------------------------------------------

export const OutboundCampaignPurposeSchema =
  z.enum([
    "GENERAL",
    "REMINDER",
    "CALLBACK",
    "FOLLOW_UP",
  ]);

//--------------------------------------------------
// Create Campaign
//--------------------------------------------------

export const CreateCampaignSchema =
  z.object({
    name:
      z
        .string()
        .trim()
        .min(
          3,
          "Campaign name must be at least 3 characters"
        )
        .max(
          120,
          "Campaign name is too long"
        ),

    description:
      z
        .string()
        .trim()
        .max(
          1000,
          "Campaign description is too long"
        )
        .optional()
        .nullable(),

    language:
      z
        .string()
        .trim()
        .min(
          2,
          "Language is required"
        )
        .max(
          50,
          "Language value is too long"
        )
        .default(
          "English"
        ),

    voice:
      z
        .string()
        .trim()
        .min(
          1,
          "Voice is required"
        )
        .max(
          100,
          "Voice value is too long"
        )
        .default(
          "Female"
        ),

    prompt:
      z
        .string()
        .trim()
        .max(
          5000,
          "Campaign prompt is too long"
        )
        .optional()
        .nullable(),

    purpose:
      OutboundCampaignPurposeSchema
        .default(
          "GENERAL"
        ),

    scheduledAt:
      z
        .union([
          z
            .string()
            .datetime(),

          z.date(),
        ])
        .optional()
        .nullable()
        .transform(
          value => {
            if (
              !value
            ) {
              return null;
            }

            if (
              value instanceof
              Date
            ) {
              return value;
            }

            return new Date(
              value
            );
          }
        ),
  });

//--------------------------------------------------
// Update Campaign
//--------------------------------------------------

export const UpdateCampaignSchema =
  CreateCampaignSchema
    .partial();

//--------------------------------------------------
// Types
//--------------------------------------------------

export type CreateCampaignInput =
  z.infer<
    typeof CreateCampaignSchema
  >;

export type UpdateCampaignInput =
  z.infer<
    typeof UpdateCampaignSchema
  >;

export type OutboundCampaignPurpose =
  z.infer<
    typeof OutboundCampaignPurposeSchema
  >;