import {
  AccountStatus,
  PrismaClient,
  SubscriptionPlanTier,
  SubscriptionStatus,
  TenantStatus,
  UserRole,
} from "@prisma/client";
import bcrypt from "bcrypt";

const prisma = new PrismaClient();

async function main() {
  const tenant = await prisma.tenant.upsert({
    where: {
      slug: "demo-ivr",
    },
    create: {
      name: "Demo IVR Tenant",
      slug: "demo-ivr",
      status: TenantStatus.ACTIVE,
      activatedAt: new Date(),
    },
    update: {
      name: "Demo IVR Tenant",
      status: TenantStatus.ACTIVE,
      activatedAt: new Date(),
    },
  });

  await prisma.tenantSubscription.upsert({
    where: {
      tenantId: tenant.id,
    },
    create: {
      tenantId: tenant.id,
      provider: null,
      planTier: SubscriptionPlanTier.STANDARD,
      status: SubscriptionStatus.TRIALING,
      entitlements: [],
    },
    update: {
      provider: null,
      planTier: SubscriptionPlanTier.STANDARD,
      status: SubscriptionStatus.TRIALING,
      entitlements: [],
    },
  });

  await seedUser({
    fullName: "Super Admin",
    email: "admin@ivr.com",
    password: "Admin@123",
    role: UserRole.SUPER_ADMIN,
    campaignCapabilities: [
      "CAMPAIGN_CREATE",
      "CAMPAIGN_EDIT",
      "CAMPAIGN_SUBMIT",
      "CAMPAIGN_LAUNCH",
    ],
    tenantId: tenant.id,
    accountStatus: AccountStatus.ACTIVE,
    emailVerifiedAt: new Date(),
    onboardingCompletedAt: new Date(),
  });

  await seedUser({
    fullName: "Campaign Approver",
    email: "approver@ivr.com",
    password: "Approver@123",
    role: UserRole.ADMIN,
    campaignCapabilities: [
      "CAMPAIGN_REVIEW",
      "CAMPAIGN_APPROVE",
      "CAMPAIGN_REJECT",
    ],
    tenantId: tenant.id,
    accountStatus: AccountStatus.ACTIVE,
    emailVerifiedAt: new Date(),
    onboardingCompletedAt: new Date(),
  });

  console.log("Development users seeded.");
}

async function seedUser({
  fullName,
  email,
  password,
  role,
  campaignCapabilities,
  tenantId,
  accountStatus,
  emailVerifiedAt,
  onboardingCompletedAt,
}: {
  fullName: string;
  email: string;
  password: string;
  role: UserRole;
  campaignCapabilities: string[];
  tenantId: string;
  accountStatus: AccountStatus;
  emailVerifiedAt: Date;
  onboardingCompletedAt: Date;
}) {
  const hashedPassword = await bcrypt.hash(password, 10);

  await prisma.user.upsert({
    where: {
      email,
    },
    create: {
      fullName,
      email,
      password: hashedPassword,
      role,
      campaignCapabilities,
      tenantId,
      accountStatus,
      emailVerifiedAt,
      onboardingCompletedAt,
    },
    update: {
      fullName,
      password: hashedPassword,
      role,
      campaignCapabilities,
      tenantId,
      accountStatus,
      emailVerifiedAt,
      onboardingCompletedAt,
    },
  });
}

main()
  .finally(async () => {
    await prisma.$disconnect();
  });
