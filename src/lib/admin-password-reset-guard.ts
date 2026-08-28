const PRODUCTION_RESET_ACKNOWLEDGEMENT = "I_UNDERSTAND_THIS_RESETS_AN_ADMIN_PASSWORD";
const DEFAULT_DEMO_PASSWORDS = new Set(["Admin@123", "Admin@123456", "Creator@123", "Approver@123"]);

export function readAdminPasswordResetInput(env: NodeJS.ProcessEnv = process.env) {
  const email = env.RESET_ADMIN_EMAIL?.trim().toLowerCase();
  const password = env.RESET_ADMIN_PASSWORD;
  const fullName = env.RESET_ADMIN_FULL_NAME?.trim() || "System Admin";

  if (!email || !/^\S+@\S+\.\S+$/.test(email) || !password || password.length < 12) {
    throw new Error("RESET_ADMIN_EMAIL and a non-default RESET_ADMIN_PASSWORD of at least 12 characters are required.");
  }

  if (DEFAULT_DEMO_PASSWORDS.has(password)) {
    throw new Error("RESET_ADMIN_PASSWORD must not use a demo credential.");
  }

  if (env.NODE_ENV === "production" && env.CONFIRM_PRODUCTION_ADMIN_PASSWORD_RESET !== PRODUCTION_RESET_ACKNOWLEDGEMENT) {
    throw new Error("Refusing to reset an admin password in production without the explicit confirmation acknowledgement.");
  }

  return { email, password, fullName };
}

export { PRODUCTION_RESET_ACKNOWLEDGEMENT };
