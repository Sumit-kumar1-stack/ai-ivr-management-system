import { notFound } from "next/navigation";

import InviteAcceptForm from "@/components/onboarding/invite-accept-form";

import { getTenantInvitationByToken } from "@/features/onboarding/onboarding.service";

interface PageProps {
  params: Promise<{
    token: string;
  }>;
}

export default async function OnboardingPage({
  params,
}: PageProps) {
  const { token } = await params;
  const invitation = await getTenantInvitationByToken(token);

  if (!invitation) {
    notFound();
  }

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-12">
      <div className="mx-auto max-w-2xl">
        <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
          <p className="text-sm font-semibold uppercase tracking-[0.24em] text-blue-600">
            Tenant Onboarding
          </p>
          <h1 className="mt-3 text-3xl font-bold text-slate-950">
            Complete your invitation
          </h1>
          <p className="mt-2 text-slate-600">
            Set up access for {invitation.email} in {invitation.tenant.name}.
          </p>

          <InviteAcceptForm
            token={token}
            invitation={{
              email: invitation.email,
              fullName: invitation.fullName,
              role: invitation.role,
              tenant: {
                name: invitation.tenant.name,
                slug: invitation.tenant.slug,
              },
            }}
          />
        </div>
      </div>
    </main>
  );
}
