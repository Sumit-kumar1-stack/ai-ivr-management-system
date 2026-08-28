import bcrypt from "bcrypt";

import { UserRepository } from "./user.repository";
import { CreateUserInput } from "./user.schema";

import {
  ConflictError,
  NotFoundError,
} from "@/lib/errors";

export const UserService = {
  async getUsers() {
    return UserRepository.findAll();
  },

  async getUserById(id: string) {
    const user = await UserRepository.findById(id);

    if (!user) {
      throw new NotFoundError("User not found");
    }

    return user;
  },

  async createUser(data: CreateUserInput) {
    const existing = await UserRepository.findByEmail(data.email);

    if (existing) {
      throw new ConflictError("User already exists");
    }

    const hashedPassword = await bcrypt.hash(data.password, 10);

    return UserRepository.create({
      ...data,
      password: hashedPassword,
    });
  },
};