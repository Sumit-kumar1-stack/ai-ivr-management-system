# Vercel Deployment — Web / Control Plane

OmniIVR contains three logical runtime processes:

- **WEB** — Next.js UI, APIs, dashboard, Socket.IO and provider webhooks
- **MEDIA** — realtime telephony media WebSocket server
- **WORKER** — campaigns, retries, cleanup and background jobs

Vercel should be used for the **WEB/control-plane deployment only**. Do not represent a Vercel deployment as the entire voice runtime unless MEDIA and WORKER are deployed separately and wired to the same backing services.

## Vercel project

- Repository: `ai-ivr-management-system`
- Root Directory: `./`
- Framework: Next.js / auto-detect
- Production branch: `master`
- Build command: existing `npm run build`

## External services

The production WEB deployment may require values for services already used by the application, including:

- PostgreSQL / Prisma
- Redis / Upstash
- telephony provider credentials and webhook configuration
- AI/STT/TTS provider credentials where enabled
- public application/callback URLs

Only configure providers you intend to demonstrate. Keep all secrets in Vercel environment variables.

## Separate runtimes

The following processes should remain separate from the Vercel web deployment:

```text
MEDIA  → realtime telephony media / WebSocket processing
WORKER → BullMQ campaigns, retries, cleanup, background jobs
```

They need access to the same production database/Redis and provider configuration.

## Portfolio-safe deployment

A recruiter/demo deployment can expose the control-plane UI even when live telephony providers are not enabled. In that mode:

- do not claim real calls are enabled unless provider credentials/runtimes are connected;
- keep production-only provider controls clearly distinguishable from simulation/demo flows;
- keep health/readiness endpoints truthful about unavailable dependencies.

## Verification

1. `npm run build` succeeds on Vercel.
2. The production UI loads over HTTPS.
3. `/api/health` responds.
4. Authentication/session behavior works for the configured environment.
5. Database/Redis failures are visible through readiness checks rather than silently ignored.
6. Telephony webhooks are not enabled until their public callback URL and provider credentials are configured.
7. MEDIA/WORKER are treated as separate deployment responsibilities.
