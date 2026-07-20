import { NextRequest } from "next/server";

export async function POST(
    request: NextRequest
) {

    const body =
        await request.formData();

    console.log(

        "Twilio Status Callback"

    );

    console.log(

        Object.fromEntries(body)

    );

    return Response.json({

        success: true,

    });

}