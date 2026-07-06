import bcrypt from "bcrypt";
import { UserRepository } from "./user.repository";
import { CreateUserInput } from "./user.schema";

export const UserService = {
  async getUsers() {
    return UserRepository.findAll();
  },

  async getUserById(id: string) {
    return UserRepository.findById(id);
  },

  async createUser(data: CreateUserInput) {
    const existing = await UserRepository.findByEmail(data.email);

    if (existing) {
      throw new Error("User already exists");
    }

    const hashedPassword = await bcrypt.hash(data.password, 10);

    return UserRepository.create({
      ...data,
      password: hashedPassword,
    });
  },
};