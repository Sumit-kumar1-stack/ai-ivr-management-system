import { prisma } from "@/lib/prisma";

export async function executeAction(
  action: string,
  callId: string
): Promise<void> {
  try {
    switch (action) {
      case "CALLBACK":
        // TODO: Schedule callback
        console.log("📅 Callback Scheduled");
        return;

      case "TRANSFER":
        // TODO: Transfer call to human agent
        console.log("☎️ Transfer To Human");
        return;

      case "BLOCK_CONTACT": {
        const call = await prisma.call.findUnique({
          where: {
            id: callId,
          },
        });

        if (!call) {
          console.warn(`Call not found: ${callId}`);
          return;
        }

        await prisma.contact.update({
          where: {
            id: call.contactId,
          },
          data: {
            status: "BLOCKED",
          },
        });

        console.log("🚫 Contact Blocked");
        return;
      }

      case "CREATE_LEAD":
        // TODO: Create CRM lead
        console.log("⭐ Lead Created");
        return;

      default:
        console.log(`No action configured for: ${action}`);
        return;
    }
  } catch (error) {
    console.error("Error executing action:", error);
  }
}