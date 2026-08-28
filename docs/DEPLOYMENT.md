# Production deployment

The application runs as three independently scaled processes against managed PostgreSQL, Redis/BullMQ, and private persistent knowledge storage. WEB serves Next.js, authenticated APIs, Socket.IO, and the Redis realtime bridge. MEDIA accepts Twilio Media Stream traffic and runs voice sessions. WORKER consumes BullMQ work, runs scheduled retention, and exposes a health server. WEB and MEDIA receive network traffic; WORKER does not serve application traffic.

## Release gate

Run these commands in the release image/workspace before deployment:

```sh
npm ci
npx prisma generate
npm run typecheck
npm run lint
npm test
npm run build
npm run verify:build
```

A completed build requires `.next/BUILD_ID`, `.next/server`, and `.next/build-manifest.json`. Compilation output alone is not evidence of a finished build. Inject secrets through the deployment platform's environment or secret manager; never copy `.env` into an image, commit production secrets, or log secret values.

Run database changes once, as a controlled pre-deployment/release job, before horizontally scaled processes start:

```sh
npm run migrate:deploy
```

This runs `prisma migrate deploy`. Never use `prisma migrate dev` in production.

## Process contracts

`validateEnvironmentFor` validates only the owning process. BUILD has no runtime credential requirements.

### WEB

Start WEB with:

```sh
npm run start:web
```

`PORT` controls the HTTP port. Use `GET /health` for liveness and `GET /ready` for readiness. WEB requires PostgreSQL, Redis, `JWT_SECRET`, a stable public HTTPS application URL (`APP_URL`, `NEXT_PUBLIC_APP_URL`, or `BASE_URL`), and `KNOWLEDGE_STORAGE_DIR`.

Production public URLs cannot use HTTP, localhost, `127.0.0.1`, ngrok, or trycloudflare. Development/test may use localhost and tunnel URLs.

### MEDIA

Start MEDIA with:

```sh
npm run start:media
```

`TWILIO_MEDIA_PORT` controls the listener. Use `GET /health` and `GET /ready` on that port. MEDIA requires PostgreSQL, Redis, Twilio credentials, stable `TWILIO_PUBLIC_BASE_URL`, stable HTTPS/WSS-compatible `TWILIO_MEDIA_PUBLIC_URL`, and positive `MEDIA_DRAIN_TIMEOUT_MS`.

Its lifecycle is `RUNNING → DRAINING → TERMINATED`. On SIGTERM/SIGINT, readiness becomes false, new streams are rejected, active streams are allowed to finish until the configured bounded drain timeout, and remaining streams are then closed.

Premium/Gemini Live requires `GEMINI_API_KEY`. Cascaded requires Deepgram STT (`DEEPGRAM_API_KEY`) and Gemini text/TTS (`GEMINI_API_KEY`). `PREMIUM_CASCADED_FALLBACK_ENABLED` defaults to enabled; when enabled, Premium deployments must also configure Cascaded dependencies. Set it to `false` only when the existing pre-live fallback must be disabled.

### WORKER

Start WORKER with:

```sh
npm run start:worker
```

`WORKER_HEALTH_PORT` controls its health listener. Use `GET /health` and `GET /ready`. Readiness reflects PostgreSQL, Redis/BullMQ, initialized workers, the process-specific environment contract, and shutdown state. On SIGTERM/SIGINT the worker becomes unready before closing consumers, queues, timers, Redis, and Prisma.

WORKER requires PostgreSQL, Redis, the outbound Twilio configuration it uses, a valid health port, and valid retention settings. It does not require WEB URLs, knowledge storage, or MEDIA AI configuration.

## Knowledge storage

Set `KNOWLEDGE_STORAGE_DIR` to private, persistent storage outside `public/`, `.next/`, and ephemeral production temporary directories. Multiple WEB replicas require shared persistent storage until object storage (such as S3, R2, or GCS) is implemented. It is not implemented today.

For an existing legacy store, run the controlled migration:

```sh
npm run migrate:knowledge-storage -- --execute
```

## Retention and abuse controls

Retention is scheduled by WORKER. Configure retention day settings plus `RETENTION_BATCH_SIZE` and `RETENTION_MAX_RECORDS_PER_RUN`. It uses bounded batches, supports dry runs, uses one UTC execution timestamp, and treats records as eligible only when `timestamp < cutoff`. Shutdown stops future ticks and overlapping runs are prevented.

Recording retention currently clears the stored recording reference; it does not delete the remote provider recording binary. Conversation messages can be deleted by metadata retention. Audit events are excluded as immutable compliance records.

Security-sensitive operations use strict, fail-closed rate-limit behavior. Do not publish internal abuse thresholds.

## Container checks

The Docker image runs as a non-root user and includes generated Prisma client, `.next`, source, and production dependencies. The command defaults to WEB and can be overridden with `npm run start:media` or `npm run start:worker`. `.dockerignore` excludes `.env` files, `.git`, private storage/uploads, recordings, and review ZIP artifacts.
