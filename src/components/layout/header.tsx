import { UserRole } from "@prisma/client";
import { isSuperAdminSelfApprovalOverrideEnabled } from "@/services/security/governance-override.service";

function getRoleLabel(role: UserRole): string {
  switch (role) {
    case UserRole.SUPER_ADMIN:
      return "Platform Admin";
    case UserRole.ADMIN:
      return "Tenant Admin";
    default:
      return "Campaign Operator";
  }
}

export default function Header({
  role,
}: {
  role: UserRole;
}) {
  const showOverrideIndicator =
    role === UserRole.SUPER_ADMIN && isSuperAdminSelfApprovalOverrideEnabled();

  return (
    <header className="border-b border-slate-200/80 bg-white h-16 flex items-center justify-between px-8 shadow-sm shadow-slate-100/50">
      <div className="flex items-center gap-3">
        <h1 className="text-sm font-semibold text-slate-850 tracking-tight">
          Enterprise Workspace
        </h1>
        {showOverrideIndicator && (
          <span
            id="super-admin-testing-override-badge"
            className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-amber-50 text-amber-800 border border-amber-300 shadow-sm"
          >
            <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse" />
            Testing Mode: Super Admin Self-Approval Enabled
          </span>
        )}
      </div>

      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
          <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
            Systems Nominal
          </span>
        </div>
        <div className="h-4 w-px bg-slate-200" />
        <div className="flex items-center gap-2">
          <div className="h-7 w-7 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center text-xs font-bold text-slate-600">
            AD
          </div>
          <span className="text-xs font-semibold text-slate-700">
            {getRoleLabel(role)}
          </span>
        </div>
      </div>
    </header>
  );
}
