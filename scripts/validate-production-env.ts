import {
  loadEnvConfig,
} from "@next/env";

import {
  validateProductionEnvironment,
  type ProductionEnvironmentCheck,
} from "../src/config/production-env-validation";

//--------------------------------------------------
// Load Next-Compatible Environment Files
//--------------------------------------------------

loadEnvConfig(
  process.cwd()
);

//--------------------------------------------------
// Validate
//--------------------------------------------------

const report =
  validateProductionEnvironment(
    process.env,
    {
      repoRoot:
        process.cwd(),

      discoverSourceReferences:
        true,
    }
  );

//--------------------------------------------------
// Safe Output
//
// IMPORTANT:
// This script never prints environment values,
// secret lengths, tokens, URLs, phone numbers, or
// credentials. Only variable names and validation
// outcomes are emitted.
//--------------------------------------------------

console.log(
  ""
);

console.log(
  "AI IVR Production Environment Validation"
);

console.log(
  "========================================"
);

console.log(
  `Tier: ${report.tier ?? "INVALID / UNSET"}`
);

console.log(
  `Static source env references discovered: ${report.discoveredEnvironmentReferences.length}`
);

console.log(
  ""
);

const orderedChecks =
  [
    ...report.checks,
  ].sort(
    compareChecks
  );

for (
  const check of
  orderedChecks
) {
  console.log(
    formatCheck(
      check
    )
  );
}

const failed =
  orderedChecks.filter(
    check =>
      check.level ===
      "FAIL"
  ).length;

const warned =
  orderedChecks.filter(
    check =>
      check.level ===
      "WARN"
  ).length;

const passed =
  orderedChecks.filter(
    check =>
      check.level ===
      "PASS"
  ).length;

console.log(
  ""
);

console.log(
  "Summary"
);

console.log(
  "-------"
);

console.log(
  `PASS: ${passed}`
);

console.log(
  `WARN: ${warned}`
);

console.log(
  `FAIL: ${failed}`
);

if (
  report
    .unclassifiedEnvironmentReferences
    .length >
  0
) {
  console.log(
    ""
  );

  console.log(
    "Unclassified source references"
  );

  console.log(
    "------------------------------"
  );

  for (
    const name of
    report
      .unclassifiedEnvironmentReferences
  ) {
    console.log(
      `- ${name}`
    );
  }
}

console.log(
  ""
);

if (
  !report.healthy
) {
  console.error(
    "R2 RESULT: NOT READY"
  );

  console.error(
    "Fix every FAIL item before the production release gate."
  );

  process.exitCode =
    1;
} else {
  console.log(
    "R2 RESULT: READY"
  );

  if (
    warned >
    0
  ) {
    console.log(
      "Warnings remain for operator review but no hard production configuration failure was found."
    );
  }
}

//--------------------------------------------------
// Formatting
//--------------------------------------------------

function formatCheck(
  check:
    ProductionEnvironmentCheck
): string {
  const marker =
    check.level ===
      "PASS"
      ? "[PASS]"
      : check.level ===
          "WARN"
        ? "[WARN]"
        : "[FAIL]";

  return `${marker} ${check.name} - ${check.message}`;
}

function compareChecks(
  left:
    ProductionEnvironmentCheck,
  right:
    ProductionEnvironmentCheck
): number {
  const priority:
    Record<
      ProductionEnvironmentCheck["level"],
      number
    > = {
      FAIL:
        0,
      WARN:
        1,
      PASS:
        2,
    };

  const priorityDifference =
    priority[left.level] -
    priority[right.level];

  if (
    priorityDifference !==
    0
  ) {
    return priorityDifference;
  }

  return left.name.localeCompare(
    right.name
  );
}
