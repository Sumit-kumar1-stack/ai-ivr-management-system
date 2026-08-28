export enum AppEvent {
  //-----------------------------------
  // Call Lifecycle
  //-----------------------------------

  CALL_STARTED =
    "call.started",

  CALL_CREATED =
    "call.created",

  CALL_RINGING =
    "call.ringing",

  CALL_ANSWERED =
    "call.answered",

  CALL_COMPLETED =
    "call.completed",

  CALL_TERMINATED =
    "call.terminated",

  CALL_FAILED =
    "call.failed",

  //-----------------------------------
  // Conversation
  //-----------------------------------

  CONVERSATION_STARTED =
    "conversation.started",

  CONVERSATION_MESSAGE =
    "conversation.message",

  CONVERSATION_SUMMARY =
    "conversation.summary",

  CONVERSATION_ANALYSIS =
    "conversation.analysis",

  INTENT_DETECTED =
    "intent.detected",

  //-----------------------------------
  // Voice States
  //-----------------------------------

  VOICE_LISTENING =
    "voice.listening",

  VOICE_THINKING =
    "voice.thinking",

  VOICE_SPEAKING =
    "voice.speaking",

  VOICE_INTERRUPTED =
    "voice.interrupted",

  VOICE_COMPLETED =
    "voice.completed",

  //-----------------------------------
  // Dashboard
  //-----------------------------------

  DASHBOARD_UPDATED =
    "dashboard.updated",

  DASHBOARD_METRICS =
    "dashboard.metrics",

  DASHBOARD_TIMELINE =
    "dashboard.timeline",

  ACTIVE_CALL_UPDATED =
    "dashboard.active-call",

  //-----------------------------------
  // Metrics
  //-----------------------------------

  METRICS_UPDATED =
    "metrics.updated",

  //-----------------------------------
  // Audio
  //-----------------------------------

  AUDIO_CONNECTED =
    "audio.connected",

  AUDIO_DISCONNECTED =
    "audio.disconnected",

  AUDIO_CHUNK_RECEIVED =
    "audio.chunk.received",

  AUDIO_CHUNK_SENT =
    "audio.chunk.sent",

  //-----------------------------------
  // Security / Audit
  //-----------------------------------

  CAMPAIGN_SELECTED =
    "audit.campaign_selected",

  CUSTOMER_MATCHED =
    "audit.customer_matched",

  AI_SESSION_STARTED =
    "audit.ai_session_started",

  RAG_QUERY =
    "audit.rag_query",

  DOCUMENT_ACCESSED =
    "audit.document_accessed",

  AUTH_REQUESTED =
    "audit.auth_requested",

  AUTH_SUCCEEDED =
    "audit.auth_succeeded",

  AUTH_FAILED =
    "audit.auth_failed",

  ACTION_REQUESTED =
    "audit.action_requested",

  POLICY_ALLOWED =
    "audit.policy_allowed",

  POLICY_DENIED =
    "audit.policy_denied",

  ACTION_EXECUTED =
    "audit.action_executed",

  ACTION_FAILED =
    "audit.action_failed",

  FALLBACK_TRIGGERED =
    "audit.fallback_triggered",

  PROVIDER_CHANGED =
    "audit.provider_changed",

  HUMAN_TRANSFER =
    "audit.human_transfer",

  KNOWLEDGE_DOCUMENT_ARCHIVED =
    "knowledge.document.archived",

  KNOWLEDGE_DOCUMENT_DELETED =
    "knowledge.document.deleted",

  KNOWLEDGE_DOCUMENT_ATTACHED =
    "knowledge.document.attached",

  KNOWLEDGE_DOCUMENT_DETACHED =
    "knowledge.document.detached",
}

const appEventValues =
  new Set<string>(
    Object.values(
      AppEvent
    )
  );

/**
 * Runtime validation for values arriving from
 * JavaScript, external adapters or unsafe casts.
 */
export function isAppEvent(
  value: unknown
): value is AppEvent {
  return (
    typeof value === "string" &&
    appEventValues.has(value)
  );
}

const auditAppEvents = new Set<AppEvent>([
  AppEvent.CALL_CREATED,
  AppEvent.CALL_TERMINATED,
  AppEvent.CAMPAIGN_SELECTED,
  AppEvent.CUSTOMER_MATCHED,
  AppEvent.AI_SESSION_STARTED,
  AppEvent.INTENT_DETECTED,
  AppEvent.RAG_QUERY,
  AppEvent.DOCUMENT_ACCESSED,
  AppEvent.AUTH_REQUESTED,
  AppEvent.AUTH_SUCCEEDED,
  AppEvent.AUTH_FAILED,
  AppEvent.ACTION_REQUESTED,
  AppEvent.POLICY_ALLOWED,
  AppEvent.POLICY_DENIED,
  AppEvent.ACTION_EXECUTED,
  AppEvent.ACTION_FAILED,
  AppEvent.FALLBACK_TRIGGERED,
  AppEvent.PROVIDER_CHANGED,
  AppEvent.HUMAN_TRANSFER,
  AppEvent.KNOWLEDGE_DOCUMENT_ARCHIVED,
  AppEvent.KNOWLEDGE_DOCUMENT_DELETED,
  AppEvent.KNOWLEDGE_DOCUMENT_ATTACHED,
  AppEvent.KNOWLEDGE_DOCUMENT_DETACHED,
]);

export function isAuditAppEvent(
  value: AppEvent
): boolean {
  return auditAppEvents.has(value);
}
