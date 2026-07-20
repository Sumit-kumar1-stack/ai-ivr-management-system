export const twilioConfig = {

  accountSid:
    process.env.TWILIO_ACCOUNT_SID!,

  authToken:
    process.env.TWILIO_AUTH_TOKEN!,

  phoneNumber:
    process.env.TWILIO_PHONE_NUMBER!,

  appUrl:
    process.env.APP_URL!,

};

export function validateTwilioConfig() {

  const required = [

    "TWILIO_ACCOUNT_SID",

    "TWILIO_AUTH_TOKEN",

    "TWILIO_PHONE_NUMBER",

    "APP_URL",

  ];

  for (const key of required) {

    if (!process.env[key]) {

      throw new Error(
        `Missing environment variable: ${key}`
      );

    }

  }

}