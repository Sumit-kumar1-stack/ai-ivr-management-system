"use client";

import { useState } from "react";

type Runtime = "CASCADED" | "GEMINI_LIVE";

interface InboundProfileOption {
  id: string;
  name: string;
  voiceRuntime: Runtime;
  numbers: string[];
}

export default function InboundRuntimeSettings({
  inboundProfiles,
  premiumVoiceEnabled,
}: {
  inboundProfiles: InboundProfileOption[];
  premiumVoiceEnabled: boolean;
}) {
  const [profiles, setProfiles] = useState(inboundProfiles);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  async function updateRuntime(profileId: string, voiceRuntime: Runtime) {
    setSavingId(profileId);
    setMessage("");

    try {
      const response = await fetch(`/api/inbound-profiles/${profileId}/voice-runtime`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({ voiceRuntime }),
      });
      const result = await response.json();

      if (!response.ok) {
        setMessage(result.message ?? "Unable to update inbound voice runtime");
        return;
      }

      setProfiles(current =>
        current.map(profile =>
          profile.id === profileId
            ? { ...profile, voiceRuntime: result.data.voiceRuntime }
            : profile
        )
      );
      setMessage("Inbound voice runtime saved.");
    } catch {
      setMessage("Unable to connect to the server");
    } finally {
      setSavingId(null);
    }
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-slate-50 p-6">
      <div>
        <h2 className="text-xl font-semibold text-slate-950">Inbound Voice Runtime</h2>
        <p className="mt-1 text-sm text-slate-600">
          Choose the server-enforced runtime for each inbound phone profile.
        </p>
      </div>

      {message && (
        <p className="mt-4 rounded-xl bg-white px-4 py-3 text-sm text-slate-700">
          {message}
        </p>
      )}

      {profiles.length === 0 ? (
        <p className="mt-4 rounded-xl bg-white px-4 py-3 text-sm text-slate-600">
          No inbound profiles are configured for this tenant.
        </p>
      ) : (
        <div className="mt-4 space-y-3">
          {profiles.map(profile => (
            <div
              className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 md:flex-row md:items-center md:justify-between"
              key={profile.id}
            >
              <div>
                <p className="font-semibold text-slate-900">{profile.name}</p>
                <p className="mt-1 text-sm text-slate-600">
                  {profile.numbers.length > 0 ? profile.numbers.join(", ") : "No active number"}
                </p>
              </div>
              <label className="text-sm font-medium text-slate-700">
                <span className="sr-only">Voice runtime for {profile.name}</span>
                <select
                  className="mt-1 rounded-lg border border-slate-300 bg-white px-3 py-2 outline-none focus:border-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={savingId === profile.id}
                  onChange={event => updateRuntime(profile.id, event.target.value as Runtime)}
                  value={profile.voiceRuntime}
                >
                  <option value="CASCADED">Standard (Cascaded)</option>
                  {premiumVoiceEnabled && (
                    <option value="GEMINI_LIVE">Premium (Realtime)</option>
                  )}
                </select>
              </label>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
