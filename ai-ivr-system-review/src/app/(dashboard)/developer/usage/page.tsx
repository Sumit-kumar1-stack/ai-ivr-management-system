import { UserRole, WebhookDeliveryStatus } from "@prisma/client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const DeveloperRoles = [
  UserRole.SUPER_ADMIN,
  UserRole.ADMIN,
] as const;

export default async function DeveloperUsagePage() {
  const currentUser = await requireRole(DeveloperRoles);

  if (!currentUser.tenantId) {
    return (
      <section className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-amber-900">
        Tenant context is required before using developer tools.
      </section>
    );
  }

  const [apiKeys, webhooks, deliveries, failedDeliveries] = await Promise.all([
    prisma.apiKey.count({ where: { tenantId: currentUser.tenantId } }),
    prisma.webhookEndpoint.count({ where: { tenantId: currentUser.tenantId } }),
    prisma.webhookDelivery.count({ where: { tenantId: currentUser.tenantId } }),
    prisma.webhookDelivery.count({
      where: {
        tenantId: currentUser.tenantId,
        status: {
          in: [
            WebhookDeliveryStatus.FAILED,
            WebhookDeliveryStatus.SKIPPED,
          ],
        },
      },
    }),
  ]);

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">Usage</h1>
        <p className="text-sm text-muted-foreground">
          Lightweight integration and delivery visibility for the current tenant.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardHeader>
            <CardTitle>API Keys</CardTitle>
            <CardDescription>Total stored</CardDescription>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">{apiKeys}</CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Webhooks</CardTitle>
            <CardDescription>Total endpoints</CardDescription>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">{webhooks}</CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Deliveries</CardTitle>
            <CardDescription>Recorded attempts</CardDescription>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">{deliveries}</CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Failures</CardTitle>
            <CardDescription>Failed or skipped</CardDescription>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">{failedDeliveries}</CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Rate Limit / Safety Notes</CardTitle>
          <CardDescription>Policy placeholders for the current runtime.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>API and webhook actions are tenant scoped and require authenticated access.</p>
          <p>Webhook creation is limited to HTTPS destinations and records signature material securely.</p>
          <p>Audit events and delivery history are stored separately from product state.</p>
          <p>Current runtime: {process.env.NODE_ENV}</p>
        </CardContent>
      </Card>
    </div>
  );
}
