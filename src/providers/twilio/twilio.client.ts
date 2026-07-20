import twilio from "twilio";

import {
  twilioConfig,
  validateTwilioConfig,
} from "./twilio.config";

validateTwilioConfig();

export const twilioClient =
  twilio(

    twilioConfig.accountSid,

    twilioConfig.authToken

  );