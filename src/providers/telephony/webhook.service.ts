import {

    EventPublisher,
    AppEvent,

} from "@/core/events";

import {

    updateCallStatus,

} from "@/services/calls/call.service";

import {

    ProviderWebhook,

} from "./webhook.types";

export class WebhookService {

    static async process(

        webhook: ProviderWebhook

    ) {

        switch (webhook.event) {

            case "call.ringing":

                await updateCallStatus({

                    providerCallId:
                        webhook.providerCallId,

                    status: "RINGING",

                });

                await EventPublisher.publish(

                    AppEvent.CALL_RINGING,

                    webhook

                );

                break;

            case "call.answered":

                await updateCallStatus({

                    providerCallId:
                        webhook.providerCallId,

                    status: "ANSWERED",

                });

                await EventPublisher.publish(

                    AppEvent.CALL_ANSWERED,

                    webhook

                );

                break;

            case "call.completed":

                await updateCallStatus({

                    providerCallId:
                        webhook.providerCallId,

                    status: "COMPLETED",

                });

                await EventPublisher.publish(

                    AppEvent.CALL_COMPLETED,

                    webhook

                );

                break;

            case "call.failed":

                await updateCallStatus({

                    providerCallId:
                        webhook.providerCallId,

                    status: "FAILED",

                });

                await EventPublisher.publish(

                    AppEvent.CALL_FAILED,

                    webhook

                );

                break;

            default:

                console.log(

                    "Unknown webhook:",

                    webhook.event

                );

        }

    }

}