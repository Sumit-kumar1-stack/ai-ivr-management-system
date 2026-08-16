export type CampaignPurpose =
  | "GENERAL"
  | "REMINDER"
  | "CALLBACK"
  | "FOLLOW_UP";

export interface CampaignDTO {
  id:
    string;

  name:
    string;

  description?:
    string;

  language:
    string;

  voice:
    string;

  prompt?:
    string;

  purpose:
    CampaignPurpose;

  status:
    string;

  scheduledAt?:
    string;

  createdAt:
    string;

  contactCount:
    number;
}