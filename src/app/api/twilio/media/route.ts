import { NextRequest } from "next/server";

export async function GET(

  req: NextRequest

) {

  return new Response(

    "Twilio Media Stream Endpoint",

    {

      status: 200,

    }

  );

}