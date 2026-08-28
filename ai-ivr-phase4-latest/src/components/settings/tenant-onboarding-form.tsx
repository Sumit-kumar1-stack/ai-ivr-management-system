"use client";

import { FormEvent, useState } from "react";

export default function TenantOnboardingForm() {
  const [tenantName, setTenantName] = useState("");
  const [tenantSlug, setTenantSlug] = useState("");
  const [adminFullName, setAdminFullName] = useState("");
  const [adminEmail, setAdminEmail] = useState("");
  const [inviteUrl, setInviteUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    setInviteUrl("");

    try {
      const response = await fetch("/api/tenants", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({
          tenantName,
          tenantSlug: tenantSlug || undefined,
          adminFullName,
          adminEmail,
          adminRole: "ADMIN",
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        setError(result.message ?? "Unable to create invitation");
        return;
      }

      setInviteUrl(result.data?.invitationUrl ?? "");
      setTenantName("");
      setTenantSlug("");
      setAdminFullName("");
      setAdminEmail("");
    } catch {
      setError("Unable to connect to the server");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mt-4 space-y-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="grid gap-4 md:grid-cols-2">
        <label className="space-y-2 text-sm font-medium text-slate-700">
          <span>Tenant Name</span>
          <input
            value={tenantName}
            onChange={event => setTenantName(event.target.value)}
            required
            className="w-full rounded-lg border border-slate-200 px-3 py-2 outline-none focus:border-blue-500"
            placeholder="Acme Bank"
          />
        </label>
        <label className="space-y-2 text-sm font-medium text-slate-700">
          <span>Tenant Slug</span>
          <input
            value={tenantSlug}
            onChange={event => setTenantSlug(event.target.value)}
            className="w-full rounded-lg border border-slate-200 px-3 py-2 outline-none focus:border-blue-500"
            placeholder="acme-bank"
          />
        </label>
        <label className="space-y-2 text-sm font-medium text-slate-700">
          <span>Admin Full Name</span>
          <input
            value={adminFullName}
            onChange={event => setAdminFullName(event.target.value)}
            required
            className="w-full rounded-lg border border-slate-200 px-3 py-2 outline-none focus:border-blue-500"
            placeholder="Campaign Approver"
          />
        </label>
        <label className="space-y-2 text-sm font-medium text-slate-700">
          <span>Admin Email</span>
          <input
            value={adminEmail}
            onChange={event => setAdminEmail(event.target.value)}
            type="email"
            required
            className="w-full rounded-lg border border-slate-200 px-3 py-2 outline-none focus:border-blue-500"
            placeholder="approver@ivr.com"
          />
        </label>
      </div>

      {error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      {inviteUrl && (
        <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          Invitation link created: <span className="font-semibold">{inviteUrl}</span>
        </p>
      )}

      <button
        type="submit"
        disabled={loading}
        className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {loading ? "Creating..." : "Create Tenant Invitation"}
      </button>
    </form>
  );
}
