const assert = require("assert");
const fs = require("fs");

const router = fs.readFileSync(
  "/home/eao168/PPV-Operator-OS/workflows/operator-os-phase-router.lobster",
  "utf8",
);
const executor = fs.readFileSync(
  "/home/eao168/openclaw/workflows/scoped-execution.lobster",
  "utf8",
);

assert(router.includes("legacy-v7"));
assert(router.includes("normalized-current"));
assert(router.includes("unsupported_id_family"));
assert(executor.includes("normalized_execution_proof_complete"));
assert(executor.includes("profile_read_failed"));
assert(executor.includes("/home/eao168/openclaw/src/workflow-normalization/profile-loader.cjs"));
console.log("PASS normalization router/executor static guards");
