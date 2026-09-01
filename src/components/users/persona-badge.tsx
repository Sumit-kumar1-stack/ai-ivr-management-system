import { Badge } from "@/components/ui/badge";
import {
  resolveAccessProfile,
  ACCESS_PROFILE_LABELS,
  type AccessProfile,
} from "@/features/users/user-campaign-capabilities";
import type { UserRole } from "@prisma/client";

const PROFILE_STYLES: Record<AccessProfile, string> = {
  SUPER_ADMIN: "bg-purple-100 text-purple-800 border-purple-300 dark:bg-purple-950/50 dark:text-purple-300",
  ORGANIZATION_ADMIN: "bg-blue-100 text-blue-800 border-blue-300 dark:bg-blue-950/50 dark:text-blue-300",
  MAKER: "bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-950/50 dark:text-emerald-300",
  CHECKER: "bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-950/50 dark:text-amber-300",
  DEVELOPER: "bg-fuchsia-100 text-fuchsia-800 border-fuchsia-300 dark:bg-fuchsia-950/50 dark:text-fuchsia-300",
  AGENT: "bg-slate-100 text-slate-800 border-slate-300 dark:bg-slate-800 dark:text-slate-300",
  CUSTOM: "bg-zinc-100 text-zinc-800 border-zinc-300 dark:bg-zinc-800 dark:text-zinc-300",
};

export function PersonaBadge({
  role,
  capabilities,
}: {
  role: UserRole;
  capabilities?: readonly string[] | null;
}) {
  const profile = resolveAccessProfile(role, capabilities);
  const label = ACCESS_PROFILE_LABELS[profile] ?? profile;
  const style = PROFILE_STYLES[profile] ?? PROFILE_STYLES.CUSTOM;

  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${style}`}
    >
      {label}
    </span>
  );
}
