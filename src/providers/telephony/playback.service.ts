import { AudioChunk } from "@/services/voice/types";

function delay(ms: number) {
  return new Promise((resolve) =>
    setTimeout(resolve, ms)
  );
}

export async function playAudio(
  callId: string,
  chunk: AudioChunk
) {
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
  // Simulate speaking latency
  //--------------------------------------------------

  const words =
    chunk.text.split(/\s+/);

  for (const word of words) {

    process.stdout.write(word + " ");

    await delay(120);

  }

  console.log("\n");
}