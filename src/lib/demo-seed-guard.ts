const PRODUCTION_DEMO_SEED_ACKNOWLEDGEMENT = "I_UNDERSTAND_THIS_CREATES_DEMO_USERS";

export function assertDemoSeedAllowed(env: NodeJS.ProcessEnv = process.env): void {
  if (env.NODE_ENV === "production" && env.ALLOW_PRODUCTION_DEMO_SEED !== PRODUCTION_DEMO_SEED_ACKNOWLEDGEMENT) {
    throw new Error("Refusing to seed demo users in production. Set ALLOW_PRODUCTION_DEMO_SEED to the documented acknowledgement only for an intentional one-off operation.");
  }
}

export { PRODUCTION_DEMO_SEED_ACKNOWLEDGEMENT };
