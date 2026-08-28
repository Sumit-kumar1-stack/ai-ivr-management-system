import { Buffer } from "buffer";

export type GeminiLiveAudioInput =
  | Buffer
  | Uint8Array
  | ArrayBuffer
  | string
  | { data?: unknown; inlineData?: { data?: unknown; mimeType?: unknown }; mimeType?: unknown };

export type NormalizedGeminiLiveAudio = {
  audio: Buffer;
  inputType: "Buffer" | "Uint8Array" | "ArrayBuffer" | "base64" | "inlineData" | "unsupported";
  byteLength: number;
  mimeType: string | null;
  sampleRate: number | null;
};

/** Normalizes the supported Gemini Live audio representations at one boundary. */
export function normalizeGeminiLiveAudio(input: unknown, fallbackMimeType?: string): NormalizedGeminiLiveAudio {
  const mimeType = getMimeType(input) ?? normalizeMimeType(fallbackMimeType);
  const audio = toBuffer(input);
  return { audio: audio ?? Buffer.alloc(0), inputType: getInputType(input), byteLength: audio?.length ?? 0, mimeType, sampleRate: getSampleRate(mimeType) };
}

function toBuffer(input: unknown): Buffer | null {
  if (Buffer.isBuffer(input)) return Buffer.from(input);
  if (input instanceof ArrayBuffer) return Buffer.from(input);
  if (input instanceof Uint8Array) return Buffer.from(input.buffer, input.byteOffset, input.byteLength);
  if (typeof input === "string") return decodeBase64(input);
  if (isRecord(input)) {
    if ("inlineData" in input && isRecord(input.inlineData)) return toBuffer(input.inlineData.data);
    if ("data" in input) return toBuffer(input.data);
  }
  return null;
}

function decodeBase64(value: string): Buffer | null {
  const normalized = value.replace(/\s+/g, "");
  if (!normalized || normalized.length % 4 === 1 || !/^[A-Za-z0-9+/]*={0,2}$/.test(normalized)) return null;
  const decoded = Buffer.from(normalized, "base64");
  return decoded.length > 0 ? decoded : null;
}

function getInputType(input: unknown): NormalizedGeminiLiveAudio["inputType"] {
  if (Buffer.isBuffer(input)) return "Buffer";
  if (input instanceof ArrayBuffer) return "ArrayBuffer";
  if (input instanceof Uint8Array) return "Uint8Array";
  if (typeof input === "string") return "base64";
  if (isRecord(input) && ("data" in input || "inlineData" in input)) return "inlineData";
  return "unsupported";
}

function getMimeType(input: unknown): string | null {
  if (!isRecord(input)) return null;
  if (isRecord(input.inlineData)) return normalizeMimeType(input.inlineData.mimeType);
  return normalizeMimeType(input.mimeType);
}

function normalizeMimeType(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim().toLowerCase() : null;
}

function getSampleRate(mimeType: string | null): number | null {
  const match = mimeType?.match(/(?:rate|samplerate)\s*=\s*(\d+)/i);
  const sampleRate = match ? Number(match[1]) : NaN;
  return Number.isFinite(sampleRate) && sampleRate > 0 ? sampleRate : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
