# Exotel AgentStream live test

Exotel Voice v1 and AgentStream are separate dashboard/API capabilities. Keep `TELEPHONY_PROVIDER=exotel` for every process and do not configure any Twilio credentials as a fallback.

## Required configuration

Set the Exotel call-control settings and these media settings in the deployment secret store:

```text
EXOTEL_MEDIA_PUBLIC_URL=wss://media.example.com
EXOTEL_STREAM_USERNAME=<long dedicated username>
EXOTEL_STREAM_PASSWORD=<long dedicated password>
```

`EXOTEL_MEDIA_PUBLIC_URL` is an origin only. The application publishes `wss://media.example.com/api/exotel/stream?sample-rate=8000`. Configure the same Basic-auth credentials in the AgentStream VoiceBot applet. The media process must be publicly reachable over WSS; use an HTTPS/WSS tunnel only for development and never place credentials in the tunnel URL.

## Dashboard setup

For an inbound ExoPhone, bind the number to the published DemoBank inbound profile, then configure the Exotel flow's VoiceBot/AgentStream applet for **bidirectional** streaming, raw PCM, mono, 8 kHz, 16-bit. Set the applet's WebSocket URL to the endpoint above and enable its documented Basic authentication. Configure the applet's optional Passthru callback as:

```text
https://your-public-app.example/api/exotel/recording?token=<EXOTEL_WEBHOOK_SECRET>
```

That callback is only for recording metadata; it is not a public playback URL. The application accepts the documented Exotel recording object-storage URL and playback remains tenant-authorized through `/api/calls/:id/recording`.

The inbound control webhook remains:

```text
https://your-public-app.example/api/exotel/inbound?token=<EXOTEL_WEBHOOK_SECRET>
```

Use it for the existing ExoML DTMF control flow. For an AgentStream inbound flow, ensure the dashboard flow invokes this control webhook before its VoiceBot applet so the call is pinned to the inbound profile's published IVR version before the stream starts. AgentStream's `call_sid` is then matched to that created call.

For outbound calls, the provider uses Voice v1 `calls/connect` with `streamtype=bidirectional`, the protected stream URL, `record=true`, and the protected status callback automatically.

## Focused acceptance

Use one 30–60 second approved/trial call at a time:

1. Confirm `exotel.outbound.created` or `exotel.inbound.received`, then `exotel.media.session_started`.
2. Hear the published DemoBank greeting.
3. Press `1`, `2`, `3`, `4`, and `9` in separate calls; menu routing remains the shared IVR graph path.
4. Ask “What documents do I need?” and verify the Knowledge response; ask an out-of-scope Bitcoin-price question and verify no fabricated answer.
5. Speak during output and verify AgentStream `clear`/existing ConversationAbort handling produces one interrupted turn.
6. Confirm a terminal status is idempotent and, after Exotel supplies a recording callback, that an authorized tenant user can retrieve it through the application proxy.

AgentStream documents bidirectional raw PCM and playback `clear`, so Cascaded and Gemini Live use the shared runtime after the provider codec adapter. Exotel's public AgentStream documentation describes a dashboard Flow Transfer applet but does not document a per-call server transfer API equivalent to the existing Twilio adapter. Therefore the Exotel Human Transfer adapter stays explicitly unsupported and follows the graph's canonical `ACTION_FAILURE` outcome; do not advertise live transfer until Exotel documents a controllable API for the needed call type.

For current protocol details, use Exotel's [AgentStream developer guide](https://developer.exotel.com/docs/agentstream/developer-guide) and [Bulk Call Details recording reference](https://developer.exotel.com/api/call-details-bulk).
