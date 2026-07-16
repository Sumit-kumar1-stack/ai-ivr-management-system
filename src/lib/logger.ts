import pino from "pino";

const isDevelopment =
  process.env.NODE_ENV !== "production";

export const Logger = pino({
  level: process.env.LOG_LEVEL || "info",

  transport: isDevelopment
    ? {
        target: "pino-pretty",
        options: {
          colorize: true,
          translateTime: "SYS:standard",
          ignore: "pid,hostname",
        },
      }
    : undefined,

  base: {
    service: "ai-ivr-management-system",
  },

  timestamp: pino.stdTimeFunctions.isoTime,
});

export function createRequestLogger(
  requestId: string
) {
  return Logger.child({
    requestId,
  });
}

export function createCallLogger(
  callId: string
) {
  return Logger.child({
    callId,
  });
}

export function createConversationLogger(
  conversationId: string
) {
  return Logger.child({
    conversationId,
  });
}