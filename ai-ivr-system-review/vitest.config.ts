import {
  defineConfig,
} from "vitest/config";

export default defineConfig({
  resolve: {
    tsconfigPaths:
      true,
  },

  test: {
    environment:
      "node",

    globals:
      true,

    setupFiles: [
      "./tests/setup.ts",
    ],

    include: [
      "tests/**/*.test.ts",
      "tests/**/*.spec.ts",
    ],

    exclude: [
      "node_modules",
      ".next",
      "dist",
      "coverage",
    ],

    clearMocks:
      true,

    restoreMocks:
      true,

    mockReset:
      true,

    passWithNoTests:
      false,

    testTimeout:
      10_000,

    hookTimeout:
      10_000,

    coverage: {
      provider:
        "v8",

      reporter: [
        "text",
        "html",
        "json-summary",
      ],

      reportsDirectory:
        "./coverage",

      include: [
        "src/services/**/*.ts",
        "src/providers/**/*.ts",
        "src/lib/**/*.ts",
      ],

      exclude: [
        "src/**/*.d.ts",
        "src/**/*.types.ts",
        "src/**/index.ts",
        "src/lib/prisma.ts",
        "src/lib/redis.ts",
      ],

      thresholds: {
        statements:
          60,

        branches:
          50,

        functions:
          60,

        lines:
          60,
      },
    },
  },
});