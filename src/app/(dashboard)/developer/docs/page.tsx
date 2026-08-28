import Link from "next/link";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function DeveloperDocsPage() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">Developer Docs</h1>
        <p className="text-sm text-muted-foreground">
          Entry points for integrations, webhook handling, and API usage.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Integration Entry Points</CardTitle>
          <CardDescription>Use the panel links below for operational workflows.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Link className="block rounded-lg border px-4 py-3 hover:bg-muted/50" href="/developer/api-keys">
            API key lifecycle and scoped access
          </Link>
          <Link className="block rounded-lg border px-4 py-3 hover:bg-muted/50" href="/developer/webhooks">
            Webhook registration and delivery secrets
          </Link>
          <Link className="block rounded-lg border px-4 py-3 hover:bg-muted/50" href="/developer/logs">
            Audit and integration logs
          </Link>
          <Link className="block rounded-lg border px-4 py-3 hover:bg-muted/50" href="/developer/usage">
            Usage and integration visibility
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}

