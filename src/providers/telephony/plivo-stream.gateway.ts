import { WebSocket } from "ws";
import { createServerLogger, normalizeError } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { AudioSessionService } from "./audio-session.service";
import { TwilioStreamGateway } from "./twilio-stream.gateway";

type PlivoEvent = {
  event?: string;
  streamId?: string;
  stream_id?: string;
  streamSid?: string;
  callId?: string;
  callUUID?: string;
  callUuid?: string;
  call_id?: string;
  call_uuid?: string;
  digit?: string;
  digits?: string;
  dtmf?: {
    digit?: string;
    digits?: string;
  };
  start?: {
    callId?: string;
    callUUID?: string;
    callUuid?: string;
    call_id?: string;
    call_uuid?: string;
    streamId?: string;
    stream_id?: string;
    streamSid?: string;
    mediaFormat?: { encoding?: string; sampleRate?: number | string };
  };
  media?: { payload?: string };
};

type RegisteredPlivoStream = { streamId: string; internalCallId: string; providerCallId: string };

interface PlivoSocketState {
  registered: RegisteredPlivoStream | null;
  starting: boolean;
  preStartMediaQueue: Array<{ payload: string; streamId: string }>;
}

const MAX_PRE_START_MEDIA_FRAMES = 50;

const log = createServerLogger("plivo-stream-gateway");
const socketStates = new WeakMap<WebSocket, PlivoSocketState>();

function getSocketState(socket: WebSocket): PlivoSocketState {
  let state = socketStates.get(socket);
  if (!state) {
    state = { registered: null, starting: false, preStartMediaQueue: [] };
    socketStates.set(socket, state);
  }
  return state;
}

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
        log.info({
          event: "plivo.stream.connected",
          internalCallIdPresent: Boolean(internalCallId),
          topLevelKeys: Object.keys(event),
        }, "Plivo stream connected event received");
        return;
      }
      if (event.event === "start") return await this.handleStart(socket, event, internalCallId);
      if (event.event === "media") return await this.handleMedia(socket, event, internalCallId);
      if (event.event === "dtmf") return await this.handleDtmf(socket, event, internalCallId);
      if (event.event === "stop") return await this.handleStop(socket, event);
      log.debug({ event: "plivo.stream.event_ignored", eventType: event.event ?? null }, "Unknown Plivo stream event ignored");
    } catch (error) {
      log.error({ event: "plivo.stream.failed", error: normalizeError(error) }, "Plivo media event processing failed");
      socket.close(1011, "Media processing failed");
    }
  }

  private static async handleStart(socket: WebSocket, event: PlivoEvent, internalCallId: string): Promise<void> {
    const state = getSocketState(socket);
    state.starting = true;

    const streamId = firstValue(
      event.start?.streamId,
      event.start?.stream_id,
      event.start?.streamSid,
      event.streamId,
      event.stream_id,
      event.streamSid
    );
    let providerCallId = firstValue(
      event.start?.callId,
      event.start?.callUUID,
      event.start?.callUuid,
      event.start?.call_id,
      event.start?.call_uuid,
      event.callId,
      event.callUUID,
      event.callUuid,
      event.call_id,
      event.call_uuid
    );

    if (!providerCallId && internalCallId) {
      try {
        const call = await prisma.call.findUnique({
          where: { id: internalCallId },
          select: { providerCallId: true },
        });
        providerCallId = call?.providerCallId ?? internalCallId;
      } catch {
        providerCallId = internalCallId;
      }
    }

    const format = event.start?.mediaFormat;
    log.info({
      event: "plivo.stream.start_received",
      internalCallIdPresent: Boolean(internalCallId),
      streamIdPresent: Boolean(streamId),
      providerCallIdPresent: Boolean(providerCallId),
      topLevelKeys: Object.keys(event),
      startKeys: event.start ? Object.keys(event.start) : [],
      mediaEncoding: format?.encoding ?? null,
      mediaSampleRate: format?.sampleRate ?? null,
    }, "Plivo stream start event received");

    if (!streamId || !providerCallId) {
      state.starting = false;
      state.preStartMediaQueue = [];
      log.warn({ event: "plivo.stream.start_rejected", reason: !streamId ? "missing_stream_id" : "missing_provider_call_id", internalCallIdPresent: Boolean(internalCallId) }, "Plivo stream start is missing required identifiers");
      socket.close(1008, "Missing Plivo stream identifiers");
      return;
    }

    const isMulawEncoding = !format?.encoding || isMulawFormat(format.encoding);
    const isSampleRateValid = !format?.sampleRate || Number(format.sampleRate) === 8000;

    if (!isMulawEncoding || !isSampleRateValid) {
      state.starting = false;
      state.preStartMediaQueue = [];
      log.warn({ event: "plivo.stream.start_rejected", reason: "unsupported_media_format", mediaEncoding: format?.encoding ?? null, mediaSampleRate: format?.sampleRate ?? null }, "Plivo stream start used an unsupported media format");
      socket.close(1008, "Expected mu-law audio at 8000 Hz");
      return;
    }

    if (state.registered && state.registered.streamId === streamId && state.registered.internalCallId === internalCallId) {
      state.starting = false;
      log.debug({ event: "plivo.stream.start_ignored", reason: "duplicate_start", streamIdPresent: true }, "Duplicate Plivo stream start ignored");
      return;
    }

    try {
      await TwilioStreamGateway.handle(
        transportSocket(socket, { internalCallId, streamId }),
        JSON.stringify({
          event: "start",
          streamSid: streamId,
          start: {
            streamSid: streamId,
            callSid: providerCallId,
            customParameters: { callId: internalCallId, twilioCallSid: providerCallId },
          },
        })
      );
    } catch (error) {
      state.starting = false;
      state.preStartMediaQueue = [];
      log.error({ event: "plivo.stream.start_failed", error: normalizeError(error) }, "TwilioStreamGateway.handle start failed");
      socket.close(1011, "Stream start initialization failed");
      return;
    }

    const session = AudioSessionService.get(streamId);
    if (!session || session.callId !== internalCallId) {
      state.starting = false;
      state.preStartMediaQueue = [];
      log.warn({ event: "plivo.stream.start_rejected", reason: "shared_session_not_registered", streamIdPresent: true, internalCallIdPresent: Boolean(internalCallId) }, "Plivo stream could not register a shared audio session");
      socket.close(1011, "Unable to register media session");
      return;
    }

    const registered: RegisteredPlivoStream = { streamId, internalCallId, providerCallId };
    state.registered = registered;
    state.starting = false;

    log.info({
      event: "plivo.stream.session_registered",
      internalCallId,
      providerCallIdPresent: true,
      streamIdPresent: true,
      requestedRuntime: session.requestedRuntime,
      effectiveRuntime: session.effectiveRuntime,
    }, "Plivo stream registered with the shared audio runtime");

    // Flush only frames that belong to the stream authenticated by START.
    if (state.preStartMediaQueue.length > 0) {
      const queue = state.preStartMediaQueue;
      state.preStartMediaQueue = [];
      const matchingFrames = queue.filter(item => item.streamId === registered.streamId);
      log.info({
        event: "plivo.stream.pre_start_media_flushed",
        count: matchingFrames.length,
        discardedStreamMismatchCount: queue.length - matchingFrames.length,
        internalCallId,
      }, "Flushing pre-start media buffer after successful registration");

      for (const item of matchingFrames) {
        await TwilioStreamGateway.handle(
          transportSocket(socket, registered),
          JSON.stringify({ event: "media", streamSid: registered.streamId, media: { payload: item.payload } })
        );
      }
    }
  }

  private static async handleMedia(socket: WebSocket, event: PlivoEvent, _internalCallId: string): Promise<void> {
    const state = getSocketState(socket);
    const streamId = firstValue(event.streamId, event.stream_id, event.streamSid);
    const payload = event.media?.payload?.trim() ?? "";

    if (!payload || !isValidBase64(payload)) {
      log.warn({ event: "plivo.stream.media_rejected", reason: "invalid_payload", streamIdPresent: Boolean(streamId) }, "Plivo media payload was invalid");
      return;
    }

    if (!state.registered) {
      if (streamId) {
        state.preStartMediaQueue.push({ streamId, payload });
        if (state.preStartMediaQueue.length > MAX_PRE_START_MEDIA_FRAMES) {
          state.preStartMediaQueue.shift();
        }
        log.debug({ event: "plivo.stream.media_buffered_pre_start", queueSize: state.preStartMediaQueue.length, streamIdPresent: true, registrationInProgress: state.starting }, "Plivo media frame buffered pending stream registration");
        return;
      }

      log.warn({ event: "plivo.stream.media_rejected", reason: "missing_stream_id", streamIdPresent: false }, "Plivo media before stream registration was missing its stream ID");
      return;
    }

    const registered = state.registered;
    if (streamId && registered.streamId !== streamId) {
      log.warn({ event: "plivo.stream.media_rejected", reason: "stream_id_mismatch", streamIdPresent: true }, "Plivo media stream ID mismatched registered stream");
      return;
    }

    log.debug({ event: "plivo.stream.media_received", internalCallId: registered.internalCallId, streamIdPresent: true, audioSizeBytes: Buffer.from(payload, "base64").length }, "Plivo media received");
    await TwilioStreamGateway.handle(transportSocket(socket, registered), JSON.stringify({ event: "media", streamSid: registered.streamId, media: { payload } }));
    log.debug({ event: "plivo.stream.media_forwarded", internalCallId: registered.internalCallId, streamIdPresent: true }, "Plivo media forwarded to shared audio runtime");
  }

  private static async handleDtmf(socket: WebSocket, event: PlivoEvent, internalCallId: string): Promise<void> {
    const state = getSocketState(socket);
    const registered = state.registered;
    const streamId = firstValue(event.streamId, event.stream_id, event.streamSid, registered?.streamId);
    const digit = firstValue(event.dtmf?.digit, event.dtmf?.digits, event.digit, event.digits)?.trim();
    const callId = registered?.internalCallId || internalCallId;

    log.info({
      event: "plivo.stream.dtmf_received",
      internalCallId: callId,
      streamIdPresent: Boolean(streamId),
      digitPresent: Boolean(digit),
    }, "Plivo stream DTMF frame received");

    if (!digit || !streamId) {
      log.warn({
        event: "plivo.stream.dtmf_rejected",
        reason: !digit ? "missing_digit" : "missing_stream_id",
        internalCallId: callId,
      }, "Plivo stream DTMF frame missing digit or stream ID");
      return;
    }

    await TwilioStreamGateway.handle(
      transportSocket(socket, { internalCallId: callId, streamId }),
      JSON.stringify({
        event: "dtmf",
        streamSid: streamId,
        dtmf: { digit },
      })
    );
  }

  private static async handleStop(socket: WebSocket, event: PlivoEvent): Promise<void> {
    const state = getSocketState(socket);
    const registered = state.registered;
    const streamId = firstValue(event.streamId, event.stream_id, event.streamSid) ?? registered?.streamId;
    if (!registered || !streamId || registered.streamId !== streamId) {
      log.warn({ event: "plivo.stream.stop_ignored", reason: "start_not_registered", streamIdPresent: Boolean(streamId) }, "Plivo stop was received without a registered stream");
      return;
    }
    log.info({ event: "plivo.stream.stop_received", internalCallId: registered.internalCallId, streamIdPresent: true }, "Plivo stream stop received");
    await this.closeRegisteredStream(socket, registered, "stop_event");
  }

  /** Cleans up a live runtime when Plivo closes the WebSocket without a stop event. */
  static async close(socket: WebSocket, code: number, reason: string): Promise<void> {
    const state = getSocketState(socket);
    const registered = state.registered;
    log.info({ event: "plivo.stream.closed", closeCode: code, closeReasonPresent: Boolean(reason), closeReasonLength: reason.length, sessionRegistered: Boolean(registered), internalCallId: registered?.internalCallId ?? null, streamIdPresent: Boolean(registered?.streamId) }, "Plivo stream WebSocket closed");
    if (!registered) return;
    await this.closeRegisteredStream(socket, registered, "socket_close");
  }

  private static async closeRegisteredStream(socket: WebSocket, registered: RegisteredPlivoStream, source: "stop_event" | "socket_close"): Promise<void> {
    try {
      await TwilioStreamGateway.handle(transportSocket(socket, registered), JSON.stringify({ event: "stop", streamSid: registered.streamId }));
      log.info({ event: "plivo.stream.session_cleaned_up", internalCallId: registered.internalCallId, streamIdPresent: true, source }, "Plivo stream runtime cleaned up");
    } finally {
      const state = getSocketState(socket);
      state.registered = null;
      state.starting = false;
      state.preStartMediaQueue = [];
      socketStates.delete(socket);
    }
  }
}

function isMulawFormat(encoding: string): boolean {
  const enc = encoding.toLowerCase().trim();
  return (
    enc === "audio/x-mulaw" ||
    enc.startsWith("audio/x-mulaw") ||
    enc === "audio/mulaw" ||
    enc.startsWith("audio/mulaw") ||
    enc === "mulaw" ||
    enc === "pcmu"
  );
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
