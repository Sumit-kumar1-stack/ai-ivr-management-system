export enum AppEvent {

  //-----------------------------------
  // Call Lifecycle
  //-----------------------------------

  CALL_STARTED = "call.started",

  CALL_RINGING = "call.ringing",

  CALL_ANSWERED = "call.answered",

  CALL_COMPLETED = "call.completed",

  CALL_FAILED = "call.failed",

  //-----------------------------------
  // Conversation
  //-----------------------------------

  CONVERSATION_STARTED = "conversation.started",

  CONVERSATION_MESSAGE = "conversation.message",

  CONVERSATION_SUMMARY = "conversation.summary",

  CONVERSATION_ANALYSIS = "conversation.analysis",

  //-----------------------------------
  // Voice States
  //-----------------------------------

  VOICE_LISTENING = "voice.listening",

  VOICE_THINKING = "voice.thinking",

  VOICE_SPEAKING = "voice.speaking",

  VOICE_INTERRUPTED = "voice.interrupted",

  VOICE_COMPLETED = "voice.completed",

  //-----------------------------------
  // Dashboard
  //-----------------------------------

  DASHBOARD_UPDATED = "dashboard.updated",

  DASHBOARD_METRICS = "dashboard.metrics",

  DASHBOARD_TIMELINE = "dashboard.timeline",

  ACTIVE_CALL_UPDATED = "dashboard.active-call",

  //-----------------------------------
  // Metrics
  //-----------------------------------

  METRICS_UPDATED = "metrics.updated",

  AUDIO_CONNECTED="audio.connected",

  AUDIO_DISCONNECTED="audio.disconnected",

  AUDIO_CHUNK_RECEIVED="audio.chunk.received",

  AUDIO_CHUNK_SENT="audio.chunk.sent",

}