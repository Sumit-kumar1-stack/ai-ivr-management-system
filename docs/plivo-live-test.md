# Plivo live delivery runbook

## Capability matrix

| Capability | Plivo contract used | OmniIVR status |
| --- | --- | --- |
| Inbound / outbound control | Voice application Answer URL and Call API | Implemented |
| Call identity / status | `CallUUID`, `CallStatus`, signed callbacks | Implemented |
| DTMF | Plivo XML `GetDigits` action callback | Implemented |
| Webhook authentication | V3 HMAC-SHA256 (`X-Plivo-Signature-V3`) | Implemented, fail closed |
| Audio streaming | Bidirectional Audio Streams API; μ-law 8 kHz | Implemented in the existing MEDIA process at `/api/plivo/stream` |
| Transfer | Plivo Call API redirect / XML `Dial` | Not enabled in this delivery |
| Recording | Active-call Record API, signed callback, authenticated Recording API lookup | Implemented |

Plivo documents V3 signatures, Voice callbacks, Audio Streams, and AI streaming at its official documentation. The V3 signature uses `PLIVO_AUTH_TOKEN`; `PLIVO_WEBHOOK_SECRET` is intentionally not used because it is not a Plivo authentication mechanism.

## Required environment

Set the primary provider in the deployment secret store (not in source control):

```dotenv
TELEPHONY_PROVIDER=plivo
PLIVO_AUTH_ID=...
PLIVO_AUTH_TOKEN=...
PLIVO_CALLER_ID=+<E164 Plivo number>
PLIVO_PUBLIC_BASE_URL=https://voice.example.com
PLIVO_MEDIA_PUBLIC_URL=wss://media.example.com
```

`PLIVO_PUBLIC_BASE_URL` must be the externally visible HTTPS origin exactly as Plivo calls it; V3 validation signs the full final URL including query parameters. Never add a proxy rewrite that changes it.

## Dashboard mapping and live test

1. Complete Plivo KYC and obtain a voice-enabled number; Indian numbers require KYC.
2. In Plivo Console, attach a Voice application to that number and configure signed callbacks: inbound `POST https://<public-web>/api/plivo/inbound`, input `POST https://<public-web>/api/plivo/input`, status `POST https://<public-web>/api/plivo/status`, and recording `POST https://<public-web>/api/plivo/recording`. The MEDIA process creates `wss://<public-media>/api/plivo/stream`.
3. Start `WEB`, `WORKER`, and `MEDIA` with `npm run dev:all`, then check every `/ready` endpoint. Readiness must identify Plivo and expose no credentials.
4. In **IVR Flows**, validate, submit, approve, publish, and apply the DemoBank version to an inbound profile with provider `PLIVO` and the exact E.164 number. Do not use an unscoped fallback profile.
5. Call the number. The expected path is Greeting → Main Menu → `1` Knowledge → ask a loan question → response → `9` End Call. Record the `CallUUID` from signed callbacks and confirm it is persisted as `providerCallId`.
6. Start a permitted OmniIVR outbound quick test to a verified destination. Confirm the create-call response’s request UUID is not stored as `providerCallId`; the first signed callback must associate the authoritative `CallUUID`.
7. On the first `in-progress` callback, confirm the MEDIA logs show a Plivo stream connection. The server accepts only the per-call HMAC token generated from `PLIVO_AUTH_TOKEN`; it converts Plivo `media` frames to the shared runtime and emits documented `playAudio` frames back.
8. Keep the call active for 30–60 seconds, then end it. The Record API callback must reach `POST /api/plivo/recording`; it stores `RecordingID` and duration, never the callback's `record_url`. Open the latest call in OmniIVR to play or download it through the tenant-scoped recording proxy.

Recording retention clears OmniIVR's provider reference at the configured retention boundary. It deliberately does not claim to delete the remote Plivo recording binary; configure Plivo-side deletion/retention separately if required by policy.

No Plivo credentials or verified/KYC number are present in this workspace, so a real inbound/outbound test must be performed by the release owner after setting the variables above.
