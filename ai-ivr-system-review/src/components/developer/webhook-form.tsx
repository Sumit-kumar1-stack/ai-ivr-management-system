"use client";

import { useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

interface CreatedWebhook {
  id: string;
  name: string;
  secretPrefix: string;
  plaintextSecret: string;
}

export default function DeveloperWebhookForm() {
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [description, setDescription] = useState("");
  const [events, setEvents] = useState("CAMPAIGN_CREATED, CAMPAIGN_UPDATED");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<CreatedWebhook | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setBusy(true);
    setError(null);
    setCreated(null);

    try {
      const response = await fetch("/api/developer/webhooks", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name,
          url,
          description: description || null,
          events: events
            .split(",")
            .map(value => value.trim())
            .filter(Boolean),
        }),
      });

      const body = await response.json();

      if (!response.ok) {
        throw new Error(
          body.message || "Unable to create webhook"
        );
      }

      setCreated(body.webhook);
      setName("");
      setUrl("");
      setDescription("");
      setEvents("CAMPAIGN_CREATED, CAMPAIGN_UPDATED");
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "Unable to create webhook"
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Register Webhook</CardTitle>
        <CardDescription>
          Secrets are shown once. Only HTTPS endpoints are accepted.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form className="space-y-4" onSubmit={handleSubmit}>
          <div className="space-y-2">
            <label className="text-sm font-medium">Name</label>
            <Input
              value={name}
              onChange={event => setName(event.target.value)}
              placeholder="CRM sync"
              required
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Webhook URL</label>
            <Input
              type="url"
              value={url}
              onChange={event => setUrl(event.target.value)}
              placeholder="https://integration.example.com/webhooks/ivr"
              required
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Description</label>
            <Textarea
              value={description}
              onChange={event => setDescription(event.target.value)}
              placeholder="Optional context for the integration"
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Events</label>
            <Textarea
              value={events}
              onChange={event => setEvents(event.target.value)}
              placeholder="CAMPAIGN_CREATED, CAMPAIGN_UPDATED"
            />
          </div>
          <Button type="submit" disabled={busy}>
            {busy ? "Creating..." : "Create Webhook"}
          </Button>
        </form>

        {error ? (
          <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        ) : null}

        {created ? (
          <div className="mt-4 space-y-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-3">
            <p className="text-sm font-semibold text-emerald-900">
              Copy this secret now
            </p>
            <code className="block break-all rounded bg-white px-2 py-2 text-xs text-slate-800">
              {created.plaintextSecret}
            </code>
            <p className="text-xs text-emerald-800">
              Secret prefix: {created.secretPrefix}
            </p>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
