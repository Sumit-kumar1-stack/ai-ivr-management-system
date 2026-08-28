import { UserRole } from "@prisma/client";

import DeveloperWebhookForm from "@/components/developer/webhook-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const DeveloperRoles = [
  UserRole.SUPER_ADMIN,
  UserRole.ADMIN,
] as const;

export default async function DeveloperWebhooksPage() {
  const currentUser = await requireRole(DeveloperRoles);

  if (!currentUser.tenantId) {
    return (
      <section className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-amber-900">
        Tenant context is required before using developer tools.
      </section>
    );
  }

  const webhooks = await prisma.webhookEndpoint.findMany({
    where: {
      tenantId: currentUser.tenantId,
    },
    orderBy: {
      createdAt: "desc",
    },
    select: {
      id: true,
      name: true,
      url: true,
      description: true,
      events: true,
      status: true,
      lastDeliveredAt: true,
      createdAt: true,
    },
  });

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">Webhooks</h1>
        <p className="text-sm text-muted-foreground">
          Register HTTPS endpoints for outbound integration events.
        </p>
      </div>

      <DeveloperWebhookForm />

      <Card>
        <CardHeader>
          <CardTitle>Registered Endpoints</CardTitle>
          <CardDescription>Current tenant integrations and delivery state.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {webhooks.length === 0 ? (
            <p className="text-sm text-muted-foreground">No webhooks registered yet.</p>
          ) : (
            webhooks.map(webhook => (
              <div key={webhook.id} className="rounded-lg border p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="font-medium">{webhook.name}</p>
                    <p className="text-xs text-muted-foreground">{webhook.url}</p>
                  </div>
                  <span className="rounded-full bg-muted px-2 py-1 text-xs font-medium uppercase tracking-wide">
                    {webhook.status}
                  </span>
                </div>
                <p className="mt-2 text-sm text-muted-foreground">
                  Events: {webhook.events.length > 0 ? webhook.events.join(", ") : "None"}
                </p>
                <p className="text-xs text-muted-foreground">
                  Last delivery: {webhook.lastDeliveredAt?.toISOString() ?? "Never"}
                </p>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
