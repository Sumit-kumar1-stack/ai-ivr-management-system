"use client";

import { useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

interface CreatedKey {
  id: string;
  name: string;
  prefix: string;
  plaintextKey: string;
}

export default function DeveloperApiKeyForm() {
  const [name, setName] = useState("");
  const [scopes, setScopes] = useState("developer:read, developer:write");
  const [expiresAt, setExpiresAt] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<CreatedKey | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setBusy(true);
    setError(null);
    setCreated(null);

    try {
      const response = await fetch("/api/developer/api-keys", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name,
          scopes: scopes
            .split(",")
            .map(value => value.trim())
            .filter(Boolean),
          expiresAt:
            expiresAt
              ? new Date(expiresAt).toISOString()
              : null,
        }),
      });

      const body = await response.json();

      if (!response.ok) {
        throw new Error(
          body.message || "Unable to create API key"
        );
      }

      setCreated(body.key);
      setName("");
      setScopes("developer:read, developer:write");
      setExpiresAt("");
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "Unable to create API key"
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Generate API Key</CardTitle>
        <CardDescription>
          Plaintext is shown once. Store the hash only.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form className="space-y-4" onSubmit={handleSubmit}>
          <div className="space-y-2">
            <label className="text-sm font-medium">Name</label>
            <Input
              value={name}
              onChange={event => setName(event.target.value)}
              placeholder="Customer integration"
              required
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Scopes</label>
            <Textarea
              value={scopes}
              onChange={event => setScopes(event.target.value)}
              placeholder="developer:read, developer:write"
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Expires At</label>
            <Input
              type="datetime-local"
              value={expiresAt}
              onChange={event => setExpiresAt(event.target.value)}
            />
          </div>
          <Button type="submit" disabled={busy}>
            {busy ? "Creating..." : "Create API Key"}
          </Button>
        </form>

        {error ? (
          <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        ) : null}

        {created ? (
          <div className="mt-4 space-y-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-3">
            <p className="text-sm font-semibold text-amber-900">
              Copy this key now
            </p>
            <code className="block break-all rounded bg-white px-2 py-2 text-xs text-slate-800">
              {created.plaintextKey}
            </code>
            <p className="text-xs text-amber-800">
              Key prefix: {created.prefix}
            </p>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
