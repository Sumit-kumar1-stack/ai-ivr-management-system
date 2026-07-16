import twilio from "twilio";

const client =
  twilio(

    process.env.TWILIO_ACCOUNT_SID!,

    process.env.TWILIO_AUTH_TOKEN!

  );

export class TwilioStreamService {

  static async speak(

    callSid: string,

    text: string

  ) {

    await client.calls(callSid)

      .update({

        twiml:

          `<Response>

              <Say voice="Polly.Joanna">

                ${text}

              </Say>

            </Response>`

      });

  }

}