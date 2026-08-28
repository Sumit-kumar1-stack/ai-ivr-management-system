import {
  AccountStatus,
  PrismaClient,
  SubscriptionPlanTier,
  SubscriptionStatus,
  TenantStatus,
  UserRole,
} from "@prisma/client";
import bcrypt from "bcrypt";
import { assertDemoSeedAllowed } from "../src/lib/demo-seed-guard";

const prisma = new PrismaClient();

async function main() {
  assertDemoSeedAllowed();
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
      planTier: SubscriptionPlanTier.PREMIUM,
      status: SubscriptionStatus.ACTIVE,
      entitlements: [
        "SMS",
        "WHATSAPP",
        "AI_VOICE",
        "IVR",
        "PREMIUM_VOICE",
        "SMART_CHANNELING",
        "ADVANCED_ANALYTICS",
        "OMNICHANNEL_FALLBACK",
        "HUMAN_TRANSFER",
      ],
    },
    update: {
      provider: null,
      planTier: SubscriptionPlanTier.PREMIUM,
      status: SubscriptionStatus.ACTIVE,
      entitlements: [
        "SMS",
        "WHATSAPP",
        "AI_VOICE",
        "IVR",
        "PREMIUM_VOICE",
        "SMART_CHANNELING",
        "ADVANCED_ANALYTICS",
        "OMNICHANNEL_FALLBACK",
        "HUMAN_TRANSFER",
      ],
    },
  });

  const inboundProfile = await prisma.inboundProfile.upsert({
    where: {
      tenantId_name: {
        tenantId: tenant.id,
        name: "Demo Premium Inbound",
      },
    },
    create: {
      tenantId: tenant.id,
      name: "Demo Premium Inbound",
      active: true,
      voiceRuntime: "GEMINI_LIVE",
    },
    update: {
      active: true,
      voiceRuntime: "GEMINI_LIVE",
    },
  });

  const demoTwilioNumber = process.env.TWILIO_PHONE_NUMBER?.trim();

  if (demoTwilioNumber) {
    const existingInboundNumber = await prisma.inboundNumber.findUnique({
      where: {
        provider_providerNumber: {
          provider: "TWILIO",
          providerNumber: demoTwilioNumber,
        },
      },
      select: {
        id: true,
        tenantId: true,
      },
    });

    if (!existingInboundNumber) {
      await prisma.inboundNumber.create({
        data: {
          tenantId: tenant.id,
          inboundProfileId: inboundProfile.id,
          provider: "TWILIO",
          providerNumber: demoTwilioNumber,
          active: true,
        },
      });
    } else if (existingInboundNumber.tenantId === tenant.id) {
      await prisma.inboundNumber.update({
        where: {
          id: existingInboundNumber.id,
        },
        data: {
          inboundProfileId: inboundProfile.id,
          active: true,
        },
      });
    } else {
      console.warn("Demo inbound number is already assigned to another tenant; it was not changed.");
    }
  }

  // Keep provider-specific inbound numbers on provider-specific profiles.
  // The profile is seeded only when a configured Plivo caller ID is valid;
  // this avoids silently reusing the Twilio demo profile or inventing a
  // number in an environment where Plivo is not configured.
  const demoPlivoNumber = normalizeE164(process.env.PLIVO_CALLER_ID);

  if (demoPlivoNumber) {
    const plivoInboundProfile = await prisma.inboundProfile.upsert({
      where: {
        tenantId_name: {
          tenantId: tenant.id,
          name: "Demo Plivo Inbound",
        },
      },
      create: {
        tenantId: tenant.id,
        name: "Demo Plivo Inbound",
        active: true,
        voiceRuntime: "GEMINI_LIVE",
      },
      update: {
        active: true,
        voiceRuntime: "GEMINI_LIVE",
      },
    });

    const existingInboundNumber = await prisma.inboundNumber.findUnique({
      where: {
        provider_providerNumber: {
          provider: "PLIVO",
          providerNumber: demoPlivoNumber,
        },
      },
      select: {
        id: true,
        tenantId: true,
      },
    });

    if (!existingInboundNumber) {
      await prisma.inboundNumber.create({
        data: {
          tenantId: tenant.id,
          inboundProfileId: plivoInboundProfile.id,
          provider: "PLIVO",
          providerNumber: demoPlivoNumber,
          active: true,
        },
      });
    } else if (existingInboundNumber.tenantId === tenant.id) {
      await prisma.inboundNumber.update({
        where: { id: existingInboundNumber.id },
        data: {
          inboundProfileId: plivoInboundProfile.id,
          active: true,
        },
      });
    } else {
      console.warn("Demo Plivo inbound number is already assigned to another tenant; it was not changed.");
    }
  }

  await seedUser({
    fullName: "Super Admin",
    email: "admin@ivr.com",
    password: "Admin@123",
    role: UserRole.SUPER_ADMIN,
    campaignCapabilities: [
      "CAMPAIGN_CREATE",
      "CAMPAIGN_EDIT",
      "CAMPAIGN_SUBMIT",
      "CAMPAIGN_REVIEW",
      "CAMPAIGN_APPROVE",
      "CAMPAIGN_REJECT",
      "CAMPAIGN_LAUNCH",
      "CAMPAIGN_DELETE",
      "IVR_PUBLISH",
    ],
    tenantId: tenant.id,
    accountStatus: AccountStatus.ACTIVE,
    emailVerifiedAt: new Date(),
    onboardingCompletedAt: new Date(),
  });

  await seedUser({
    fullName: "Campaign Creator",
    email: "creator@ivr.com",
    password: "Creator@123",
    role: UserRole.ADMIN,
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
      "CAMPAIGN_DELETE",
      "IVR_PUBLISH",
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

function normalizeE164(value: string | undefined): string | null {
  const normalized = value?.trim().replace(/[\s()-]/g, "") ?? "";
  return /^\+[1-9]\d{7,14}$/.test(normalized) ? normalized : null;
}

main()
  .finally(async () => {
    await prisma.$disconnect();
  });
