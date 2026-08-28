import { twiml } from "twilio";

export class TwiMLService {
  static voiceResponse() {
    const response = new twiml.VoiceResponse();

    response.say(
      {
        voice: "Polly.Joanna",
        language: "en-US",
      },
      "Hello. Welcome to ABC Company. How may I help you today?"
    );

   response.gather({

input:["speech"],

speechTimeout:"auto",

speechModel:"phone_call",

enhanced:true,

action:"/api/twilio/gather",

method:"POST"

});

    response.redirect(
      {
        method: "POST",
      },
      "/api/twilio/voice"
    );

    return response.toString();
  }

  static speak(text: string) {
    const response = new twiml.VoiceResponse();

    response.say(
      {
        voice: "Polly.Joanna",
        language: "en-US",
      },
      text
    );

   response.gather({

input:["speech"],

speechTimeout:"auto",

speechModel:"phone_call",

enhanced:true,

action:"/api/twilio/gather",

method:"POST"

});

    return response.toString();
  }

  static continueConversation() {
    const response = new twiml.VoiceResponse();

    response.gather({

input:["speech"],

speechTimeout:"auto",

speechModel:"phone_call",

enhanced:true,

action:"/api/twilio/gather",

method:"POST"

});

    response.redirect("/api/twilio/voice");

    return response.toString();
  }

  static hangup(message?: string) {
    const response = new twiml.VoiceResponse();

    if (message) {
      response.say(message);
    }

    response.hangup();

    return response.toString();
  }
}