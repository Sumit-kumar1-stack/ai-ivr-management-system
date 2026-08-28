# Phase E.3 Plivo outbound audit

- Installed SDK: `plivo@4.79.0`.
- Verified create API: `client.calls.create(from, to, answerUrl, params)`.
- Verified create options used by E.3: `answerMethod`, `hangupUrl`, and `hangupMethod`.
- The installed create response exposes `requestUuid`. It does not expose the eventual provider `CallUUID`; signed Answer/hangup callbacks provide that identifier.
- E.3 therefore stores `providerRequestId` separately and binds `providerCallId` only from an exact-attempt signed callback.
- The installed create-call TypeScript surface does not declare a general status callback or `ringUrl`. E.3 uses the signed Answer callback for the answered transition and the signed hangup callback for terminal status. The lifecycle reducer still safely accepts intermediate states if Plivo sends them.
- Recording is not enabled by E.3 because `CommunicationCampaign` has no outbound recording opt-in policy. Existing signed Plivo recording handling remains unchanged.
- The legacy `Call` model required deprecated `Campaign` and `Contact` relations. E.3 makes those legacy relations optional and adds direct canonical links to `CommunicationCampaign` and `CommunicationOutboundAttempt`; it does not create or reconnect a deprecated child campaign.
- Plivo staged-hybrid input remains XML-owned. No WebSocket DTMF event was added.
- Tests mock the SDK create boundary. No provider network request or paid call is part of verification.
