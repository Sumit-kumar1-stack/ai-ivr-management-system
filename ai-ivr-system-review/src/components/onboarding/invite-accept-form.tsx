"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

type InvitationSummary = {
  email: string;
  fullName: string | null;
  role: string;
  tenant: {
    name: string;
    slug: string;
  };
};

export default function InviteAcceptForm({
  token,
  invitation,
}: {
  token: string;
  invitation: InvitationSummary;
}) {
  const router = useRouter();
  const [fullName, setFullName] = useState(invitation.fullName ?? "");
  const [password, setPassword] = useState("");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");

    try {
      const response = await fetch(`/api/onboarding/invitations/${token}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({
          fullName,
          password,
          phone: phone || undefined,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        setError(result.message ?? "Unable to complete onboarding");
        return;
      }

      router.push("/dashboard");
      router.refresh();
    } catch {
      setError("Unable to connect to the server");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mt-6 space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="rounded-xl bg-slate-50 p-4 text-sm text-slate-700">
        <p className="font-semibold text-slate-900">Tenant</p>
        <p>{invitation.tenant.name}</p>
        <p className="mt-2 font-semibold text-slate-900">Invitation email</p>
        <p>{invitation.email}</p>
      </div>

      <label className="block space-y-2 text-sm font-medium text-slate-700">
        <span>Full Name</span>
        <input
          value={fullName}
          onChange={event => setFullName(event.target.value)}
          required
          className="w-full rounded-lg border border-slate-200 px-3 py-2 outline-none focus:border-blue-500"
        />
      </label>

      <label className="block space-y-2 text-sm font-medium text-slate-700">
        <span>Password</span>
        <input
          value={password}
          onChange={event => setPassword(event.target.value)}
          type="password"
          required
          minLength={8}
          className="w-full rounded-lg border border-slate-200 px-3 py-2 outline-none focus:border-blue-500"
        />
      </label>

      <label className="block space-y-2 text-sm font-medium text-slate-700">
        <span>Phone</span>
        <input
          value={phone}
          onChange={event => setPhone(event.target.value)}
          type="tel"
          className="w-full rounded-lg border border-slate-200 px-3 py-2 outline-none focus:border-blue-500"
        />
      </label>

      {error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={loading}
        className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {loading ? "Completing..." : "Complete Onboarding"}
      </button>
    </form>
  );
}
