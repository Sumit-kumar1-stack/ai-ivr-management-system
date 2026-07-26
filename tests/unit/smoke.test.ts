import {
  describe,
  expect,
  it,
} from "vitest";

describe(
  "testing environment",
  () => {
    it(
      "runs a basic Vitest test",
      () => {
        expect(
          1 + 1
        ).toBe(
          2
        );
      }
    );

    it(
      "loads the test environment",
      () => {
        expect(
          process.env.NODE_ENV
        ).toBe(
          "test"
        );

        expect(
          process.env.JWT_SECRET
        ).toBeTruthy();
      }
    );
  }
);