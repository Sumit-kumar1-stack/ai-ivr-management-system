import TenantOnboardingForm from "@/components/settings/tenant-onboarding-form";

import { getCurrentUser } from "@/lib/auth";

export default async function SettingsPage() {
  const user = await getCurrentUser();
  const isSuperAdmin = user?.role === "SUPER_ADMIN";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-slate-950">
          Settings
        </h1>
        <p className="mt-2 text-slate-600">
          Manage platform onboarding and administration.
        </p>
      </div>

      <section className="rounded-2xl border border-slate-200 bg-slate-50 p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold text-slate-950">
              Tenant Onboarding
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              Create a new tenant and issue an invitation link for the first tenant administrator.
            </p>
          </div>
          <div className="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-blue-700">
            Super Admin
          </div>
        </div>

        {isSuperAdmin ? (
          <TenantOnboardingForm />
        ) : (
          <p className="mt-4 rounded-xl bg-white px-4 py-3 text-sm text-slate-600">
            Tenant onboarding is available to super administrators only.
          </p>
        )}
      </section>
    </div>
  );
}
