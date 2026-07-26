import {
  runPostCallProcessing,
} from "../src/services/conversations/conversation-engine.service";

async function main(): Promise<void> {
  const callId =
    "cmrwin6kt00033zoc281de0pj"; // Replace with a valid callId for testing

  await runPostCallProcessing(
    callId
  );

  console.log(
    "Post-call test finished"
  );
}

main()
  .catch(
    (error) => {
      console.error(
        error
      );

      process.exitCode =
        1;
    }
  );