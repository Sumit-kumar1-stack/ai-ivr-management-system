import {
  getTwilioEnvironment,
} from "@/config/env";

export interface TwilioConfig {
  accountSid: string;
  authToken: string;
  phoneNumber: string;
  publicBaseUrl: string;
  mediaPublicUrl: string;
}

export function getTwilioConfig(): TwilioConfig {
  return getTwilioEnvironment();
}

export function validateTwilioConfig(): void {
  getTwilioEnvironment();
}