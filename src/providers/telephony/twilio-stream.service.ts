import { Buffer } from "buffer";

import {
  twilioMediaService,
} from "./twilio-media.service";

export async function streamAudioToTwilio(

  callId: string,

  audio: Buffer

) {

  const socket =
    twilioMediaService.get(callId);

  if (!socket) {

    console.log(
      "No Twilio socket"
    );

    return;

  }

  socket.send(

    JSON.stringify({

      event: "media",

      media: {

        payload:
          audio.toString("base64"),

      },

    })

  );

}