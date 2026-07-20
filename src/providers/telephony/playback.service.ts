import { TTSAudioChunk } from "@/services/voice/types";

import {
  createCallLogger,
} from "@/lib/logger";

function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function playAudio(
  callId: string,
  chunk: TTSAudioChunk
) {

  const log =
    createCallLogger(callId);

  log.info({
    chunkId: chunk.id,
    size: chunk.audio.length,
  }, "Playback Started");

  console.log(
    "\n========== PLAYBACK =========="
  );

  console.log("Call:", callId);

  console.log("Chunk:", chunk.id);

  console.log("Text:");

  console.log(chunk.text);

  console.log(
    "Audio Size:",
    chunk.audio.length,
    "bytes"
  );

  console.log(
    "==============================\n"
  );

  //--------------------------------------------------
  // Mock Streaming Playback
  //--------------------------------------------------

  const words =
    chunk.text.split(/\s+/);

  for (const word of words) {

    process.stdout.write(word + " ");

    await delay(120);

  }

  console.log("\n");

  log.info({
    chunkId: chunk.id,
  }, "Playback Finished");

}