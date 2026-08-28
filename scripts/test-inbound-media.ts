import {
  loadEnvConfig,
} from "@next/env";

import twilio from "twilio";

import {
  WebSocket,
} from "ws";

//--------------------------------------------------
// Load Environment
//--------------------------------------------------

loadEnvConfig(
  process.cwd()
);

//--------------------------------------------------
// Import Application Services After Environment
//--------------------------------------------------

async function run():
  Promise<void> {
  const {
    createOrGetInboundCall,
  } =
    await import(
      "@/services/calls/inbound-call.service"
    );

  const {
    resolveActiveInboundConfiguration,
  } =
    await import(
      "@/services/calls/inbound-number.service"
    );

  //------------------------------------------------
  // Validate Environment
  //------------------------------------------------

  const authToken =
    process.env
      .TWILIO_AUTH_TOKEN
      ?.trim();

  const mediaPublicUrl =
    process.env
      .TWILIO_MEDIA_PUBLIC_URL
      ?.trim()
      .replace(
        /\/+$/,
        ""
      );

  const mediaPort =
    Number(
      process.env
        .TWILIO_MEDIA_PORT ??
      "3001"
    );

  if (
    !authToken
  ) {
    throw new Error(
      "TWILIO_AUTH_TOKEN is missing"
    );
  }

  if (
    !mediaPublicUrl
  ) {
    throw new Error(
      "TWILIO_MEDIA_PUBLIC_URL is missing"
    );
  }

  if (
    !Number.isInteger(
      mediaPort
    )
  ) {
    throw new Error(
      "TWILIO_MEDIA_PORT is invalid"
    );
  }

  //------------------------------------------------
  // Generate Test Identifiers
  //------------------------------------------------

  const suffix =
    Date.now()
      .toString();

  const providerCallId =
    `CA_TEST_${suffix}`;

  const streamSid =
    `MZ_TEST_${suffix}`;

  const callerNumber =
    `+919999${suffix.slice(
      -6
    )}`;

  const receivingNumber =
    process.env
      .TWILIO_PHONE_NUMBER
      ?.trim() ||
    "+15005550006";

  //------------------------------------------------
  // Create Internal Inbound Call
  //------------------------------------------------

  const inboundConfiguration =
    await resolveActiveInboundConfiguration({
      provider: "TWILIO",
      calledNumber: receivingNumber,
    });

  if (!inboundConfiguration.configured) {
    throw new Error(
      `No eligible inbound configuration for the test number (${inboundConfiguration.reason})`
    );
  }

  console.log(
    "Creating simulated inbound call..."
  );

 const inboundCall =
  await createOrGetInboundCall({
    providerCallId,

    callerNumber,

    calledNumber:
      receivingNumber,

    language:
      inboundConfiguration.configuration.defaultLanguage,

    tenantId:
      inboundConfiguration.configuration.tenantId,

    inboundProfileId:
      inboundConfiguration.configuration.inboundProfileId,
  });

  console.log(
  "Inbound call ready:",
  {
    callId:
      inboundCall.callId,

    contactId:
      inboundCall.contactId,

    campaignId:
      inboundCall.campaignId,

    created:
      inboundCall.created,

    configuredLanguage:
      "English",
  }
);

  //------------------------------------------------
  // Build Signed WebSocket Request
  //------------------------------------------------

  const validationUrl =
    toWebSocketUrl(
      mediaPublicUrl,
      "/api/twilio/stream"
    );

  const localWebSocketUrl =
    `ws://localhost:${mediaPort}/api/twilio/stream`;

  const signature =
    twilio.getExpectedTwilioSignature(
      authToken,
      validationUrl,
      {}
    );
    console.log(
  "WebSocket signature details:",
  {
    validationUrl,

    mediaPublicUrl,

    signaturePresent:
      Boolean(
        signature
      ),
  }
);

  console.log(
    "Connecting to media server...",
    {
      localWebSocketUrl,

      validationOriginConfigured:
        true,
    }
  );

  //------------------------------------------------
  // Connect To Local Media Server
  //------------------------------------------------

  const socket =
    new WebSocket(
      localWebSocketUrl,
      {
        headers: {
          "x-twilio-signature":
            signature,
        },
      }
    );

  const timeout =
    setTimeout(
      () => {
        console.error(
          "Test timed out"
        );

        socket.terminate();

        process.exitCode =
          1;
      },
      30_000
    );

  socket.on(
    "open",
    async () => {
      console.log(
        "Signed WebSocket connected"
      );

      //--------------------------------------------
      // Twilio Connected Event
      //--------------------------------------------

      socket.send(
        JSON.stringify({
          event:
            "connected",

          protocol:
            "Call",

          version:
            "1.0.0",
        })
      );

      //--------------------------------------------
      // Twilio Start Event
      //--------------------------------------------

      socket.send(
        JSON.stringify({
          event:
            "start",

          sequenceNumber:
            "1",

          streamSid,

          start: {
            streamSid,

            callSid:
              providerCallId,

            tracks: [
              "inbound",
            ],

            mediaFormat: {
              encoding:
                "audio/x-mulaw",

              sampleRate:
                8000,

              channels:
                1,
            },

            customParameters: {
              callId:
                inboundCall.callId,

              twilioCallSid:
                providerCallId,

              direction:
                "INBOUND",
            },
          },
        })
      );

      console.log(
        "Start event sent"
      );

      /*
       * Give the application time to:
       * - validate the database call;
       * - create the audio session;
       * - connect STT;
       * - generate and queue the greeting.
       */
      await wait(
        5_000
      );

      //--------------------------------------------
      // Send Silent μ-law Frames
      //--------------------------------------------

      const silenceFrame =
        Buffer.alloc(
          160,
          0xff
        );

      for (
        let index =
          0;
        index <
          25;
        index +=
          1
      ) {
        socket.send(
          JSON.stringify({
            event:
              "media",

            sequenceNumber:
              String(
                index +
                2
              ),

            streamSid,

            media: {
              track:
                "inbound",

              chunk:
                String(
                  index +
                  1
                ),

              timestamp:
                String(
                  index *
                  20
                ),

              payload:
                silenceFrame.toString(
                  "base64"
                ),
            },
          })
        );

        await wait(
          20
        );
      }

      console.log(
        "Test media frames sent"
      );

      await wait(
        2_000
      );

      //--------------------------------------------
      // Twilio Stop Event
      //--------------------------------------------

      socket.send(
        JSON.stringify({
          event:
            "stop",

          sequenceNumber:
            "100",

          streamSid,

          stop: {
            callSid:
              providerCallId,

            accountSid:
              "AC_TEST",
          },
        })
      );

      console.log(
        "Stop event sent"
      );

      await wait(
        1_000
      );

      //------------------------------------------------
// Simulate Twilio Completed Status Callback
//------------------------------------------------

const webPublicUrl =
  (
    process.env
      .TWILIO_PUBLIC_BASE_URL ??
    process.env
      .APP_URL
  )
    ?.trim()
    .replace(
      /\/+$/,
      ""
    );

if (
  !webPublicUrl
) {
  throw new Error(
    "TWILIO_PUBLIC_BASE_URL or APP_URL is missing"
  );
}

const statusCallbackUrl =
  new URL(
    `/api/twilio/status?callId=${encodeURIComponent(
      inboundCall.callId
    )}`,
    `${webPublicUrl}/`
  ).toString();

const statusParams = {
  CallSid:
    providerCallId,

  CallStatus:
    "completed",

  CallDuration:
    "8",
};

const statusSignature =
  twilio.getExpectedTwilioSignature(
    authToken,
    statusCallbackUrl,
    statusParams
  );

console.log(
  "Sending signed completed callback..."
);

const statusBody =
  new URLSearchParams(
    statusParams
  );

const statusResponse =
  await fetch(
    statusCallbackUrl,
    {
      method:
        "POST",

      headers: {
        "content-type":
          "application/x-www-form-urlencoded",

        "x-twilio-signature":
          statusSignature,
      },

      body:
        statusBody.toString(),
    }
  );

const statusResult =
  await statusResponse.json();

console.log(
  "Completed callback result:",
  {
    status:
      statusResponse.status,
    success: statusResult?.success === true,
  }
);

if (
  !statusResponse.ok
) {
  throw new Error(
    `Completed callback failed with HTTP ${statusResponse.status}`
  );
}

await wait(
  2_000
);

      socket.close(
        1000,
        "Simulation completed"
      );
    }
  );

  socket.on(
    "close",
    (
      code,
      reason
    ) => {
      clearTimeout(
        timeout
      );

      console.log(
        "Simulation completed",
        {
          code,

          reason:
            reason.toString(),
        }
      );
    }
  );

  socket.on(
    "error",
    error => {
      clearTimeout(
        timeout
      );

      console.error(
        "Simulation failed:",
        error
      );

      process.exitCode =
        1;
    }
  );
}

//--------------------------------------------------
// Convert Public URL To WebSocket URL
//--------------------------------------------------

function toWebSocketUrl(
  baseUrl: string,
  pathname: string
): string {
  const url =
    new URL(
      pathname,
      `${baseUrl}/`
    );

  if (
    url.protocol ===
    "https:"
  ) {
    url.protocol =
      "wss:";
  } else if (
    url.protocol ===
    "http:"
  ) {
    url.protocol =
      "ws:";
  }

  return url.toString();
}

//--------------------------------------------------
// Delay
//--------------------------------------------------

function wait(
  milliseconds: number
): Promise<void> {
  return new Promise(
    resolve => {
      setTimeout(
        resolve,
        milliseconds
      );
    }
  );
}

//--------------------------------------------------
// Execute
//--------------------------------------------------

run().catch(
  error => {
    console.error(
      "Inbound media test failed:",
      error
    );

    process.exitCode =
      1;
  }
);
