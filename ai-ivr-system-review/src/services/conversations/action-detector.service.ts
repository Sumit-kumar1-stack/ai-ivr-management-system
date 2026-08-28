import { generateAIResponse } from "./ai-response.service";

export interface AIAction {
  action:
    | "NONE"
    | "CALLBACK"
    | "TRANSFER"
    | "BLOCK_CONTACT"
    | "CREATE_LEAD";

  reason: string;
}

export async function detectAction(
  transcript: string
): Promise<AIAction> {

  const prompt = `
You are an AI Call Center Supervisor.

Read this conversation.

Return ONLY valid JSON.

Possible actions:

NONE
CALLBACK
TRANSFER
BLOCK_CONTACT
CREATE_LEAD

Example:

{
  "action":"CALLBACK",
  "reason":"Customer requested callback tomorrow."
}

Conversation:

${transcript}
`;

  const response =
    await generateAIResponse(prompt);

  const match =
    response.match(/\{[\s\S]*\}/);

  if (!match)
    return {
      action: "NONE",
      reason: "No action",
    };

  return JSON.parse(match[0]);
}