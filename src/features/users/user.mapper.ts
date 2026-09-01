import { User } from "@prisma/client";

export function toUserResponse(user: User) {
  return {
    id: user.id,
    fullName: user.fullName,
    email: user.email,
    role: user.role,
    campaignCapabilities: user.campaignCapabilities,
    phone: user.phone,
    avatar: user.avatar,
    tenantId: user.tenantId,
    accountStatus: user.accountStatus,
    emailVerifiedAt: user.emailVerifiedAt,
    invitedAt: user.invitedAt,
    onboardingCompletedAt: user.onboardingCompletedAt,
    isActive: user.isActive,
    lastLogin: user.lastLogin,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}
