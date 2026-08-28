import type { IncomingMessage, Server as HttpServer } from "http";
import type { Duplex } from "stream";
import { timingSafeEqual } from "node:crypto";
import { WebSocket, WebSocketServer, type RawData } from "ws";
import { getExotelEnvironment } from "@/config/env";
import { createCallLogger, createServerLogger, normalizeError } from "@/lib/logger";
import { AudioSessionService } from "@/providers/telephony/audio-session.service";
import { ExotelStreamGateway } from "@/providers/telephony/exotel-stream.gateway";
import { ConversationAbort } from "@/services/conversations/abort.service";
import { ConversationStateService } from "@/services/conversations/conversation-state.service";
import { SilenceDetector } from "@/services/conversations/silence-detector.service";
import { STTProviderFactory } from "@/services/stt/providers/provider.factory";
import { GeminiLiveMediaService } from "@/services/voice/gemini-live-media.service";
import { VoiceWorker } from "@/services/voice/voice-worker.service";
import { canAcceptMediaStreams } from "./media-lifecycle";

const log = createServerLogger("exotel-websocket");
const servers = new WeakMap<HttpServer, WebSocketServer>();

export function initializeExotelWebSocket(server: HttpServer): WebSocketServer {
  const existing = servers.get(server);
  if (existing) return existing;
  const socketServer = new WebSocketServer({ noServer: true, perMessageDeflate: false, clientTracking: true });
  servers.set(server, socketServer);

  server.on("upgrade", (request: IncomingMessage, socket: Duplex, head: Buffer) => {
    const url = new URL(request.url ?? "/", "http://localhost");
    if (url.pathname !== "/api/exotel/stream") return;
    if (!canAcceptMediaStreams()) return rejectUpgrade(socket, 503, "Media server is draining");
    if (!validBasicAuthentication(request)) {
      log.warn({ event: "exotel.media.upgrade_rejected", reason: "authentication_failed" }, "Exotel AgentStream upgrade rejected");
      return rejectUpgrade(socket, 403, "Forbidden");
    }
    socketServer.handleUpgrade(request, socket, head, webSocket => socketServer.emit("connection", webSocket, request));
  });

  socketServer.on("connection", (socket: WebSocket) => {
    let streamSid: string | undefined;
    let messageChain = Promise.resolve();
    log.info({ event: "exotel.media.connected", connectedClients: socketServer.clients.size }, "Exotel AgentStream connected");
    socket.on("message", (data: RawData) => {
      const raw = rawDataToString(data);
      messageChain = messageChain.then(async () => {
        const parsed = safeParse(raw);
        streamSid = parsed?.start?.stream_sid ?? parsed?.stream_sid ?? streamSid;
        await ExotelStreamGateway.handle(socket, raw);
      }).catch(error => log.error({ event: "exotel.media.failed", error: normalizeError(error) }, "Exotel AgentStream message failed"));
    });
    socket.on("close", (code: number) => { void cleanup(streamSid, `close_${code}`); });
    socket.on("error", () => { void cleanup(streamSid, "socket_error"); });
  });
  server.once("close", () => {
    servers.delete(server);
    socketServer.close();
  });
  return socketServer;
}

async function cleanup(streamSid: string | undefined, reason: string): Promise<void> {
  if (!streamSid) return;
  const session = AudioSessionService.get(streamSid);
  if (!session) return;
  const logForCall = createCallLogger(session.callId);
  try {
    if (session.voiceRuntime === "GEMINI_LIVE") GeminiLiveMediaService.close(session.callId);
    else await STTProviderFactory.get().disconnect(session.callId);
  } catch (error) {
    logForCall.warn({ event: "exotel.media.cleanup_runtime_failed", reason, error: normalizeError(error) }, "Exotel media runtime cleanup failed");
  } finally {
    ConversationAbort.abort(session.callId);
    SilenceDetector.stop(session.callId);
    ConversationStateService.setState(session.callId, "ENDED");
    VoiceWorker.stop(session.callId);
    AudioSessionService.close(streamSid);
    ConversationAbort.clear(session.callId);
    ConversationStateService.clearState(session.callId);
    logForCall.info({ event: "exotel.media.closed", reason, durationMs: 0 }, "Exotel AgentStream closed");
  }
}

function validBasicAuthentication(request: IncomingMessage): boolean {
  const config = getExotelEnvironment();
  if (!config.streamUsername || !config.streamPassword) return false;
  const header = request.headers.authorization;
  if (!header?.startsWith("Basic ")) return false;
  const expected = Buffer.from(`${config.streamUsername}:${config.streamPassword}`);
  const supplied = Buffer.from(header.slice(6), "base64");
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

function rejectUpgrade(socket: Duplex, status: number, message: string): void { socket.write(`HTTP/1.1 ${status} ${message}\r\nConnection: close\r\n\r\n`); socket.destroy(); }
function rawDataToString(value: RawData): string { return Buffer.isBuffer(value) ? value.toString("utf8") : Array.isArray(value) ? Buffer.concat(value).toString("utf8") : Buffer.from(value).toString("utf8"); }
function safeParse(value: string): { stream_sid?: string; start?: { stream_sid?: string } } | null { try { return JSON.parse(value) as { stream_sid?: string; start?: { stream_sid?: string } }; } catch { return null; } }
