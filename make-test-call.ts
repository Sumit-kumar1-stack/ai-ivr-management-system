import twilio from "twilio";

function getRequiredEnv(
  name: string
): string {
  const value =
    process.env[name]?.trim();

  if (!value) {
    throw new Error(
      `${name} is missing in the .env file`
    );
  }

  return value;
}

const accountSid =
  getRequiredEnv(
    "TWILIO_ACCOUNT_SID"
  );

const authToken =
  getRequiredEnv(
    "TWILIO_AUTH_TOKEN"
  );

const fromNumber =
  getRequiredEnv(
    "TWILIO_PHONE_NUMBER"
  );

const toNumber =
  getRequiredEnv(
    "TEST_DESTINATION_NUMBER"
  );

const publicUrl =
  getRequiredEnv(
    "TWILIO_TEST_PUBLIC_URL"
  ).replace(
    /\/+$/,
    ""
  );

const voiceUrl =
  `${publicUrl}/api/twilio/voice-stream`;

async function makeTestCall():
  Promise<void> {

  const client =
    twilio(
      accountSid,
      authToken
    );

  const call =
    await client.calls.create({
      from:
        fromNumber,

      to:
        toNumber,

      url:
        voiceUrl,

      method:
        "POST",
    });

  console.log(
    "Test call created",
    {
      callSid:
        call.sid,

      status:
        call.status,

      from:
        fromNumber,

      to:
        toNumber,

      voiceUrl,
    }
  );
}

makeTestCall().catch(
  error => {

    console.error(
      "Test call failed",
      error
    );

    process.exit(1);

  }
);