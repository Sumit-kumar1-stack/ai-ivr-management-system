import { NextRequest, NextResponse } from "next/server";


export async function POST(
    req: NextRequest
) {


    const formData =
        await req.formData();


    const digits =
        formData.get("Digits");


    console.log(
        "User pressed:",
        digits
    );


    let message = "";


    switch(digits){


        case "1":

            message =
            `
            You selected Sales.
            Connecting you to the sales team.
            `;

            break;



        case "2":

            message =
            `
            You selected Support.
            Our support team will assist you.
            `;

            break;



        case "3":

            message =
            `
            Connecting you to a human agent.
            `;

            break;



        default:

            message =
            `
            Invalid option.
            Please try again.
            `;

    }



    const xml = `<?xml version="1.0" encoding="UTF-8"?>

<Response>

    <Say voice="alice">

        ${message}

    </Say>

</Response>
`;



    return new NextResponse(
        xml,
        {
            headers:{
                "Content-Type":
                    "text/xml",
            },
        }
    );

}