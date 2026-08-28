import {

EventPublisher,

AppEvent,

} from "@/core/events";

export class AudioEvents {

    static connected(

        callId: string

    ) {

        return EventPublisher.publish(

            AppEvent.AUDIO_CONNECTED,

            {

                callId,

                timestamp:

                    Date.now(),

            }

        );

    }

    static disconnected(

        callId: string

    ) {

        return EventPublisher.publish(

            AppEvent.AUDIO_DISCONNECTED,

            {

                callId,

                timestamp:

                    Date.now(),

            }

        );

    }

}