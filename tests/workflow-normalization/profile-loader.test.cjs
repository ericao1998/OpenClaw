const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const {
  loadProfile,
  resolveProfilePath,
} = require("../../src/workflow-normalization/profile-loader.cjs");

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "oclaw-profile-loader-"));
const valid = path.join(tmp, "valid.json");
const invalid = path.join(tmp, "invalid.json");
fs.writeFileSync(
  valid,
  JSON.stringify({
    name: "website",
    target_repo_name: "PPV_Website",
    target_repo_label: "PPV Website",
    target_repo_path: "/tmp/repo",
    runtime_root: "/tmp/runtime",
    stack_label: "Website",
    task_prefix: "WEB-AUTO",
    docs: { active_handoff: "handoff.md" },
  }),
);
fs.writeFileSync(invalid, JSON.stringify({ name: "bad" }));

assert.equal(resolveProfilePath(valid, ""), valid);
assert.throws(() => resolveProfilePath("website", ""), /Non-path profile aliases/);
assert.throws(
  () => resolveProfilePath("", ""),
  /No explicit profile and no configured default profile/,
);
assert.equal(loadProfile(valid, "").validation.ok, true);
assert.deepEqual(loadProfile(invalid, "").validation.missing.includes("target_repo_name"), true);
console.log("PASS shared profile-loader fail-closed behavior");
