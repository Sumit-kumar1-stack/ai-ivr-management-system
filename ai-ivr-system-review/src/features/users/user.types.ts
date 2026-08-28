export interface User {
  id: string;
  fullName: string;
  email: string;
  role: "SUPER_ADMIN" | "ADMIN" | "AGENT";
  phone?: string;
  avatar?: string;
  tenantId?: string | null;
  accountStatus?: string;
  emailVerifiedAt?: string | null;
  invitedAt?: string | null;
  onboardingCompletedAt?: string | null;
  isActive: boolean;
  createdAt: string;
}
