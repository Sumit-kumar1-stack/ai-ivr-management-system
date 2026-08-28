import {
  createCallLogger,
  normalizeError,
} from "@/lib/logger";

import {
  prisma,
} from "@/lib/prisma";

//--------------------------------------------------
// Supported Actions
//--------------------------------------------------

type SupportedAction =
  | "CALLBACK"
  | "TRANSFER"
  | "BLOCK_CONTACT"
  | "CREATE_LEAD";

//--------------------------------------------------
// Execute Conversation Action
//--------------------------------------------------

export async function executeAction(
  action:
    string,

  callId:
    string
): Promise<void> {
  const log =
    createCallLogger(
      callId
    );

  try {
    switch (
      action as SupportedAction
    ) {
      //------------------------------------------------
      // CALLBACK
      //------------------------------------------------

      case "CALLBACK": {
        /*
         * IMPORTANT:
         *
         * This service is invoked from post-call
         * analysis.
         *
         * A callback detected after the conversation
         * has ended must NOT start the live callback
         * collection workflow.
         *
         * The live workflow requires:
         *
         * - phone collection
         * - callback date/time
         * - timezone
         * - explicit caller confirmation
         * - active turn ownership
         *
         * Those requirements belong to the live
         * business-workflow router.
         */

        log.info(
          {
            event:
              "conversation.post_call.intent_detected",

            action:
              "CALLBACK",

            execution:
              "not_started",

            reason:
              "requires_live_callback_workflow",
          },
          "Post-call callback intent recorded without starting a live workflow"
        );

        return;
      }

      //------------------------------------------------
      // TRANSFER
      //------------------------------------------------

      case "TRANSFER": {
        /*
         * Human transfer can only be executed while
         * the provider call is alive.
         *
         * The live path is:
         *
         * Tool Gateway
         * -> Human Transfer Orchestrator
         * -> Provider Adapter
         *
         * Starting it from post-call analysis would
         * attempt to transfer an already-ended call.
         */

        log.info(
          {
            event:
              "conversation.post_call.intent_detected",

            action:
              "TRANSFER",

            execution:
              "not_started",

            reason:
              "requires_live_call_runtime",
          },
          "Post-call transfer intent recorded without executing a transfer"
        );

        return;
      }

      //------------------------------------------------
      // BLOCK CONTACT
      //------------------------------------------------

      case "BLOCK_CONTACT": {
        /*
         * Blocking a contact is deterministic and is
         * safe to apply after the call.
         */

        const call =
          await prisma.call
            .findUnique({
              where: {
                id:
                  callId,
              },

              select: {
                contactId:
                  true,
              },
            });

        if (
          !call
        ) {
          log.warn(
            {
              event:
                "conversation.action.skipped",

              action:
                "BLOCK_CONTACT",

              reason:
                "call_not_found",
            },
            "Block-contact action skipped"
          );

          return;
        }

        //------------------------------------------------
        // Contact ID Guard
        //------------------------------------------------

        if (
          !call.contactId
        ) {
          log.warn(
            {
              event:
                "conversation.action.skipped",

              action:
                "BLOCK_CONTACT",

              reason:
                "contact_not_available",
            },
            "Block-contact action skipped because call has no contact"
          );

          return;
        }

        //------------------------------------------------
        // Idempotent Contact Update
        //------------------------------------------------

        const blocked =
          await prisma.contact
            .updateMany({
              where: {
                id:
                  call.contactId,

                status: {
                  not:
                    "BLOCKED",
                },
              },

              data: {
                status:
                  "BLOCKED",
              },
            });

        //------------------------------------------------
        // Already Blocked
        //------------------------------------------------

        if (
          blocked.count ===
          0
        ) {
          log.info(
            {
              event:
                "conversation.action.noop",

              action:
                "BLOCK_CONTACT",

              contactId:
                call.contactId,

              reason:
                "already_blocked_or_missing",
            },
            "Block-contact action required no database change"
          );

          return;
        }

        //------------------------------------------------
        // Completed
        //------------------------------------------------

        log.info(
          {
            event:
              "conversation.action.completed",

            action:
              "BLOCK_CONTACT",

            contactId:
              call.contactId,
          },
          "Contact blocked"
        );

        return;
      }

      //------------------------------------------------
      // CREATE LEAD
      //------------------------------------------------

      case "CREATE_LEAD": {
        /*
         * Do not create an incomplete Lead and do not
         * open Redis conversational state after the
         * call has finished.
         *
         * Lead collection belongs to the active
         * business-workflow router where required
         * fields and confirmation can be collected.
         */

        log.info(
          {
            event:
              "conversation.post_call.intent_detected",

            action:
              "CREATE_LEAD",

            execution:
              "not_started",

            reason:
              "requires_live_lead_workflow",
          },
          "Post-call lead intent recorded without starting a live workflow"
        );

        return;
      }

      //------------------------------------------------
      // Unsupported
      //------------------------------------------------

      default: {
        log.debug(
          {
            event:
              "conversation.action.skipped",

            reason:
              "unsupported_action",

            actionPresent:
              Boolean(
                action
              ),

            actionCharacterCount:
              action.length,
          },
          "No handler configured for conversation action"
        );

        return;
      }
    }
  } catch (
    error
  ) {
    log.error(
      {
        event:
          "conversation.action.failed",

        actionPresent:
          Boolean(
            action
          ),

        action,

        error:
          normalizeError(
            error
          ),
      },
      "Conversation action execution failed"
    );
  }
}