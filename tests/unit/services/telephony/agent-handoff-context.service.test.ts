import { describe, expect, it } from "vitest";
import { maskSensitiveData } from "@/services/telephony/agent-handoff-context.service";

describe("agent handoff sensitive-data masking", () => {
  it.each([
    ["PIN: 1234", "PIN: [REDACTED]"],
    ["otp=123456", "otp: [REDACTED]"],
    ["cvv 123", "cvv: [REDACTED]"],
    ["password hunter2", "password: [REDACTED]"],
    ["card 4111 1111 1111 1234", "**** **** **** 1234"],
    ["Authorization: Bearer abcdef", "Authorization: [REDACTED]"],
  ])("masks %s", (input, expected) => expect(maskSensitiveData(input)).toContain(expected));
});
