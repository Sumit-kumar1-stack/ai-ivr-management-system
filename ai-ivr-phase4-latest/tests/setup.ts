import {
  afterEach,
  beforeEach,
  vi,
} from "vitest";

//--------------------------------------------------
// Stable Test Environment
//--------------------------------------------------

vi.stubEnv(
  "NODE_ENV",
  "test"
);

vi.stubEnv(
  "JWT_SECRET",
  process.env.JWT_SECRET ??
    "test-jwt-secret-with-sufficient-length"
);

vi.stubEnv(
  "TWILIO_ACCOUNT_SID",
  process.env
    .TWILIO_ACCOUNT_SID ??
    "AC_TEST_ACCOUNT_SID"
);

vi.stubEnv(
  "TWILIO_AUTH_TOKEN",
  process.env
    .TWILIO_AUTH_TOKEN ??
    "test-auth-token"
);

vi.stubEnv(
  "TWILIO_PHONE_NUMBER",
  process.env
    .TWILIO_PHONE_NUMBER ??
    "+15005550006"
);

vi.stubEnv(
  "DATABASE_URL",
  process.env
    .TEST_DATABASE_URL ??
    process.env.DATABASE_URL ??
    "postgresql://test:test@localhost:5432/ivr_test"
);

vi.stubEnv(
  "REDIS_URL",
  process.env
    .TEST_REDIS_URL ??
    process.env.REDIS_URL ??
    "redis://127.0.0.1:6379"
);

//--------------------------------------------------
// Global Test Hooks
//--------------------------------------------------

beforeEach(
  () => {
    vi.clearAllMocks();
  }
);

afterEach(
  () => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  }
);