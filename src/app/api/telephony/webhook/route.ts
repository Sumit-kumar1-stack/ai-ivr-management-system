import { NextRequest } from "next/server";

import { success } from "@/lib/api-response";

import {

    WebhookService,

} from "@/providers/telephony/webhook.service";

export async function POST(

    request: NextRequest

) {

    const body = await request.json();

    await WebhookService.process(body);

    return success({

        received: true,

    });

}