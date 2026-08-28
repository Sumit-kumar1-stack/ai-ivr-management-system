# Phase E.2 runner behavior-loss audit

The former `communication-campaign-runner.service.ts` combined launch safety,
provider dispatch, and settlement in one process. E.2 keeps the runner as a
compatibility wrapper and assigns every former responsibility as follows.

| Former runner responsibility | Current owner | Disposition |
| --- | --- | --- |
| Atomic campaign claim and duplicate delivery handling | `communication-outbound-orchestrator.service.ts` plus durable outbound-attempt unique keys | Moved. `QUEUED`/`SCHEDULED` claims become `RUNNING`; repeated `RUNNING` delivery resumes deterministic fan-out. |
| Tenant ownership | launch service, runtime lifecycle service, and orchestrator preflight/attempt reload | Moved and rechecked before execution. |
| Billing and active subscription checks | launch service plus orchestrator execution-time preflight | Preserved at both API and worker boundaries. |
| Tier/channel entitlement checks | launch service plus orchestrator execution-time preflight | Preserved. |
| Audience resolution | immutable `CommunicationCampaignRecipient` snapshot rows | Preserved; fan-out consumes snapshot identifiers, not raw contacts. |
| DNC, consent, suppression, and attempt eligibility | orchestrator preflight, fan-out, retry hook, and immediate attempt execution | Moved and repeated at every relevant boundary. |
| Usage reservation and queue-enqueue compensation | `communication-launch.service.ts` and `communication-usage-limit.service.ts` | Still handled before the campaign job is accepted. |
| Campaign status transitions | launch service, runtime lifecycle service, orchestrator, and finalizer | Moved to canonical services with compare-and-set updates. |
| Audit events | launch service, runtime lifecycle service, orchestrator denial/fan-out, and finalizer | Preserved as metadata-only campaign events. |
| Failure handling | launch compensation, resumable deterministic fan-out, durable attempt status, retry hook, and capacity `finally` release | Moved and strengthened. Queue failure never marks a recipient complete. |
| Finalization | `communication-campaign-finalizer.service.ts` | Preserved and extended to require no queued/claimed attempts, actionable recipients, deferred work, or retries. |
| Retry interaction | `scheduleOutboundRetry` plus the durable `(recipient, attemptNumber)` unique key | Moved to an E.2-safe provider-neutral hook. |
| SMS, WhatsApp, AI voice, and IVR provider preparation/execution | none in E.2 | Intentionally stopped at the fake provider boundary. Real adapter selection and calls belong to E.3. |

This split does not promise exactly-once queue delivery. The contract is
at-least-once delivery with deterministic job IDs, an atomic persisted attempt
claim, and an idempotent business effect.
