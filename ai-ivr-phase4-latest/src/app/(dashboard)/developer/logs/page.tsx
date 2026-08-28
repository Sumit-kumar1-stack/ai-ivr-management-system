import { UserRole } from "@prisma/client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const DeveloperRoles = [
  UserRole.SUPER_ADMIN,
  UserRole.ADMIN,
] as const;

export default async function DeveloperLogsPage() {
  const currentUser = await requireRole(DeveloperRoles);

  if (!currentUser.tenantId) {
    return (
      <section className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-amber-900">
        Tenant context is required before using developer tools.
      </section>
    );
  }

  const logs = await prisma.auditEvent.findMany({
    where: {
      tenantId: currentUser.tenantId,
    },
    orderBy: {
      createdAt: "desc",
    },
    take: 50,
    select: {
      id: true,
      actorType: true,
      actorRole: true,
      action: true,
      outcome: true,
      resourceType: true,
      resourceId: true,
      ipAddress: true,
      correlationId: true,
      createdAt: true,
    },
  });

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">Integration Logs</h1>
        <p className="text-sm text-muted-foreground">
          Security and product audit trail for developer and integration actions.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent Events</CardTitle>
          <CardDescription>Append-only history with request correlation.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {logs.length === 0 ? (
            <p className="text-sm text-muted-foreground">No audit logs recorded yet.</p>
          ) : (
            logs.map(log => (
              <div key={log.id} className="rounded-lg border p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="font-medium">{log.action}</p>
                    <p className="text-xs text-muted-foreground">
                      {log.resourceType ?? "Unknown"} {log.resourceId ? `#${log.resourceId}` : ""}
                    </p>
                  </div>
                  <span className="rounded-full bg-muted px-2 py-1 text-xs font-medium uppercase tracking-wide">
                    {log.outcome}
                  </span>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  Actor: {log.actorType ?? "UNKNOWN"} {log.actorRole ? `(${log.actorRole})` : ""}
                </p>
                <p className="text-xs text-muted-foreground">
                  IP: {log.ipAddress ?? "n/a"} | Correlation: {log.correlationId ?? "n/a"} | {log.createdAt.toISOString()}
                </p>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}

