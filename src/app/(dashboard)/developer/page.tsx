import Link from "next/link";

import { ApiKeyStatus, UserRole, WebhookEndpointStatus } from "@prisma/client";

import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const DeveloperRoles = [
  UserRole.SUPER_ADMIN,
  UserRole.ADMIN,
] as const;

export default async function DeveloperDashboardPage() {
  const currentUser = await requireRole(DeveloperRoles);

  if (!currentUser.tenantId) {
    return (
      <section className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-amber-900">
        Tenant context is required before using developer tools.
      </section>
    );
  }

  const [
    apiKeyCount,
    activeApiKeyCount,
    webhookCount,
    activeWebhookCount,
    recentAuditEvents,
    recentWebhookDeliveries,
  ] = await Promise.all([
    prisma.apiKey.count({ where: { tenantId: currentUser.tenantId } }),
    prisma.apiKey.count({ where: { tenantId: currentUser.tenantId, status: ApiKeyStatus.ACTIVE } }),
    prisma.webhookEndpoint.count({ where: { tenantId: currentUser.tenantId } }),
    prisma.webhookEndpoint.count({ where: { tenantId: currentUser.tenantId, status: WebhookEndpointStatus.ACTIVE } }),
    prisma.auditEvent.findMany({
      where: { tenantId: currentUser.tenantId },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: {
        action: true,
        outcome: true,
        resourceType: true,
        resourceId: true,
        createdAt: true,
      },
    }),
    prisma.webhookDelivery.findMany({
      where: { tenantId: currentUser.tenantId },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: {
        eventName: true,
        status: true,
        responseStatus: true,
        deliveredAt: true,
        createdAt: true,
      },
    }),
  ]);

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">Developer Dashboard</h1>
        <p className="text-sm text-muted-foreground">
          Integration status, keys, webhooks, and recent platform activity for this tenant.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardHeader>
            <CardTitle>API Keys</CardTitle>
            <CardDescription>Active vs total</CardDescription>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">
            {activeApiKeyCount} / {apiKeyCount}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Webhooks</CardTitle>
            <CardDescription>Active vs total</CardDescription>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">
            {activeWebhookCount} / {webhookCount}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Environment</CardTitle>
            <CardDescription>Runtime</CardDescription>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">
            {process.env.NODE_ENV}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Tenant</CardTitle>
            <CardDescription>Current context</CardDescription>
          </CardHeader>
          <CardContent className="text-sm font-semibold">
            {currentUser.tenantName ?? currentUser.tenantId}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Recent Audit Events</CardTitle>
            <CardDescription>Append-only security and product activity</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {recentAuditEvents.length === 0 ? (
              <p className="text-sm text-muted-foreground">No audit events recorded yet.</p>
            ) : (
              recentAuditEvents.map(event => (
                <div key={`${event.action}-${event.createdAt.toISOString()}`} className="rounded-lg border p-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-medium">{event.action}</p>
                    <span className="text-xs uppercase tracking-wide text-muted-foreground">
                      {event.outcome}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {event.resourceType ?? "Unknown"} {event.resourceId ? `#${event.resourceId}` : ""}
                  </p>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Webhook Deliveries</CardTitle>
            <CardDescription>Latest integration delivery attempts</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {recentWebhookDeliveries.length === 0 ? (
              <p className="text-sm text-muted-foreground">No webhook deliveries yet.</p>
            ) : (
              recentWebhookDeliveries.map(delivery => (
                <div key={`${delivery.eventName}-${delivery.createdAt.toISOString()}`} className="rounded-lg border p-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-medium">{delivery.eventName}</p>
                    <span className="text-xs uppercase tracking-wide text-muted-foreground">
                      {delivery.status}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Response {delivery.responseStatus ?? "pending"}
                  </p>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-wrap gap-3">
        <Link className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground" href="/developer/api-keys">
          Manage API Keys
        </Link>
        <Link className="rounded-lg border px-4 py-2 text-sm font-medium" href="/developer/webhooks">
          Manage Webhooks
        </Link>
        <Link className="rounded-lg border px-4 py-2 text-sm font-medium" href="/developer/integrations">
          External Integrations
        </Link>
        <Link className="rounded-lg border px-4 py-2 text-sm font-medium" href="/developer/logs">
          View Logs
        </Link>
        <Link className="rounded-lg border px-4 py-2 text-sm font-medium" href="/developer/docs">
          Developer Docs
        </Link>
      </div>
    </div>
  );
}
