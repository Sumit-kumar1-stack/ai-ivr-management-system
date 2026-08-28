import { UserRole } from "@prisma/client";

import DeveloperApiKeyForm from "@/components/developer/api-key-form";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const DEVELOPER_ROLES = [
  UserRole.SUPER_ADMIN,
  UserRole.ADMIN,
] as const;

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function DeveloperApiKeysPage() {
  const currentUser = await requireRole(DEVELOPER_ROLES);

  if (!currentUser.tenantId) {
    return (
      <section className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-amber-900">
        Tenant context is required before using developer tools.
      </section>
    );
  }

  const keys = await prisma.apiKey.findMany({
    where: {
      tenantId: currentUser.tenantId,
    },
    orderBy: {
      createdAt: "desc",
    },
    select: {
      id: true,
      name: true,
      prefix: true,
      scopes: true,
      status: true,
      expiresAt: true,
      revokedAt: true,
      lastUsedAt: true,
      createdAt: true,
    },
  });

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">
          API Keys
        </h1>

        <p className="text-sm text-muted-foreground">
          Generate, review, and manage tenant-scoped developer keys.
        </p>
      </div>

      <DeveloperApiKeyForm />

      <Card>
        <CardHeader>
          <CardTitle>Existing Keys</CardTitle>

          <CardDescription>
            Secrets are never shown again after creation.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-3">
          {keys.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No API keys created yet.
            </p>
          ) : (
            keys.map((key) => (
              <div
                key={key.id}
                className="rounded-lg border p-4"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="font-medium">{key.name}</p>

                    <p className="text-xs text-muted-foreground">
                      Prefix {key.prefix}
                    </p>
                  </div>

                  <span className="rounded-full bg-muted px-2 py-1 text-xs font-medium uppercase tracking-wide">
                    {key.status}
                  </span>
                </div>

                <p className="mt-2 text-sm text-muted-foreground">
                  Scopes:{" "}
                  {key.scopes.length > 0
                    ? key.scopes.join(", ")
                    : "None"}
                </p>

                <p className="mt-1 text-xs text-muted-foreground">
                  Expires:{" "}
                  {key.expiresAt?.toISOString() ?? "Never"}
                </p>

                <p className="text-xs text-muted-foreground">
                  Last used:{" "}
                  {key.lastUsedAt?.toISOString() ?? "Never"}
                </p>

                <p className="text-xs text-muted-foreground">
                  Created: {key.createdAt.toISOString()}
                </p>

                {key.revokedAt && (
                  <p className="text-xs text-muted-foreground">
                    Revoked: {key.revokedAt.toISOString()}
                  </p>
                )}
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}