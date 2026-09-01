"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Plug,
  Plus,
  RefreshCw,
  ShieldCheck,
  Globe,
  Lock,
  ExternalLink,
  Layers,
} from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";

export default function IntegrationsPage() {
  const queryClient = useQueryClient();
  const [showAddForm, setShowAddForm] = useState(false);
  const [name, setName] = useState("");
  const [actionCode, setActionCode] = useState("");
  const [endpointUrl, setEndpointUrl] = useState("");
  const [timeoutMs, setTimeoutMs] = useState("5000");
  const [requiredAuthLevel, setRequiredAuthLevel] = useState("AUTH_LEVEL_0");
  const [formError, setFormError] = useState<string | null>(null);

  const { data: endpoints = [], isLoading, refetch } = useQuery({
    queryKey: ["developer-integrations"],
    queryFn: async () => {
      const res = await fetch("/api/developer/integrations", { cache: "no-store" });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.message || "Failed to load integrations");
      }
      return json.data;
    },
  });

  const registerMutation = useMutation({
    mutationFn: async (payload: any) => {
      const res = await fetch("/api/developer/integrations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.message || "Failed to register integration");
      }
      return json.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["developer-integrations"] });
      setShowAddForm(false);
      setName("");
      setActionCode("");
      setEndpointUrl("");
      setTimeoutMs("5000");
      setFormError(null);
    },
    onError: (err: any) => {
      setFormError(err.message || "Registration failed");
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    if (!name.trim() || !actionCode.trim() || !endpointUrl.trim()) {
      setFormError("All required fields must be completed.");
      return;
    }
    registerMutation.mutate({
      name: name.trim(),
      actionCode: actionCode.trim().toUpperCase(),
      endpointUrl: endpointUrl.trim(),
      timeoutMs: Number(timeoutMs) || 5000,
      requiredAuthLevel,
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b pb-5 border-slate-200/80">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">External Integrations</h1>
          <p className="text-sm text-slate-500 mt-1">
            Registered external platform webhooks, CRM connectors, and transaction endpoints.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            className="gap-1.5 text-xs font-medium"
          >
            <RefreshCw size={14} /> Refresh
          </Button>
          <Button
            size="sm"
            onClick={() => setShowAddForm(!showAddForm)}
            className="gap-1.5 text-xs font-medium bg-blue-600 hover:bg-blue-700"
          >
            <Plus size={14} /> Register Integration
          </Button>
        </div>
      </div>

      {showAddForm && (
        <Card className="border-blue-200 bg-blue-50/20">
          <CardHeader>
            <CardTitle className="text-base font-semibold text-slate-900">
              Register New External Integration
            </CardTitle>
            <CardDescription>
              Configure an HTTPS endpoint and action code for deterministic IVR execution.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              {formError && (
                <div className="rounded-lg bg-rose-50 p-3 text-xs text-rose-700 border border-rose-200">
                  {formError}
                </div>
              )}

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-700">Integration Name *</label>
                  <Input
                    placeholder="e.g. CRM Customer Lookup"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-700">Action Code *</label>
                  <Input
                    placeholder="e.g. CRM_LOOKUP"
                    value={actionCode}
                    onChange={(e) => setActionCode(e.target.value)}
                    required
                  />
                </div>

                <div className="space-y-1.5 sm:col-span-2">
                  <label className="text-xs font-semibold text-slate-700">HTTPS Endpoint URL *</label>
                  <Input
                    type="url"
                    placeholder="https://api.yourdomain.com/ivr/action"
                    value={endpointUrl}
                    onChange={(e) => setEndpointUrl(e.target.value)}
                    required
                  />
                  <p className="text-[11px] text-slate-400">
                    SSRF protection enforced. Disallows localhost, private subnets, and metadata IPs.
                  </p>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-700">Required Auth Level</label>
                  <select
                    className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs transition-colors"
                    value={requiredAuthLevel}
                    onChange={(e) => setRequiredAuthLevel(e.target.value)}
                  >
                    <option value="AUTH_LEVEL_0">Level 0 (Unauthenticated / Public)</option>
                    <option value="AUTH_LEVEL_1">Level 1 (Verified Account / OTP)</option>
                    <option value="AUTH_LEVEL_2">Level 2 (High Security / Biometric)</option>
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-700">Timeout (ms)</label>
                  <Input
                    type="number"
                    value={timeoutMs}
                    onChange={(e) => setTimeoutMs(e.target.value)}
                    min="1000"
                    max="15000"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setShowAddForm(false)}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  disabled={registerMutation.isPending}
                  className="bg-blue-600 hover:bg-blue-700"
                >
                  {registerMutation.isPending ? "Registering..." : "Save Integration"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Integration Endpoints Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base font-semibold">Active Tenant Endpoints</CardTitle>
          <CardDescription>
            These actions are available to IVR Action nodes and Copilot for this organization.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex min-h-[150px] items-center justify-center text-sm text-slate-400">
              Loading registered integrations...
            </div>
          ) : endpoints.length === 0 ? (
            <div className="flex min-h-[150px] flex-col items-center justify-center text-center text-sm text-slate-400">
              <Plug size={28} className="text-slate-300 mb-2" />
              <p className="font-medium text-slate-600">No external integrations registered yet</p>
              <p className="text-xs text-slate-400 mt-1 max-w-sm">
                Register external webhook endpoints to enable your IVR flows to perform CRM checks, order lookups, and account updates.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b bg-slate-50 text-xs font-semibold text-slate-600 uppercase">
                  <tr>
                    <th className="py-3 px-4">Name</th>
                    <th className="py-3 px-4">Action Code</th>
                    <th className="py-3 px-4">Endpoint</th>
                    <th className="py-3 px-4">Auth Level</th>
                    <th className="py-3 px-4">Timeout</th>
                    <th className="py-3 px-4">Security</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {endpoints.map((ep: any) => (
                    <tr key={ep.id} className="hover:bg-slate-50/60">
                      <td className="py-3 px-4 font-medium text-slate-900">{ep.name}</td>
                      <td className="py-3 px-4">
                        <Badge variant="outline" className="font-mono text-xs">
                          {ep.actionCode}
                        </Badge>
                      </td>
                      <td className="py-3 px-4 font-mono text-xs text-slate-600 truncate max-w-[200px]">
                        {ep.endpointUrl}
                      </td>
                      <td className="py-3 px-4">
                        <Badge variant="secondary" className="text-xs">
                          {ep.requiredAuthLevel}
                        </Badge>
                      </td>
                      <td className="py-3 px-4 text-xs text-slate-600">{ep.timeoutMs}ms</td>
                      <td className="py-3 px-4">
                        <span className="inline-flex items-center gap-1 text-xs text-emerald-700 font-medium">
                          <ShieldCheck size={14} className="text-emerald-500" /> HTTPS Verified
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
