import bcrypt from "bcrypt";

import { UserRole } from "@prisma/client";

import { UserRepository } from "./user.repository";
import {
  CreateTenantUserInput,
  PlatformCreateUserInput,
} from "./user.schema";
import { getDefaultCampaignCapabilitiesForRole } from "./user-campaign-capabilities";

import {
  ConflictError,
  NotFoundError,
} from "@/lib/errors";

export const UserService = {
  async getUsers() {
    return UserRepository.findAll();
  },

  async getUsersForTenant(tenantId: string) {
    const id = tenantId.trim();

    if (!id) {
      throw new NotFoundError("Tenant not found");
    }

    return UserRepository.findAllForTenant(id);
  },

  async getUserById(id: string) {
    const user = await UserRepository.findById(id);

    if (!user) {
      throw new NotFoundError("User not found");
    }

    return user;
  },

  async getUserByIdForTenant(id: string, tenantId: string) {
    const user = await UserRepository.findByIdForTenant(
      id,
      tenantId.trim()
    );

    if (!user) {
      throw new NotFoundError("User not found");
    }

    return user;
  },

  async createUser(
    data:
      | CreateTenantUserInput
      | PlatformCreateUserInput,
    options?: {
      tenantId?: string | null;
    }
  ) {
    const existing = await UserRepository.findByEmail(data.email);

    if (existing) {
      throw new ConflictError("User already exists");
    }

    const hashedPassword = await bcrypt.hash(data.password, 10);
    const tenantId = options?.tenantId?.trim() ?? null;

    return UserRepository.create({
      ...data,
      tenantId,
      campaignCapabilities:
        getDefaultCampaignCapabilitiesForRole(
          data.role as UserRole
        ),
      password: hashedPassword,
    });
  },
};
