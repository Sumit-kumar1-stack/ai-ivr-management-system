export interface ProviderWebhook {

    providerCallId: string;

    event: string;

    timestamp: number;

    payload: unknown;

}

export interface ProviderWebhookHandler {

    handle(
        webhook: ProviderWebhook
    ): Promise<void>;

}