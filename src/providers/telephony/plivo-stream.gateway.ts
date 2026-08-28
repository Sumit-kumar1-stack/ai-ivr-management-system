import { WebSocket } from "ws";
import { createServerLogger, normalizeError } from "@/lib/logger";
import { AudioSessionService } from "./audio-session.service";
import { TwilioStreamGateway } from "./twilio-stream.gateway";

type PlivoEvent = {
  event?: string;
  streamId?: string;
  stream_id?: string;
  callId?: string;
  callUUID?: string;
  call_uuid?: string;
  start?: {
    callId?: string;
    callUUID?: string;
    callUuid?: string;
    call_id?: string;
    streamId?: string;
    stream_id?: string;
    mediaFormat?: { encoding?: string; sampleRate?: number | string };
  };
  media?: { payload?: string };
};

type RegisteredPlivoStream = { streamId: string; internalCallId: string; providerCallId: string };

const log = createServerLogger("plivo-stream-gateway");
const streams = new WeakMap<WebSocket, RegisteredPlivoStream>();

/** Plivo protocol adapter over the established shared audio/session runtime. */
export class PlivoStreamGateway {
  static async handle(socket: WebSocket, rawMessage: string, internalCallId: string): Promise<void> {
    let event: PlivoEvent;
    try { event = JSON.parse(rawMessage) as PlivoEvent; } catch (error) {
      log.warn({ event: "plivo.stream.rejected", reason: "invalid_json", error: normalizeError(error) }, "Invalid Plivo stream message");
      return;
    }

    try {
      if (event.event === "connected") {
        log.info({ event: "plivo.stream.connected", internalCallIdPresent: Boolean(internalCallId) }, "Plivo stream connected event received");
        return;
      }
      if (event.event === "start") return await this.handleStart(socket, event, internalCallId);
      if (event.event === "media") return await this.handleMedia(socket, event);
      if (event.event === "dtmf") {
        // This is deliberately not routed. Plivo's documented Audio Stream
        // protocol does not expose an inbound DTMF frame for a bidirectional
        // stream, so accepting one would advertise unsupported live behavior.
        log.warn({ event: "plivo.stream.dtmf_unsupported" }, "Ignoring unsupported Plivo stream DTMF frame");
        return;
      }
      if (event.event === "stop") return await this.handleStop(socket, event);
      log.debug({ event: "plivo.stream.event_ignored", eventType: event.event ?? null }, "Unknown Plivo stream event ignored");
    } catch (error) {
      log.error({ event: "plivo.stream.failed", error: normalizeError(error) }, "Plivo media event processing failed");
      socket.close(1011, "Media processing failed");
    }
  }

  private static async handleStart(socket: WebSocket, event: PlivoEvent, internalCallId: string): Promise<void> {
    const streamId = firstValue(event.start?.streamId, event.start?.stream_id, event.streamId, event.stream_id);
    // The current Plivo protocol uses start.callId (not callUUID).
    const providerCallId = firstValue(event.start?.callId, event.callId, event.start?.callUUID, event.start?.callUuid, event.start?.call_id, event.callUUID, event.call_uuid);
    const format = event.start?.mediaFormat;
    log.info({ event: "plivo.stream.start_received", internalCallIdPresent: Boolean(internalCallId), streamIdPresent: Boolean(streamId), providerCallIdPresent: Boolean(providerCallId), mediaEncoding: format?.encoding ?? null, mediaSampleRate: format?.sampleRate ?? null }, "Plivo stream start event received");

    if (!streamId || !providerCallId) {
      log.warn({ event: "plivo.stream.start_rejected", reason: !streamId ? "missing_stream_id" : "missing_provider_call_id", internalCallIdPresent: Boolean(internalCallId) }, "Plivo stream start is missing required identifiers");
      socket.close(1008, "Missing Plivo stream identifiers");
      return;
    }
    if (format && (format.encoding !== "audio/x-mulaw" || Number(format.sampleRate) !== 8000)) {
      log.warn({ event: "plivo.stream.start_rejected", reason: "unsupported_media_format", mediaEncoding: format.encoding ?? null, mediaSampleRate: format.sampleRate ?? null }, "Plivo stream start used an unsupported media format");
      socket.close(1008, "Expected mu-law audio at 8000 Hz");
      return;
    }
    const existing = streams.get(socket);
    if (existing && existing.streamId === streamId && existing.internalCallId === internalCallId) {
      log.debug({ event: "plivo.stream.start_ignored", reason: "duplicate_start", streamIdPresent: true }, "Duplicate Plivo stream start ignored");
      return;
    }

    await TwilioStreamGateway.handle(transportSocket(socket, { internalCallId, streamId }), JSON.stringify({ event: "start", streamSid: streamId, start: { streamSid: streamId, callSid: providerCallId, customParameters: { callId: internalCallId, twilioCallSid: providerCallId } } }));
    const session = AudioSessionService.get(streamId);
    if (!session || session.callId !== internalCallId) {
      log.warn({ event: "plivo.stream.start_rejected", reason: "shared_session_not_registered", streamIdPresent: true, internalCallIdPresent: Boolean(internalCallId) }, "Plivo stream could not register a shared audio session");
      socket.close(1011, "Unable to register media session");
      return;
    }

    streams.set(socket, { streamId, internalCallId, providerCallId });
    log.info({ event: "plivo.stream.session_registered", internalCallId, providerCallIdPresent: true, streamIdPresent: true, requestedRuntime: session.requestedRuntime, effectiveRuntime: session.effectiveRuntime }, "Plivo stream registered with the shared audio runtime");
  }

  private static async handleMedia(socket: WebSocket, event: PlivoEvent): Promise<void> {
    const registered = streams.get(socket);
    const streamId = firstValue(event.streamId, event.stream_id);
    const payload = event.media?.payload?.trim() ?? "";
    if (!registered || !streamId || registered.streamId !== streamId || !payload || !isValidBase64(payload)) {
      log.warn({ event: "plivo.stream.media_rejected", reason: !registered ? "start_not_registered" : !streamId || registered.streamId !== streamId ? "stream_id_mismatch" : "invalid_payload", streamIdPresent: Boolean(streamId) }, "Plivo media was received before a valid stream start");
      return;
    }
    log.debug({ event: "plivo.stream.media_received", internalCallId: registered.internalCallId, streamIdPresent: true, audioSizeBytes: Buffer.from(payload, "base64").length }, "Plivo media received");
    await TwilioStreamGateway.handle(transportSocket(socket, registered), JSON.stringify({ event: "media", streamSid: registered.streamId, media: { payload } }));
    log.debug({ event: "plivo.stream.media_forwarded", internalCallId: registered.internalCallId, streamIdPresent: true }, "Plivo media forwarded to shared audio runtime");
  }

  private static async handleStop(socket: WebSocket, event: PlivoEvent): Promise<void> {
    const registered = streams.get(socket);
    const streamId = firstValue(event.streamId, event.stream_id) ?? registered?.streamId;
    if (!registered || !streamId || registered.streamId !== streamId) {
      log.warn({ event: "plivo.stream.stop_ignored", reason: "start_not_registered", streamIdPresent: Boolean(streamId) }, "Plivo stop was received without a registered stream");
      return;
    }
    log.info({ event: "plivo.stream.stop_received", internalCallId: registered.internalCallId, streamIdPresent: true }, "Plivo stream stop received");
    await this.closeRegisteredStream(socket, registered, "stop_event");
  }

  /** Cleans up a live runtime when Plivo closes the WebSocket without a stop event. */
  static async close(socket: WebSocket, code: number, reason: string): Promise<void> {
    const registered = streams.get(socket);
    log.info({ event: "plivo.stream.closed", closeCode: code, closeReasonPresent: Boolean(reason), closeReasonLength: reason.length, sessionRegistered: Boolean(registered), internalCallId: registered?.internalCallId ?? null, streamIdPresent: Boolean(registered?.streamId) }, "Plivo stream WebSocket closed");
    if (!registered) return;
    await this.closeRegisteredStream(socket, registered, "socket_close");
  }

  private static async closeRegisteredStream(socket: WebSocket, registered: RegisteredPlivoStream, source: "stop_event" | "socket_close"): Promise<void> {
    try {
      await TwilioStreamGateway.handle(transportSocket(socket, registered), JSON.stringify({ event: "stop", streamSid: registered.streamId }));
      log.info({ event: "plivo.stream.session_cleaned_up", internalCallId: registered.internalCallId, streamIdPresent: true, source }, "Plivo stream runtime cleaned up");
    } finally {
      streams.delete(socket);
    }
  }
}

function firstValue(...inputs: unknown[]): string | null { for (const input of inputs) { if (typeof input === "string" && input.trim()) return input.trim(); } return null; }
function isValidBase64(value: string): boolean { return value.length > 0 && value.length % 4 !== 1 && /^[A-Za-z0-9+/]*={0,2}$/.test(value); }

function transportSocket(socket: WebSocket, stream?: Pick<RegisteredPlivoStream, "internalCallId" | "streamId">): WebSocket {
  const wrapped = Object.create(socket) as WebSocket;
  wrapped.send = ((data: unknown, ...args: unknown[]) => {
    try {
      if (socket.readyState !== WebSocket.OPEN) {
        log.debug({ event: "plivo.stream.play_audio_discarded", reason: "socket_not_open", streamIdPresent: Boolean(stream?.streamId) }, "Discarding Plivo output after socket close");
        return;
      }
      const parsed = typeof data === "string" ? JSON.parse(data) as { event?: string; streamSid?: string; media?: { payload?: string } } : null;
      if (parsed?.event === "media") {
        const payload = parsed.media?.payload ?? "";
        log.debug({ event: "plivo.stream.play_audio_sent", internalCallId: stream?.internalCallId ?? null, streamIdPresent: Boolean(stream?.streamId), payloadBytes: Buffer.from(payload, "base64").length, contentType: "audio/x-mulaw", sampleRate: 8000 }, "Plivo playAudio frame sent");
        return (socket.send as (...sendArgs: unknown[]) => void)(JSON.stringify({ event: "playAudio", media: { contentType: "audio/x-mulaw", sampleRate: 8000, payload } }), ...args);
      }
      if (parsed?.event === "clear") return (socket.send as (...sendArgs: unknown[]) => void)(JSON.stringify({ event: "clearAudio", streamId: parsed.streamSid }), ...args);
      return (socket.send as (...sendArgs: unknown[]) => void)(data, ...args);
    } catch { return (socket.send as (...sendArgs: unknown[]) => void)(data, ...args); }
  }) as WebSocket["send"];
  return wrapped;
}
