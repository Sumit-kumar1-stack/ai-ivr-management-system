OmniIVR — Adaptive Voice Automation & Orchestration Platform

OmniIVR is a multi-tenant communication orchestration platform for traditional IVR, smart IVR, adaptive AI IVR, conversational AI calling, outbound campaigns, recordings, analytics, knowledge retrieval, RBAC, and enterprise integrations.

The key architectural principle is simple:

AI is optional, not foundational to every call. Predictable and security-sensitive operations stay deterministic. AI is invoked only when conversation or reasoning adds value.

1. Product Vision

OmniIVR is designed as a reusable orchestration layer between customers, enterprise teams, telephony providers, business workflows, knowledge bases, AI models, and external systems such as CRM, eKYC, payments, loan platforms, ERP, and ticketing systems.

The same core platform can support:

Classic keypad IVR

Speech-enabled Smart IVR

Adaptive AI IVR

Fully conversational AI calling

Inbound customer service

Outbound voice campaigns

Knowledge-base automation

Human-agent escalation

Recordings and analytics

Future SMS and WhatsApp channels

External enterprise actions

2. Core Design Principles

Builder-driven business logic

Menus, speech aliases, navigation, knowledge, authentication, actions, transfers, AI policy, retries, post-action behavior, and terminal behavior are defined in the IVR Builder / control plane rather than hardcoded into Plivo, Twilio, or Exotel code.

Provider independence

The runtime should work with generic capabilities such as:

speak
collectInput
startMedia
transfer
hangup
startRecording
sendMessage

Provider adapters translate those generic operations into provider-specific APIs.

AI only when needed

A known menu selection can be handled without an LLM:

Caller presses 2
    ↓
Eligibility node
    ↓
Local knowledge retrieval
    ↓
Voice response

A genuine free-form question may use AI:

Caller asks a complex natural-language question
    ↓
Conversational Escape
    ↓
Knowledge retrieval
    ↓
AI model
    ↓
Natural response

External enterprise systems remain external

OmniIVR orchestrates systems such as CRM, eKYC, loan systems, payments, ERP, and ticketing. It does not attempt to replace them.

Published versions are immutable

A production-ready workflow follows:

Draft → Validate → Submit → Approve → Publish

Published snapshots remain immutable; later changes create a new draft/version.

3. High-Level Architecture

flowchart TB
    USER[Admin / Maker / Checker / Developer / Agent] --> UI[Web UI / Future Client UI / Mobile UI]
    UI --> API[Control Plane APIs]

    API --> BUILDER[IVR Builder]
    API --> CAMPAIGN[Campaign Manager]
    API --> KB[Knowledge Management]
    API --> ANALYTICS[Analytics]
    API --> SETTINGS[Settings / RBAC / Tenant]
    API --> DEV[Developer / Integrations]

    BUILDER --> VERSION[Draft / Validate / Approve / Publish]
    VERSION --> EXECUTOR[Generic IVR Graph Executor]

    CAMPAIGN --> QUEUE[Queue / Worker]
    QUEUE --> TELEPHONY[Telephony Adapter Layer]

    INBOUND[Inbound Customer Call] --> TELEPHONY
    TELEPHONY --> EXECUTOR

    EXECUTOR --> KNOWLEDGE[Knowledge Retrieval]
    EXECUTOR --> AI[AI Runtime]
    EXECUTOR --> ACTIONS[External Action Gateway]
    EXECUTOR --> AUTH[Authentication Boundary]
    EXECUTOR --> TRANSFER[Human Transfer]
    EXECUTOR --> RECORDING[Recording Pipeline]

    ACTIONS --> CRM[CRM]
    ACTIONS --> EKYC[eKYC]
    ACTIONS --> CORE[Loan / Core System]
    ACTIONS --> PAYMENT[Payments]
    ACTIONS --> TICKETING[ERP / Ticketing]

    TELEPHONY --> PLIVO[Plivo]
    TELEPHONY --> TWILIO[Twilio]
    TELEPHONY --> EXOTEL[Exotel]

    EXECUTOR --> EVENTS[Events / Realtime / Timeline]
    EVENTS --> ANALYTICS

4. Runtime Processes

The application is separated into three logical runtime processes.

Process

Default Port

Responsibility

WEB

3000

Next.js UI, APIs, dashboards, Socket.IO, provider webhooks

MEDIA

3001

Realtime telephony media WebSocket server

WORKER

3002

Campaign processing, retries, cleanup, background jobs

Development command:

npm run dev:all

Health checks:

curl -i http://localhost:3000/api/health
curl -i http://localhost:3000/api/ready

5. Technology Stack

Frontend / Control Plane

Next.js App Router

TypeScript

React

Tailwind CSS

Shadcn/UI-style components

Socket.IO for authenticated realtime updates

Backend

Next.js API routes / custom web process

TypeScript services

Prisma ORM

PostgreSQL

Redis / Upstash

BullMQ

Telephony

Plivo

Twilio adapter support

Exotel adapter support

Realtime WebSocket media layer

AI / Knowledge

Deterministic routing

BM25 local retrieval

RAG-style knowledge context

Gemini text / Gemini Live paths where configured

STT / TTS abstraction

Cascaded and realtime AI runtime patterns

6. UI Modules / Navigation

Dashboard
├── Campaigns
│   ├── Voice
│   └── Omnichannel
├── Calls
│   ├── Inbound
│   ├── Outbound
│   └── Recordings
├── Contacts
├── IVR / IVR Builder
├── Knowledge
├── Analytics
│   ├── Overview
│   ├── Inbound
│   ├── Outbound
│   └── Campaigns
├── Developer / Integrations
├── Settings
└── Administration / Approval

The current Next.js UI is one control plane implementation. A future client can use its own React, Angular, Flutter, mobile, or embedded enterprise UI while retaining the same backend orchestration engine.

7. IVR Models

7.1 Classic / Traditional IVR

Caller
  ↓
Greeting
  ↓
DTMF Menu
  ↓
Configured Edge
  ↓
Next Node

Best for predictable, high-volume, compliance-sensitive workflows.

Examples:

bank department routing

hospital departments

utilities

government services

simple customer support

Benefits:

deterministic

low cost

low AI dependency

easy auditing

predictable behavior

7.2 Smart IVR

Adds speech aliases and local knowledge while keeping routing deterministic.

DTMF 2 ─┐
        ├──> Eligibility Node
Speech ─┘

Known FAQs can be answered through local retrieval without Gemini.

7.3 Adaptive IVR

Combines deterministic routing, local knowledge, and AI only when necessary.

Caller Input
    ↓
Can deterministic routing handle it?
    ├── Yes → execute locally
    └── No
         ↓
Can local knowledge answer confidently?
    ├── Yes → local retrieval
    └── No / genuine free-form request
             ↓
         Conversational AI

7.4 Conversational IVR

Natural-language-first experience with multi-turn context.

Caller Speech
    ↓
Speech / Native Audio Runtime
    ↓
Intent + Context
    ↓
Knowledge / Actions
    ↓
AI Response

8. IVR Builder

The IVR Builder is the primary business control plane.

Generic node types may include:

Start

Greeting

Hybrid Menu

Knowledge

Authentication Gate

Action

Human Transfer

Callback / follow-up

Navigation

End Call

Example:

flowchart TD
    S[START] --> G[GREETING]
    G --> M[HYBRID MENU]
    M -->|1| L[Loan Information]
    L --> K1[Knowledge]
    K1 --> M
    M -->|2| E[Eligibility]
    E --> K2[Knowledge]
    K2 --> M
    M -->|3| D[Documents / Adaptive Assistant]
    D --> AI[Knowledge / Conversational Escape]
    AI --> M
    M -->|4| A[AUTH_GATE]
    A --> ACT[External Action]
    ACT --> M
    M -->|5| H[AUTH_GATE]
    H --> T[Human Transfer]
    M -->|8| R[Repeat]
    M -->|0| HOME[Home]
    M -->|*| BACK[Back]
    M -->|9| END[End Call]

9. Semantic Navigation

Navigation should be semantic instead of provider-specific.

HOME
BACK
REPEAT
END

Example configuration:

0 → HOME
* → BACK
8 → REPEAT
9 → END

Different tenants can map different keys without changing runtime code.

10. Post-Action Behavior

After a node completes, the Builder determines what happens next.

Examples:

RETURN_HOME
RETURN_PREVIOUS
RETURN_CONTEXT
STAY_CURRENT
CONTINUE_TO_NODE
END_CALL

This keeps the runtime generic and reusable across industries.

11. Knowledge Base Architecture

Knowledge can originate from:

PDFs

FAQs

policy documents

product documentation

internal support content

Processing:

Document
   ↓
Text Extraction
   ↓
Chunking
   ↓
Indexing
   ↓
Tenant / Flow Scoping
   ↓
BM25 / Retrieval
   ↓
Relevant Chunk(s)
   ↓
Voice-safe response / AI context

Local knowledge path

Menu Option
    ↓
Knowledge Node
    ↓
BM25
    ↓
Relevant Chunk
    ↓
Speak

Gemini is not required.

AI knowledge path

Free-form Question
    ↓
Relevant Knowledge
    ↓
AI Context
    ↓
Natural Response

12. AI Policy

Builder-controlled AI policies can follow a model such as:

NO_AI / NEVER
FREE_FORM_ONLY
LOW_CONFIDENCE_ONLY
ALWAYS_CONVERSATIONAL

Typical behavior:

Operation

AI Required?

Greeting

No

DTMF menu

No

Repeat / Home / Back

No

End call

No

Known FAQ

Usually no

Local KB retrieval

No

Genuine free-form question

Optional / yes

Complex multi-turn conversation

Yes

Secure action routing

Deterministic

Human transfer

Deterministic

13. Inbound Calling

sequenceDiagram
    participant Caller
    participant Provider as Plivo / Telephony
    participant Web as WEB API
    participant Runtime as IVR Executor
    participant KB as Knowledge
    participant Media as MEDIA
    participant DB as Database

    Caller->>Provider: Call business number
    Provider->>Web: POST /api/plivo/inbound
    Web->>DB: Resolve tenant/profile/deployment/flow
    Web->>Runtime: Execute published entry
    Runtime-->>Web: Speak / GetInput / Stream
    Web-->>Provider: Provider XML
    Provider-->>Caller: Greeting / menu

    Caller->>Provider: DTMF / speech
    Provider->>Web: /api/plivo/input
    Web->>Runtime: Normalize input + execute edge

    opt Knowledge
        Runtime->>KB: Retrieve relevant content
        KB-->>Runtime: Relevant chunks
    end

    opt Realtime AI
        Provider->>Media: WebSocket media
        Media->>Runtime: Audio / transcript events
    end

    Provider->>Web: Recording callback
    Provider->>Web: Status callback
    Web->>DB: Persist recording/status/analytics

Typical Plivo routes:

/api/plivo/inbound
/api/plivo/input
/api/plivo/status
/api/plivo/recording
/api/plivo/stream

14. Outbound Calling

flowchart LR
    C[Campaign] --> A[Audience / Contacts]
    A --> Q[BullMQ Queue]
    Q --> W[Worker]
    W --> P[Telephony Adapter]
    P --> PHONE[Customer Phone]
    PHONE --> IVR[Published IVR Runtime]
    IVR --> R[Recording / Status / Analytics]

Lifecycle:

Create Campaign
    ↓
Select Audience
    ↓
Select Channel / IVR / Runtime
    ↓
Submit
    ↓
Approve
    ↓
Launch
    ↓
Worker Queue
    ↓
Provider Call
    ↓
Customer Interaction
    ↓
Status + Recording + Analytics

15. Campaign Architecture

Campaign configuration can include:

campaign name

tenant / owner

audience

channel

published IVR

runtime tier

schedule

concurrency

retry policy

approval state

provider

recording policy

The worker executes calls asynchronously so the web process remains responsive.

16. Omnichannel: Voice, SMS, WhatsApp

The long-term channel model is adapter-based.

flowchart TB
    CAMPAIGN[Campaign / Communication Orchestrator]
    CAMPAIGN --> VOICE[Voice Adapter]
    CAMPAIGN --> SMS[SMS Adapter]
    CAMPAIGN --> WA[WhatsApp Adapter]

    VOICE --> VP[Plivo / Twilio / Exotel]
    SMS --> SP[SMS Provider]
    WA --> WP[WhatsApp Business Provider]

    VP --> EVENTS[Unified Delivery / Status Events]
    SP --> EVENTS
    WP --> EVENTS

Voice

Current primary focus:

inbound calling

outbound calling

DTMF

speech

realtime media

recording

transfer

callbacks/status

AI calling

SMS adapter path

Campaign
  ↓
SMS Template
  ↓
SMS Adapter
  ↓
Provider API
  ↓
Delivery Callback
  ↓
Unified Message Status

Future SMS capabilities:

transactional messaging

campaign SMS

template variables

consent / opt-out handling

delivery receipts

retries

tenant-specific sender configuration

WhatsApp adapter path

Campaign / Workflow
  ↓
WhatsApp Template or Session Message
  ↓
WhatsApp Adapter
  ↓
Provider / Meta Business API
  ↓
Inbound Reply / Delivery Callback
  ↓
Unified Conversation Event

Future WhatsApp capabilities:

approved templates

inbound replies

campaign messaging where permitted

agent handoff

workflow continuation

delivery/read status

unified conversation timeline

17. Telephony Adapter Pattern

Conceptual provider contract:

interface TelephonyProvider {
  createOutboundCall(input: OutboundCallInput): Promise<ProviderCallResult>;
  buildInboundResponse(input: InboundRuntimeResult): Promise<string>;
  transferCall(input: TransferInput): Promise<void>;
  hangupCall(input: HangupInput): Promise<void>;
  startRecording(input: RecordingInput): Promise<RecordingResult>;
  updateCall(input: CallControlInput): Promise<void>;
}

Implementations:

TelephonyProvider
├── PlivoAdapter
├── TwilioAdapter
├── ExotelAdapter
└── FutureProviderAdapter

The graph executor should not contain provider-specific business behavior.

18. Messaging Adapter Pattern

Conceptual contract:

interface MessagingChannelAdapter {
  sendMessage(input: MessageInput): Promise<MessageResult>;
  parseInbound(payload: unknown): Promise<InboundMessage>;
  parseStatus(payload: unknown): Promise<MessageStatus>;
}

Possible implementations:

MessagingChannelAdapter
├── WhatsAppAdapter
├── SMSAdapter
├── FutureEmailAdapter
└── FuturePushAdapter

19. External Enterprise Integration Gateway

flowchart LR
    IVR[IVR Action Node] --> GATEWAY[Integration Gateway]
    GATEWAY --> CRM[CRM]
    GATEWAY --> EKYC[eKYC]
    GATEWAY --> CORE[Loan / Core Banking]
    GATEWAY --> PAY[Payment]
    GATEWAY --> ERP[ERP / Ticketing]

The IVR works with normalized outcomes:

SUCCESS
FAILURE
PENDING
TIMEOUT

This makes the graph independent of a specific enterprise vendor.

20. eKYC Integration Model

OmniIVR orchestrates eKYC but does not own the eKYC implementation.

Caller
  ↓
Protected IVR Node
  ↓
AUTH_GATE
  ↓
eKYC Action
  ↓
External eKYC Platform
  ↓
Normalized Result
  ↓
Builder-defined Next Step

The external eKYC platform owns:

identity verification

document verification

liveness

face match

regulatory KYC workflow

OmniIVR owns:

when to invoke it

safe input mapping

normalized outcomes

next workflow edge

21. CRM / Core-System Integration

Examples:

Create CRM Ticket
Check Loan Application
Fetch Customer Segment
Schedule Callback
Update Lead Status
Check Payment Status
Create Service Request

Builder-level action configuration should include:

action name

input mapping

secret reference

timeout

expected outcome mapping

post-action behavior

22. UI Independence

The current Next.js interface is not the orchestration engine.

Future interfaces can include:

Existing OmniIVR Web UI
Custom React Portal
Angular Enterprise Portal
Flutter Mobile App
Embedded Bank Portal
Partner Console

flowchart TB
    R[React / Next.js UI] --> API[OmniIVR APIs]
    A[Angular Client UI] --> API
    F[Flutter App] --> API
    B[Bank Internal Portal] --> API
    API --> CORE[Orchestration Services]

A customer can keep its existing UI while reusing OmniIVR APIs and runtime services.

23. Authentication, RBAC and Governance

Representative roles/personas:

SUPER_ADMIN

ADMIN / Tenant Admin

Maker / Creator

Checker / Approver

Developer

Agent

Governance:

Draft
  ↓
Validate
  ↓
Submit
  ↓
Independent Approval
  ↓
Publish

Published snapshots remain immutable.

Control-plane privileges should not bypass:

provider signatures

tenant-scoped runtime data

AUTH_GATE

published immutability

approval rules

24. Multi-Tenant Model

Tenant A
├── Users
├── IVR Flows
├── Knowledge
├── Campaigns
├── Integrations
├── Calls
└── Analytics

Tenant B
├── Users
├── IVR Flows
├── Knowledge
├── Campaigns
├── Integrations
├── Calls
└── Analytics

Tenant boundaries must be preserved across runtime execution, knowledge, calls, recordings, integrations, analytics, and campaigns.

25. Recording Pipeline

Call starts
   ↓
Recording requested
   ↓
Recording started
   ↓
Provider callback
   ↓
Recording available
   ↓
Metadata persisted
   ↓
Authorized playback

Recordings should remain tenant-scoped and access-controlled.

26. Analytics

Analytics areas include:

Overview
Inbound
Outbound
Campaigns

Metrics can include:

total calls

inbound / outbound split

completed / failed

average duration

answer rate

campaign performance

provider distribution

runtime distribution

recording availability

retry behavior

27. Realtime / Event Architecture

WEB
MEDIA
WORKER
   ↓
Shared Redis Events
   ↓
Realtime Subscriber
   ↓
Socket.IO
   ↓
Dashboard

This allows the runtime processes to remain independent while sharing operational events.

28. AI Calling Architecture

Cascaded AI

Caller Audio
   ↓
STT
   ↓
Deterministic / Adaptive Decision
   ↓
Knowledge / RAG
   ↓
Text AI when required
   ↓
TTS
   ↓
Telephony Audio

Realtime / Premium AI

Caller Audio
   ↓
Realtime Media WebSocket
   ↓
Gemini Live / Realtime AI
   ↓
Streaming Response
   ↓
Caller

Even with a Premium runtime selected, deterministic greeting/menu behavior can remain zero-AI until conversation is actually needed.

29. Security Boundaries

Important controls include:

webhook signature validation

media authorization

tenant scoping

AUTH_GATE before protected actions

published version immutability

secret references

ownership/RBAC checks

recording authorization

integration endpoint validation

Sensitive information such as OTP, PIN, CVV, passwords, API keys, and provider secrets should not be exposed or logged improperly.

30. Developer / Integration Portal

The Developer area is the extension point for:

integration definitions

webhook setup

API configuration

secret references

developer documentation

action contracts

future API keys / OAuth clients

sandbox integration tests

31. Simplified Repository Structure

src/
├── app/
│   ├── (dashboard)/
│   └── api/
│       ├── plivo/
│       ├── twilio/
│       ├── communication/
│       ├── campaigns/
│       ├── calls/
│       └── analytics/
├── components/
├── lib/
├── services/
│   ├── ivr/
│   ├── analytics/
│   ├── telephony/
│   ├── knowledge/
│   ├── integrations/
│   └── auth/
├── server/
│   ├── web-process.ts
│   └── media-process.ts
└── workers/
    └── worker-process.ts

prisma/
├── schema.prisma
├── migrations/
└── seed.ts

32. Local Development

Requirements:

Node.js 22+

npm

PostgreSQL

Redis

telephony provider credentials for live calling

AI/STT/TTS credentials for optional AI modes

Install:

npm install

Prisma:

npx prisma generate
npx prisma migrate deploy

Start:

npm run dev:all

Health:

curl -i http://localhost:3000/api/health
curl -i http://localhost:3000/api/ready

33. Development Tunnels

Recommended development topology:

Cloudflare
   ↓
WEB :3000

ngrok
   ↓
MEDIA :3001

Commands:

cloudflared tunnel --url http://127.0.0.1:3000

ngrok http 3001

Provider callbacks use the public WEB origin. Realtime media uses the public MEDIA WebSocket origin.

34. Example Plivo Configuration

Answer URL:
https://<WEB_PUBLIC_URL>/api/plivo/inbound

Status URL:
https://<WEB_PUBLIC_URL>/api/plivo/status

Recording callback:
https://<WEB_PUBLIC_URL>/api/plivo/recording

Realtime media:
wss://<MEDIA_PUBLIC_HOST>/api/plivo/stream

Provider signature validation should remain enabled.

35. Example DemoBank Showcase Flow

START
  ↓
GREETING
  ↓
MAIN HYBRID MENU
  │
  ├── 1 → Loan Information → Local Knowledge → Home
  ├── 2 → Eligibility → Local Knowledge → Home
  ├── 3 → Documents / Adaptive Assistant → Knowledge / AI → Context
  ├── 4 → AUTH_GATE → External Action → Outcome Routing
  ├── 5 → AUTH_GATE → Human Transfer
  ├── 8 → Repeat
  ├── 0 → Home
  ├── * → Back
  └── 9 → End Call

36. Current Delivery Position

The platform has working foundations across:

multi-process WEB / MEDIA / WORKER architecture

PostgreSQL + Redis

IVR Builder and published flow execution

inbound telephony

outbound campaign orchestration

DTMF / speech-capable routing

local knowledge retrieval

adaptive AI paths

Gemini Live path

recordings

call lifecycle/status

analytics

RBAC / governance

tenant ownership/scoping

provider adapters

developer/integration boundaries

omnichannel campaign foundations

Live acceptance should always be performed for the exact deployment/environment being delivered.

37. Production Hardening Notes

The architecture is extensible, but several areas should be explicitly treated as production-hardening work.

Persistent integration registry

Integration definitions should be durably stored for multi-instance deployments.

Production secret management

secretRef should resolve through a production-grade secret store such as AWS Secrets Manager, GCP Secret Manager, Azure Key Vault, or HashiCorp Vault.

Distributed idempotency

Outbound actions and integrations should use Redis/DB-backed distributed idempotency.

SSRF / network defense

External integration endpoints need defense in depth:

DNS resolution checks

redirect validation

private-network blocking

timeout enforcement

allow/deny policies

Scale and failover

Future production deployments should add:

horizontal autoscaling

multi-region strategy

telephony provider failover

Redis/Postgres HA strategy

health-based routing

38. Future Scope

Phase 1 — Productization

richer IVR simulation

reusable templates

version comparison

environment promotion

stronger flow validation

audit/report exports

Phase 2 — Enterprise Integrations

persistent integration registry

production secret vault integration

CRM adapters

eKYC adapters

payment adapters

ticketing/ERP adapters

event/webhook marketplace

integration observability

Phase 3 — Omnichannel

production SMS adapter

WhatsApp Business adapter

shared campaign templates

consent / opt-out management

unified customer timeline

channel fallback rules

voice-to-WhatsApp continuation

WhatsApp-to-agent handoff

Phase 4 — Advanced AI

multilingual AI

configurable AI guardrails

enterprise model selection

client-owned AI endpoints

semantic caching

voice personalization

AI cost optimization

Phase 5 — Scale and Reliability

multi-region deployment

autoscaling

provider failover

distributed runtime/session state

queue partitioning

SLO/SLA observability

failover testing

Phase 6 — Developer Platform

public SDKs

API keys / OAuth clients

webhook subscriptions

developer sandbox

custom action SDK

extension marketplace

embeddable Builder components

Phase 7 — Industry Packages

Reusable templates for:

Banking
Insurance
Healthcare
Telecom
E-commerce
Utilities
Government
Education
Travel

Each package can provide flow templates, knowledge templates, integration presets, analytics views, and compliance guidance while using the same runtime.

39. Adaptability Across Industries

Banking

Loan information
Eligibility
Application status
eKYC
Human agent

Healthcare

Appointment booking
Department routing
Lab report status
Patient support

Insurance

Policy information
Claim status
Renewal
Agent escalation

E-commerce

Order status
Returns
Refunds
Delivery support

The runtime remains generic:

MENU
KNOWLEDGE
AUTH_GATE
ACTION
TRANSFER
NAVIGATION
END

Only Builder configuration and integrations change.

40. Why the Architecture Is Reusable

The separation is:

UI
↓
Control Plane
↓
Published Workflow
↓
Generic Runtime
↓
Provider / AI / Knowledge / External Adapters

Therefore:

the UI can change

the telephony provider can change

the AI provider can change

the knowledge source can change

the industry can change

external enterprise systems can change

without rewriting the core orchestration model.

We adapt the orchestration to the enterprise; we do not force the enterprise to rebuild around the IVR.

41. Recommended Demo Sequence

Video 1 — IVR Builder

Knowledge Upload
→ Adaptive IVR
→ Copilot
→ Builder
→ Knowledge
→ Navigation
→ AI Policy
→ Auth / Action / Transfer
→ Validate
→ Approve
→ Publish

Video 2 — Campaigns

Contacts
→ Audience
→ Voice Campaign
→ Select Published IVR
→ Submit
→ Approve
→ Launch
→ Worker Processing

Video 3 — Live Calling

Inbound Call
→ DTMF / Speech
→ Local Knowledge
→ Adaptive AI
→ END_CALL
→ Recording

Outbound Campaign
→ Customer Receives Call
→ IVR Interaction
→ Completion
→ Recording
→ Analytics

42. Repository Delivery Checklist

[ ] .env.local is ignored
[ ] no real secrets are tracked
[ ] .env.example contains placeholders only
[ ] node_modules is ignored
[ ] .next is ignored
[ ] logs / recordings are ignored
[ ] Prisma schema validates
[ ] typecheck passes
[ ] targeted tests pass
[ ] README is up to date
[ ] demo tag is pushed
[ ] lead is invited to private repository

Suggested review tag:

git tag -a v0.9.0-demo -m "OmniIVR lead review demo build"
git push origin v0.9.0-demo

43. Final Summary

OmniIVR is not only a phone-menu application. It is an adaptive communication orchestration platform where:

business journeys are configured in the Builder

runtime execution is generic

predictable operations remain deterministic

knowledge can be answered locally

AI is introduced selectively

telephony providers are replaceable through adapters

external systems connect through controlled actions

campaigns can evolve from voice into SMS and WhatsApp

the current UI can be replaced or embedded

the same architecture can serve multiple industries

The long-term target is one governed, multi-tenant control plane supporting:

Traditional IVR
Smart IVR
Adaptive AI IVR
Conversational AI Calling
Outbound Voice Campaigns
SMS Campaigns
WhatsApp Workflows
Enterprise Action Orchestration
