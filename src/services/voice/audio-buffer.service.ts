export class AudioBufferService {

    private static buffers =

        new Map<string, Buffer[]>();

    static push(

        callId: string,

        audio: Buffer

    ) {

        const current =

            this.buffers.get(callId)

            ?? [];

        current.push(audio);

        this.buffers.set(

            callId,

            current

        );

    }

    static flush(

        callId: string

    ) {

        const chunks =

            this.buffers.get(callId)

            ?? [];

        this.buffers.delete(callId);

        return Buffer.concat(chunks);

    }

}