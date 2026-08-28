export class IVRService {

    static async handleInput(
        callId:string,
        digit:string
    ){

        console.log({
            callId,
            digit
        });


        switch(digit){

            case "1":

                return {
                    department:"SALES",
                    action:"TRANSFER"
                };


            case "2":

                return {
                    department:"SUPPORT",
                    action:"TRANSFER"
                };


            case "3":

                return {
                    department:"AGENT",
                    action:"TRANSFER"
                };


            default:

                return {
                    action:"INVALID"
                };

        }

    }

}