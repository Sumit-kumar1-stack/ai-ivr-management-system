import { WebSocket } from "ws";
import { createCallLogger, createServerLogger, normalizeError } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { AudioConverter } from "@/services/voice/audio-converter.service";
import { AudioSessionService } from "./audio-session.service";
import { TwilioStreamGateway } from "./twilio-stream.gateway";

type ExotelEvent = {
  event?: string;
  stream_sid?: string;
  streamSid?: string;
  start?: {
    stream_sid?: string;
    call_sid?: string;
    custom_parameters?: Record<string, string>;
    media_format?: { encoding?: string; sample_rate?: string; bit_rate?: string };
  };
  media?: { payload?: string };
  dtmf?: { digit?: string };
};

const log = createServerLogger("exotel-stream-gateway");

/**
 * AgentStream's event envelope mirrors the existing media contract closely.
 * This adapter does only protocol and codec normalization; the shared gateway
 * retains STT, IVR, RAG, TTS, Gemini Live, barge-in, and cleanup behavior.
 */
export class ExotelStreamGateway {
  static async handle(socket: WebSocket, rawMessage: string): Promise<void> {
    let event: ExotelEvent;
    try { event = JSON.parse(rawMessage) as ExotelEvent; } catch (error) {
      log.warn({ event: "exotel.media.rejected", reason: "invalid_json", error: normalizeError(error) }, "Invalid Exotel AgentStream message");
      return;
    }

    try {
      if (event.event === "connected") {
        log.info({ event: "exotel.media.connected" }, "Exotel AgentStream connected");
        await TwilioStreamGateway.handle(socket, JSON.stringify({ event: "connected" }));
        return;
      }
      if (event.event === "start") {
        await this.handleStart(socket, event);
        return;
      }
      if (event.event === "media") {
        const payload = event.media?.payload?.trim();
        const streamSid = event.stream_sid?.trim() || event.streamSid?.trim();
        if (!payload || !streamSid || !isValidBase64(payload)) return;
        const pcm = Buffer.from(payload, "base64");
        const mulaw = AudioConverter.pcm16kToMulaw8k(pcm);
        const session = AudioSessionService.get(streamSid);
        if (session) createCallLogger(session.callId).debug({ event: "exotel.media.audio_received", providerCallId: session.twilioCallSid, internalCallId: session.callId, audioSizeBytes: pcm.length }, "Exotel AgentStream audio received");
        await TwilioStreamGateway.handle(socket, JSON.stringify({ event: "media", streamSid, media: { payload: mulaw.toString("base64") } }));
        return;
      }
      if (event.event === "dtmf") {
        await TwilioStreamGateway.handle(socket, JSON.stringify({ event: "dtmf", streamSid: event.stream_sid ?? event.streamSid, dtmf: event.dtmf }));
        return;
      }
      if (event.event === "mark" || event.event === "stop") {
        await TwilioStreamGateway.handle(socket, JSON.stringify({ event: event.event, streamSid: event.stream_sid ?? event.streamSid, stop: event }));
      }
    } catch (error) {
      log.error({ event: "exotel.media.failed", providerCallIdPresent: Boolean(event.start?.call_sid), error: normalizeError(error) }, "Exotel AgentStream event processing failed");
      socket.close(1011, "Media processing failed");
    }
  }

  private static async handleStart(socket: WebSocket, event: ExotelEvent): Promise<void> {
    const streamSid = event.start?.stream_sid?.trim() || event.stream_sid?.trim() || "";
    const providerCallId = event.start?.call_sid?.trim() || "";
    const format = event.start?.media_format;
    if (!streamSid || !providerCallId || format?.encoding !== "audio/x-raw" || String(format.sample_rate ?? "8000") !== "8000" || String(format.bit_rate ?? "16") !== "16") {
      log.warn({ event: "exotel.media.rejected", reason: "unsupported_or_missing_start_format", streamSidPresent: Boolean(streamSid), providerCallIdPresent: Boolean(providerCallId) }, "Exotel AgentStream start rejected");
      socket.close(1008, "Expected raw PCM16 mono at 8000 Hz");
      return;
    }
    const call = await prisma.call.findFirst({ where: { provider: "EXOTEL", providerCallId }, select: { id: true, tenantId: true } });
    if (!call) {
      log.warn({ event: "exotel.media.rejected", reason: "unknown_provider_call" }, "Exotel AgentStream call association was not found");
      socket.close(1008, "Call not found");
      return;
    }
    const existing = AudioSessionService.get(streamSid);
    if (existing?.callId === call.id) {
      createCallLogger(call.id).warn({ event: "exotel.media.start_ignored", providerCallId, internalCallId: call.id, reason: "duplicate_start" }, "Duplicate Exotel AgentStream start ignored");
      return;
    }
    const customParameters = { ...(event.start?.custom_parameters ?? {}), callId: call.id, mediaFormat: "PCM_8K" };
    await TwilioStreamGateway.handle(socket, JSON.stringify({ event: "start", streamSid, start: { streamSid, callSid: providerCallId, customParameters } }));
    createCallLogger(call.id).info({ event: "exotel.media.session_started", providerCallId, internalCallId: call.id, tenantId: call.tenantId, runtime: "selected", durationMs: 0 }, "Exotel AgentStream session started");
  }
}

function isValidBase64(value: string): boolean {
  return value.length > 0 && value.length % 4 !== 1 && /^[A-Za-z0-9+/]*={0,2}$/.test(value);
}
