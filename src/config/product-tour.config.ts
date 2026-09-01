import type { UserRole } from "@prisma/client";

//--------------------------------------------------
// Tour Types
//--------------------------------------------------

export type ProductTourMode =
  | "FULL_PLATFORM"
  | "IVR_BUILDER"
  | "INBOUND_VOICE"
  | "OUTBOUND_CAMPAIGN"
  | "SMS"
  | "WHATSAPP"
  | "OMNICHANNEL"
  | "ANALYTICS"
  | "DEMOBANK";

export interface ProductTourStep {
  id: string;
  title: string;
  badge?: string;
  description: string;
  route: string;
  target?: string;
  placement?: "top" | "bottom" | "left" | "right" | "center";
  diagram?: string;
  requiredRoles?: UserRole[];
}

export interface ProductTourSection {
  id: string;
  title: string;
  badge?: string;
  description: string;
  steps: ProductTourStep[];
}

export interface ProductTourDefinition {
  mode: ProductTourMode;
  title: string;
  description: string;
  estimatedMinutes: number;
  sections: ProductTourSection[];
}

export interface ProductTourState {
  version: number;
  mode: ProductTourMode | null;
  sectionIndex: number;
  stepIndex: number;
  completed: boolean;
  skipped: boolean;
  completedModes: ProductTourMode[];
  lastVisitedAt: string;
}

export const TOUR_STORAGE_KEY = "omniivr-product-tour-v1";
export const TOUR_VERSION = 1;

//--------------------------------------------------
// Full Platform Tour (21 Conceptual Sections + Architecture Summary)
//--------------------------------------------------

const FULL_PLATFORM_TOUR: ProductTourDefinition = {
  mode: "FULL_PLATFORM",
  title: "Complete OmniIVR Platform Tour",
  description: "End-to-end walkthrough of Voice, SMS, WhatsApp, IVR builder, telephony architectures, governance, analytics, and integrations.",
  estimatedMinutes: 8,
  sections: [
    {
      id: "platform-overview",
      title: "Platform Overview",
      badge: "Architecture",
      description: "OmniIVR is an enterprise orchestration platform connecting Voice, SMS, and WhatsApp customer journeys with provider-neutral routing and deterministic reliability.",
      steps: [
        {
          id: "overview-intro",
          title: "Welcome to OmniIVR",
          badge: "Overview",
          route: "/dashboard",
          target: "[data-tour='dashboard-overview']",
          placement: "center",
          description: "OmniIVR combines conversational AI, deterministic IVR decision trees, and provider-neutral messaging into a single unified control plane. You can build interactive voice flows, launch multi-channel campaigns, and enforce strict Maker/Checker governance without vendor lock-in.",
          diagram: "Customer / Agent / Campaign\n       ↓\n    OmniIVR Control Plane\n ┌─────┼──────┐\nVoice  SMS  WhatsApp",
        },
      ],
    },
    {
      id: "dashboard",
      title: "Realtime Dashboard",
      badge: "Monitoring",
      description: "Live operational telemetry across active calls, campaign metrics, channel throughput, and system health.",
      steps: [
        {
          id: "dashboard-metrics",
          title: "Live Operations & Telemetry",
          badge: "Live Metrics",
          route: "/dashboard",
          target: "[data-tour='dashboard-overview']",
          placement: "bottom",
          description: "Monitor real-time call volume, concurrent channels, active campaigns, and provider health. Telemetry updates reactively with zero polling overhead.",
        },
      ],
    },
    {
      id: "contacts",
      title: "Contacts & Audience",
      badge: "Recipients",
      description: "Audience management, recipient lists, bulk CSV imports, and consent-aware E.164 phone numbering.",
      steps: [
        {
          id: "contacts-management",
          title: "Contact & Recipient Lists",
          badge: "Contacts",
          route: "/contacts",
          target: "[data-tour='contacts-list']",
          placement: "right",
          description: "Manage individual contacts or upload recipient batches for targeted campaigns. Phone numbers are validated against strict E.164 formatting standards with opt-in status tracked at the subscriber level.",
        },
      ],
    },
    {
      id: "knowledge",
      title: "Knowledge Base & RAG",
      badge: "Retrieval",
      description: "Tenant-scoped document indexing, chunking, and deterministic knowledge retrieval for voice and text journeys.",
      steps: [
        {
          id: "knowledge-rag",
          title: "Document Ingestion & Secure RAG",
          badge: "Knowledge Base",
          route: "/knowledge",
          target: "[data-tour='knowledge-upload']",
          placement: "right",
          description: "Upload policy documents, FAQs, and product terms. Documents are extracted, chunked, and indexed for sub-second retrieval. IVR nodes and voice assistants query this tenant-scoped knowledge base without data leakage across organizations.",
          diagram: "Document PDF/Text\n  ↓\nExtract / Chunk / Index\n  ↓\nDeterministic Retrieval\n  ↓\nIVR / Assistant Answer",
        },
      ],
    },
    {
      id: "ivr-builder",
      title: "Visual IVR Builder",
      badge: "Visual Canvas",
      description: "Design deterministic and AI-powered voice flows with Start, Greeting, Menu, Knowledge, Auth Gate, and Transfer nodes.",
      steps: [
        {
          id: "ivr-nodes",
          title: "Visual Flow Nodes",
          badge: "Flow Canvas",
          route: "/ivr-builder",
          target: "[data-tour='ivr-builder-canvas']",
          placement: "bottom",
          description: "Construct voice journeys using specialized node kinds: Start, Greeting, Menu (DTMF & speech aliases), Knowledge retrieval, Auth Gate (OTP/biometric), Human Transfer, External Action, and End Call. Predictable operations execute deterministically, while LLMs are invoked only when genuine open-ended reasoning is required.",
        },
      ],
    },
    {
      id: "ivr-validation",
      title: "IVR Validation & Publishing",
      badge: "Governance",
      description: "Flow graph validation, error diagnostics, review submission, and immutable published versioning.",
      steps: [
        {
          id: "ivr-publish-cycle",
          title: "Validation, Review & Immutability",
          badge: "Validation & Publishing",
          route: "/ivr-flows",
          target: "[data-tour='sidebar-ivr-flows']",
          placement: "right",
          description: "Every IVR draft is statically validated for unreachable nodes, loop bounds, and invalid transfers. Once approved, published flows become immutable artifacts bound to inbound phone profiles or outbound campaigns.",
          diagram: "Draft Flow → Validate → Review → Publish → Bind Deployment",
        },
      ],
    },
    {
      id: "inbound-voice-config",
      title: "Inbound Voice Telephony",
      badge: "Telephony",
      description: "Provider-neutral inbound telephony architecture supporting Twilio, Plivo, and Exotel.",
      steps: [
        {
          id: "inbound-telephony",
          title: "Inbound Webhooks & Phone Profiles",
          badge: "Inbound Webhooks",
          route: "/settings",
          target: "[data-tour='sidebar-settings']",
          placement: "right",
          description: "Incoming calls from Twilio, Plivo, or Exotel numbers arrive at normalized webhook endpoints. OmniIVR verifies cryptographic signatures, resolves the inbound phone profile, and executes the bound IVR flow with media streaming.",
          diagram: "Caller → Provider Number → Webhook → OmniIVR Flow → Media / Knowledge → Audio Output",
        },
      ],
    },
    {
      id: "inbound-journey",
      title: "Inbound Call Journey",
      badge: "Voice Flow",
      description: "Step-by-step lifecycle of an active customer call with speech, DTMF, knowledge lookup, and human handoff.",
      steps: [
        {
          id: "inbound-lifecycle",
          title: "Call Execution Lifecycle",
          badge: "Live Call",
          route: "/calls",
          target: "[data-tour='sidebar-calls']",
          placement: "right",
          description: "During a call, user voice input is transcribed, menu DTMF digits are evaluated, and knowledge nodes answer customer questions. If escalation is required, the call gracefully transfers to human agents within configured business hours.",
        },
      ],
    },
    {
      id: "campaign-creation",
      title: "Campaign Creation Wizard",
      badge: "Outreach",
      description: "Multi-channel campaign setup across Voice, SMS, and WhatsApp with audience selection and scheduling.",
      steps: [
        {
          id: "campaign-wizard",
          title: "OmniChannel Outreach Wizard",
          badge: "Campaign Wizard",
          route: "/campaigns",
          target: "[data-tour='campaign-list']",
          placement: "bottom",
          description: "Configure campaign name, audience segment, schedule, and outreach channels (Voice, SMS, WhatsApp). Provider routing is handled automatically at deployment level so campaign creators don't need to manage telecommunications infrastructure.",
        },
      ],
    },
    {
      id: "outbound-voice-campaign",
      title: "Outbound Voice Campaigns",
      badge: "Voice Broadcast",
      description: "Automated voice dialing with worker concurrency limits, pacing controls, and call outcome tracking.",
      steps: [
        {
          id: "outbound-campaign-execution",
          title: "Voice Dispatch & Worker Lifecycle",
          badge: "Worker Dispatch",
          route: "/campaigns",
          target: "[data-tour='campaign-list']",
          placement: "bottom",
          description: "Approved voice campaigns dispatch through background worker queues with plan-governed concurrency. Calls execute published IVR flows and record metrics for answer rate, speech completion, and transfer triggers.",
          diagram: "Campaign → Approval → Queue Worker → Telephony Provider → Customer Outcome",
        },
      ],
    },
    {
      id: "sms-configuration",
      title: "SMS Provider Architecture",
      badge: "SMS Providers",
      description: "Multi-provider SMS support across Twilio, Plivo, and Exotel with centralized status callbacks.",
      steps: [
        {
          id: "sms-provider-status",
          title: "Provider-Neutral SMS Infrastructure",
          badge: "SMS Providers",
          route: "/settings",
          target: "[data-tour='messaging-providers']",
          placement: "top",
          description: "OmniIVR supports Twilio, Plivo, and Exotel SMS adapters. The messaging registry checks supported, configured, enabled, and available states with zero credential exposure. The preferred provider is selected via deployment configuration.",
          diagram: "Campaign SMS → Messaging Registry → [Twilio | Plivo | Exotel] → Carrier",
        },
      ],
    },
    {
      id: "sms-campaign",
      title: "SMS Campaigns & Tracking",
      badge: "SMS Dispatch",
      description: "Transactional and broadcast SMS dispatch with recipient consent validation and delivery receipt tracking.",
      steps: [
        {
          id: "sms-dispatch-lifecycle",
          title: "SMS Delivery & Status Webhooks",
          badge: "SMS Lifecycle",
          route: "/campaigns",
          target: "[data-tour='campaign-list']",
          placement: "bottom",
          description: "Outbound SMS messages verify subscriber opt-in consent before dispatch. Delivery status updates (queued, sent, delivered, failed) are captured via centralized authenticated webhook callbacks.",
        },
      ],
    },
    {
      id: "whatsapp-configuration",
      title: "Meta WhatsApp Business",
      badge: "WhatsApp",
      description: "Official Meta WhatsApp Cloud API integration with approved templates, variables, and read receipts.",
      steps: [
        {
          id: "whatsapp-meta-config",
          title: "Meta WhatsApp Integration",
          badge: "Meta WhatsApp",
          route: "/settings",
          target: "[data-tour='messaging-providers']",
          placement: "top",
          description: "Configure Meta WhatsApp Business messaging with signed webhook verification. Support includes pre-approved template messages, dynamic parameter interpolation, opt-in/opt-out compliance, and read receipts.",
        },
      ],
    },
    {
      id: "whatsapp-campaign",
      title: "WhatsApp Campaigns",
      badge: "WhatsApp Broadcast",
      description: "Rich interactive WhatsApp message broadcast with template variable substitution and read receipts.",
      steps: [
        {
          id: "whatsapp-campaign-run",
          title: "WhatsApp Broadcast & Read Tracking",
          badge: "WhatsApp Lifecycle",
          route: "/campaigns",
          target: "[data-tour='campaign-list']",
          placement: "bottom",
          description: "WhatsApp campaigns dispatch approved business templates to opted-in subscribers. Track delivery rates, read receipts, and user engagement in realtime.",
        },
      ],
    },
    {
      id: "whatsapp-sms-fallback",
      title: "WhatsApp → SMS Fallback",
      badge: "Resilience",
      description: "Automatic graceful fallback from WhatsApp to SMS when delivery fails or WhatsApp is unavailable.",
      steps: [
        {
          id: "fallback-orchestration",
          title: "Graceful Channel Degradation",
          badge: "Fallback Flow",
          route: "/campaigns",
          target: "[data-tour='campaign-list']",
          placement: "bottom",
          description: "If a WhatsApp template fails delivery or the customer lacks WhatsApp connectivity, OmniIVR automatically falls back to SMS via the active SMS provider without modifying campaign business logic.",
          diagram: "WhatsApp Template Failed → Fallback Trigger → SMS Adapter → Delivered via SMS",
        },
      ],
    },
    {
      id: "voice-to-messaging",
      title: "Voice → SMS / WhatsApp Actions",
      badge: "Tool Gateway",
      description: "Live voice calls triggering automated SMS or WhatsApp messages via the Tool Gateway.",
      steps: [
        {
          id: "voice-messaging-tools",
          title: "In-Call Messaging Triggers",
          badge: "Tool Gateway",
          route: "/ivr-builder",
          target: "[data-tour='ivr-builder-canvas']",
          placement: "bottom",
          description: "When a caller asks for documentation, account statements, or payment links during an IVR call, the Tool Gateway confirms caller consent and dispatches an instant SMS or WhatsApp confirmation message.",
          diagram: "Caller: 'Send me the checklist' → Tool Consent Check → sendSms / sendWhatsApp → Instant Receipt",
        },
      ],
    },
    {
      id: "governance-maker-checker",
      title: "Maker / Checker Governance",
      badge: "Governance",
      description: "Dual-control authorization preventing campaign creators from approving their own campaigns.",
      steps: [
        {
          id: "governance-dual-control",
          title: "Enterprise Dual Control",
          badge: "Maker / Checker",
          route: "/approvals",
          target: "[data-tour='sidebar-approvals']",
          placement: "right",
          description: "Production campaigns require Maker/Checker dual control. The campaign creator (Maker) submits the campaign draft for review. An authorized Checker reviews parameters, audience size, and message content before granting approval for launch.",
          diagram: "Maker Submits → Checker Reviews → Approved → Authorized Launch",
        },
      ],
    },
    {
      id: "calls-recordings",
      title: "Calls & Audio Recordings",
      badge: "Call Audit",
      description: "Comprehensive call logging, audio recording playback, duration tracking, and RBAC security.",
      steps: [
        {
          id: "call-audit-playback",
          title: "Call Logs & Secure Playback",
          badge: "Call Recordings",
          route: "/calls/recordings",
          target: "[data-tour='calls-recordings']",
          placement: "bottom",
          description: "Inspect inbound and outbound call histories with detailed lifecycle events, provider identifiers, transcript snippets, and secure audio recording playback. Access is strictly partitioned by tenant and role.",
        },
      ],
    },
    {
      id: "analytics",
      title: "Analytics & Reporting",
      badge: "Analytics",
      description: "Cross-channel analytics across call volumes, campaign outcomes, SMS delivery, and WhatsApp engagement.",
      steps: [
        {
          id: "analytics-dashboards",
          title: "OmniChannel Performance Metrics",
          badge: "Analytics",
          route: "/analytics",
          target: "[data-tour='analytics-overview']",
          placement: "bottom",
          description: "Explore operational metrics across voice duration, transfer rates, IVR menu drop-offs, SMS delivery ratios, and WhatsApp read percentages with customizable date range filtering.",
        },
      ],
    },
    {
      id: "messaging-provider-settings",
      title: "Messaging Provider Settings",
      badge: "Provider Config",
      description: "Deployment diagnostics and status indicators for Twilio, Plivo, Exotel, and Meta WhatsApp.",
      steps: [
        {
          id: "provider-diagnostics-view",
          title: "Provider Health & Missing Config",
          badge: "Provider Settings",
          route: "/settings",
          target: "[data-tour='messaging-providers']",
          placement: "top",
          description: "Review runtime provider health, supported capabilities, active deployment status, and user-safe missing configuration variable names (e.g. PLIVO_SMS_FROM, EXOTEL_SMS_FROM) without exposing server secrets.",
        },
      ],
    },
    {
      id: "developer-integrations",
      title: "Developer & External Integrations",
      badge: "Integrations",
      description: "API keys, webhooks, and deterministic external integration endpoints for CRM and backend systems.",
      steps: [
        {
          id: "developer-api-integrations",
          title: "External Webhooks & Action Gateways",
          badge: "Developer Portal",
          route: "/developer",
          target: "[data-tour='developer-integrations']",
          placement: "bottom",
          description: "Register HTTPS external integration endpoints with action codes and authentication levels for IVR Action nodes (e.g. CRM lookups, order status, ticketing). Webhooks enforce strict SSRF protection and deterministic timeouts.",
        },
      ],
    },
    {
      id: "final-architecture",
      title: "Platform Architecture Summary",
      badge: "Summary",
      description: "One unified orchestration platform across all communication channels with complete provider independence.",
      steps: [
        {
          id: "architecture-summary",
          title: "One Orchestration Platform",
          badge: "Architecture Complete",
          route: "/dashboard",
          target: "[data-tour='dashboard-overview']",
          placement: "center",
          description: "You have completed the OmniIVR platform tour! OmniIVR orchestrates Voice, SMS, and WhatsApp journeys with deterministic reliability, tenant isolation, enterprise governance, and complete provider neutrality.",
          diagram: "Customer / Agent / Campaign\n       ↓\n    OmniIVR Orchestrator\n ┌─────┼──────┐\nVoice  SMS  WhatsApp\n   ↓    ↓      ↓\n[Twilio, Plivo, Exotel, Meta]\n       +\nKnowledge • AI • Governance • Analytics",
        },
      ],
    },
  ],
};

//--------------------------------------------------
// Focused Tour: Visual IVR Builder
//--------------------------------------------------

const IVR_BUILDER_TOUR: ProductTourDefinition = {
  mode: "IVR_BUILDER",
  title: "Visual IVR Builder Tour",
  description: "Learn how to build, validate, and publish deterministic and AI-powered voice journeys.",
  estimatedMinutes: 3,
  sections: [
    {
      id: "ivr-focus-canvas",
      title: "Visual Flow Canvas",
      description: "Construct voice flows with specialized node types.",
      steps: [
        {
          id: "ivr-focus-nodes",
          title: "Node Palette & Connection Logic",
          badge: "IVR Canvas",
          route: "/ivr-builder",
          target: "[data-tour='ivr-builder-canvas']",
          placement: "bottom",
          description: "Drag and connect Start, Greeting, Menu (DTMF + Speech), Knowledge RAG, Auth Gate, Human Transfer, and External Action nodes. Nodes execute deterministically, keeping latency low and outcomes predictable.",
        },
        {
          id: "ivr-focus-validation",
          title: "Flow Validation & Error Checks",
          badge: "Validation",
          route: "/ivr-flows",
          target: "[data-tour='sidebar-ivr-flows']",
          placement: "right",
          description: "Validate graph completeness, detect orphaned branches, check DTMF collision, and verify transfer destination configs before submitting for review.",
        },
        {
          id: "ivr-focus-publishing",
          title: "Immutable Publishing & Inbound Binding",
          badge: "Publishing",
          route: "/ivr-flows",
          target: "[data-tour='sidebar-ivr-flows']",
          placement: "right",
          description: "Published flows become immutable revision records ready to bind to inbound phone numbers or outbound campaign dialing profiles.",
        },
      ],
    },
  ],
};

//--------------------------------------------------
// Focused Tour: Inbound Voice Architecture
//--------------------------------------------------

const INBOUND_VOICE_TOUR: ProductTourDefinition = {
  mode: "INBOUND_VOICE",
  title: "Inbound Voice Telephony Tour",
  description: "Explore provider-neutral inbound telephony configuration, phone profiles, and media streaming.",
  estimatedMinutes: 3,
  sections: [
    {
      id: "inbound-focus-section",
      title: "Inbound Telephony Setup",
      description: "Mapping phone numbers to IVR flows across Twilio, Plivo, and Exotel.",
      steps: [
        {
          id: "inbound-profile-config",
          title: "Phone Numbers & Inbound Profiles",
          badge: "Phone Profiles",
          route: "/settings",
          target: "[data-tour='sidebar-settings']",
          placement: "right",
          description: "Bind your Twilio, Plivo, or Exotel phone numbers to specific inbound profiles with configured voice runtimes (Standard Cascaded or Premium Realtime Gemini Live).",
        },
        {
          id: "inbound-call-execution",
          title: "Inbound Call Routing & Recordings",
          badge: "Call Flow",
          route: "/calls",
          target: "[data-tour='sidebar-calls']",
          placement: "right",
          description: "Inbound calls execute the bound flow, answer questions with tenant knowledge, transfer to human queues when requested, and save audit recordings automatically.",
        },
      ],
    },
  ],
};

//--------------------------------------------------
// Focused Tour: Outbound Campaign Orchestration
//--------------------------------------------------

const OUTBOUND_CAMPAIGN_TOUR: ProductTourDefinition = {
  mode: "OUTBOUND_CAMPAIGN",
  title: "Outbound Campaign Tour",
  description: "Learn how to create, approve, and execute multi-channel campaigns with Maker/Checker governance.",
  estimatedMinutes: 3,
  sections: [
    {
      id: "outbound-focus-section",
      title: "Campaign Orchestration",
      description: "From campaign creation to approval and worker execution.",
      steps: [
        {
          id: "outbound-wizard-step",
          title: "Multi-Channel Campaign Setup",
          badge: "Campaign Wizard",
          route: "/campaigns",
          target: "[data-tour='campaign-list']",
          placement: "bottom",
          description: "Select channels (Voice, SMS, WhatsApp), attach recipient lists, configure dialing schedules, and bind published IVR flows.",
        },
        {
          id: "outbound-governance-step",
          title: "Maker / Checker Review & Approval",
          badge: "Governance",
          route: "/approvals",
          target: "[data-tour='sidebar-approvals']",
          placement: "right",
          description: "Strict dual control ensures campaigns cannot be launched without peer checker approval, protecting against unauthorized or misconfigured broadcasts.",
        },
      ],
    },
  ],
};

//--------------------------------------------------
// Focused Tour: SMS Messaging
//--------------------------------------------------

const SMS_TOUR: ProductTourDefinition = {
  mode: "SMS",
  title: "SMS Provider Architecture Tour",
  description: "Explore Twilio, Plivo, and Exotel SMS provider adapters, status models, and delivery callbacks.",
  estimatedMinutes: 2,
  sections: [
    {
      id: "sms-focus-section",
      title: "SMS Infrastructure",
      description: "Provider configuration and dispatch lifecycle.",
      steps: [
        {
          id: "sms-provider-matrix",
          title: "SMS Provider Status & Capability Matrix",
          badge: "SMS Configuration",
          route: "/settings",
          target: "[data-tour='messaging-providers']",
          placement: "top",
          description: "Inspect configured status, deployment enabled state, and capability descriptors for Twilio, Plivo, and Exotel SMS adapters.",
        },
      ],
    },
  ],
};

//--------------------------------------------------
// Focused Tour: WhatsApp Messaging
//--------------------------------------------------

const WHATSAPP_TOUR: ProductTourDefinition = {
  mode: "WHATSAPP",
  title: "WhatsApp Business Tour",
  description: "Learn about Meta WhatsApp Cloud API templates, variable substitution, and read tracking.",
  estimatedMinutes: 2,
  sections: [
    {
      id: "whatsapp-focus-section",
      title: "Meta WhatsApp Messaging",
      description: "Template management and delivery receipts.",
      steps: [
        {
          id: "whatsapp-meta-details",
          title: "Meta WhatsApp Templates & Webhooks",
          badge: "WhatsApp Business",
          route: "/settings",
          target: "[data-tour='messaging-providers']",
          placement: "top",
          description: "Configure Meta WhatsApp Business with verified webhook authentication, pre-approved templates, and read receipts.",
        },
      ],
    },
  ],
};

//--------------------------------------------------
// Focused Tour: Omnichannel Orchestration
//--------------------------------------------------

const OMNICHANNEL_TOUR: ProductTourDefinition = {
  mode: "OMNICHANNEL",
  title: "OmniChannel Orchestration Tour",
  description: "Explore Voice to SMS/WhatsApp tool actions, WhatsApp-to-SMS fallback, and unified dispatch.",
  estimatedMinutes: 3,
  sections: [
    {
      id: "omnichannel-focus-section",
      title: "Cross-Channel Integration",
      description: "Seamless transitions between Voice, SMS, and WhatsApp.",
      steps: [
        {
          id: "omnichannel-tool-gateway",
          title: "In-Call Messaging Triggers",
          badge: "Tool Gateway",
          route: "/ivr-builder",
          target: "[data-tour='ivr-builder-canvas']",
          placement: "bottom",
          description: "Voice IVR calls trigger automated SMS or WhatsApp messages when callers request documents or information.",
        },
        {
          id: "omnichannel-fallback",
          title: "Automatic WhatsApp → SMS Fallback",
          badge: "Fallback Flow",
          route: "/campaigns",
          target: "[data-tour='campaign-list']",
          placement: "bottom",
          description: "When WhatsApp delivery fails or is unconfigured, OmniIVR gracefully cascades to SMS via the active SMS provider.",
        },
      ],
    },
  ],
};

//--------------------------------------------------
// Focused Tour: Analytics & Reporting
//--------------------------------------------------

const ANALYTICS_TOUR: ProductTourDefinition = {
  mode: "ANALYTICS",
  title: "Analytics & Telemetry Tour",
  description: "Review call metrics, campaign delivery rates, transfer frequencies, and duration statistics.",
  estimatedMinutes: 2,
  sections: [
    {
      id: "analytics-focus-section",
      title: "Analytics Dashboards",
      description: "Realtime and aggregate reporting.",
      steps: [
        {
          id: "analytics-metrics-overview",
          title: "Operational Analytics Overview",
          badge: "Analytics",
          route: "/analytics",
          target: "[data-tour='analytics-overview']",
          placement: "bottom",
          description: "Analyze call volumes, duration distributions, SMS delivery receipts, WhatsApp read rates, and IVR transfer stats.",
        },
      ],
    },
  ],
};

//--------------------------------------------------
// Focused Tour: DemoBank Guided Loan Journey Demo
//--------------------------------------------------

const DEMOBANK_TOUR: ProductTourDefinition = {
  mode: "DEMOBANK",
  title: "DemoBank Guided Loan Journey Demo",
  description: "Follow a complete customer loan application journey across Contacts, Knowledge RAG, Adaptive IVR, Outbound Broadcast, WhatsApp with SMS fallback, and Call Recording.",
  estimatedMinutes: 5,
  sections: [
    {
      id: "demobank-leads",
      title: "Step 1: Lead Capture & Contacts",
      badge: "DemoBank Journey",
      description: "DemoBank receives loan leads and imports recipient contacts.",
      steps: [
        {
          id: "demobank-step-contacts",
          title: "DemoBank: Importing Loan Applicants",
          badge: "Step 1 of 7",
          route: "/contacts",
          target: "[data-tour='contacts-list']",
          placement: "right",
          description: "DemoBank imports pre-approved loan applicant lists with validated phone numbers and consent metadata.",
        },
      ],
    },
    {
      id: "demobank-knowledge",
      title: "Step 2: Attaching Loan Knowledge",
      badge: "DemoBank Journey",
      description: "Attaching personal loan interest rates and document checklists.",
      steps: [
        {
          id: "demobank-step-knowledge",
          title: "DemoBank: Loan Policy & FAQ Ingestion",
          badge: "Step 2 of 7",
          route: "/knowledge",
          target: "[data-tour='knowledge-upload']",
          placement: "right",
          description: "DemoBank's loan criteria, EMI calculators, and required document checklists are indexed in the secure Knowledge Base for real-time IVR answers.",
        },
      ],
    },
    {
      id: "demobank-ivr",
      title: "Step 3: Adaptive Loan IVR",
      badge: "DemoBank Journey",
      description: "Configuring the DemoBank personal loan flow with knowledge and transfer nodes.",
      steps: [
        {
          id: "demobank-step-ivr",
          title: "DemoBank: Visual Loan Journey Flow",
          badge: "Step 3 of 7",
          route: "/ivr-builder",
          target: "[data-tour='ivr-builder-canvas']",
          placement: "bottom",
          description: "The DemoBank flow greets the caller, offers DTMF and speech options ('Check EMI', 'Required Documents', 'Speak with Loan Officer'), and queries the loan knowledge base dynamically.",
        },
      ],
    },
    {
      id: "demobank-campaign",
      title: "Step 4: Outbound Campaign Setup",
      badge: "DemoBank Journey",
      description: "Setting up the DemoBank Personal Loan Pre-Approval Campaign.",
      steps: [
        {
          id: "demobank-step-campaign",
          title: "DemoBank: Multi-Channel Outreach",
          badge: "Step 4 of 7",
          route: "/campaigns",
          target: "[data-tour='campaign-list']",
          placement: "bottom",
          description: "DemoBank creates an outreach campaign selecting Voice, WhatsApp, and SMS with fallback enabled.",
        },
      ],
    },
    {
      id: "demobank-governance",
      title: "Step 5: Governance Approval",
      badge: "DemoBank Journey",
      description: "Loan supervisor reviews and approves the pre-approval campaign.",
      steps: [
        {
          id: "demobank-step-approvals",
          title: "DemoBank: Maker / Checker Sign-Off",
          badge: "Step 5 of 7",
          route: "/approvals",
          target: "[data-tour='sidebar-approvals']",
          placement: "right",
          description: "The campaign manager submits the batch and a compliance officer reviews audience count and disclosures before authorizing dispatch.",
        },
      ],
    },
    {
      id: "demobank-dispatch",
      title: "Step 6: Omnichannel Engagement & Fallback",
      badge: "DemoBank Journey",
      description: "Dispatching WhatsApp message, fallback to SMS, and voice engagement.",
      steps: [
        {
          id: "demobank-step-dispatch",
          title: "DemoBank: WhatsApp First with SMS Fallback",
          badge: "Step 6 of 7",
          route: "/calls/recordings",
          target: "[data-tour='calls-recordings']",
          placement: "bottom",
          description: "Applicants receive loan notifications on WhatsApp. If WhatsApp delivery fails, SMS delivers instantly. When callers dial in, the IVR answers loan queries and triggers an instant checklist SMS.",
        },
      ],
    },
    {
      id: "demobank-analytics",
      title: "Step 7: Analytics & Reporting",
      badge: "DemoBank Journey",
      description: "Reviewing loan campaign conversion, answer rates, and messaging delivery receipts.",
      steps: [
        {
          id: "demobank-step-analytics",
          title: "DemoBank: Campaign Conversion Results",
          badge: "Step 7 of 7",
          route: "/analytics",
          target: "[data-tour='analytics-overview']",
          placement: "bottom",
          description: "DemoBank executives track conversion rates, completed loan inquiries, average call duration, and delivery metrics across all three channels in unified dashboards.",
        },
      ],
    },
  ],
};

//--------------------------------------------------
// Master Tour Registry Map
//--------------------------------------------------

export const PRODUCT_TOURS: Record<ProductTourMode, ProductTourDefinition> = {
  FULL_PLATFORM: FULL_PLATFORM_TOUR,
  IVR_BUILDER: IVR_BUILDER_TOUR,
  INBOUND_VOICE: INBOUND_VOICE_TOUR,
  OUTBOUND_CAMPAIGN: OUTBOUND_CAMPAIGN_TOUR,
  SMS: SMS_TOUR,
  WHATSAPP: WHATSAPP_TOUR,
  OMNICHANNEL: OMNICHANNEL_TOUR,
  ANALYTICS: ANALYTICS_TOUR,
  DEMOBANK: DEMOBANK_TOUR,
};

export function getProductTour(mode: ProductTourMode): ProductTourDefinition {
  return PRODUCT_TOURS[mode] ?? FULL_PLATFORM_TOUR;
}
