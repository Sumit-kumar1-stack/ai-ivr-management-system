import twilio from "twilio";

import {
  getTwilioConfig,
} from "./twilio.config";

const config =
  getTwilioConfig();

export const twilioClient =
  twilio(
    config.accountSid,
    config.authToken
  );