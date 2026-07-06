import { NextRequest } from "next/server";

import { asyncHandler } from "@/lib/async-handler";
import { success, created } from "@/lib/api-response";
import { ValidationError } from "@/lib/errors";

import { UserService } from "@/features/users/user.service";
import { CreateUserSchema } from "@/features/users/user.schema";
import { toUserResponse } from "@/features/users/user.mapper";

export const GET = asyncHandler(async () => {
  const users = await UserService.getUsers();

  return success(
    users.map(toUserResponse),
    "Users fetched successfully"
  );
});

export const POST = asyncHandler(async (req: NextRequest) => {
  const body = await req.json();

  const parsed = CreateUserSchema.safeParse(body);

  if (!parsed.success) {
    throw new ValidationError("Invalid request data");
  }

  const user = await UserService.createUser(parsed.data);

  return created(
    toUserResponse(user),
    "User created successfully"
  );
});