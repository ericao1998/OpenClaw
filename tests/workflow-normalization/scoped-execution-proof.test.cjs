const assert = require("assert");
const fs = require("fs");
const { test } = require("node:test");

const WORKFLOW = "/home/eao168/openclaw/workflows/scoped-execution.lobster";
const ROUTER = "/home/eao168/PPV-Operator-OS/workflows/operator-os-phase-router.lobster";
const PROFILE = "/home/eao168/PPV-Operator-OS/adapters/operator-os/harness-profile.json";

async function getLobsterTool() {
  const lobster = (await import("/home/eao168/openclaw/dist/extensions/lobster/index.js")).default;
  const tools = [];
  lobster.register({ registerTool: (factory) => tools.push(factory({ sandboxed: false })) });
  return tools[0];
}

async function runLobster(pipeline, args) {
  const tool = await getLobsterTool();
  try {
    const result = await tool.execute("test", {
      action: "run",
      pipeline,
      argsJson: JSON.stringify(args),
    });
    return JSON.parse(result.content[0].text);
  } catch (error) {
    const msg = String((error && error.message) || error);
    const match = msg.match(/\{[\s\S]*\}$/);
    if (match) {
      return { ok: false, error: JSON.parse(match[0]) };
    }
    return { ok: false, error: { message: msg } };
  }
}

void test("executes supported current-lane id and records proof artifact", async () => {
  const result = await runLobster(WORKFLOW, { phase_id: "T6-PROOF-001", profile: PROFILE });
  assert.equal(result.ok, true);
  const output = result.output[0];
  assert.equal(output.status, "normalized_execution_proof_complete");
  assert.equal(output.workflow, "scoped-execution");
  assert.equal(output.task_family, "normalized-current");
  assert.ok(fs.existsSync(output.proof_artifact), "proof artifact missing");
  const artifact = JSON.parse(fs.readFileSync(output.proof_artifact, "utf8"));
  assert.equal(artifact.phase_id, "T6-PROOF-001");
  assert.equal(artifact.execution_controls.anti_drift, true);
  assert.ok(artifact.canonical_docs.issue_registry.endsWith("03-ISSUE-REGISTRY.md"));
  assert.ok(artifact.canonical_docs.active_handoff.endsWith("04-ACTIVE-HANDOFF.md"));
});

void test("router isolates legacy v7 from current lane", async () => {
  const legacy = await runLobster(ROUTER, { phase_id: "OOS-V7-123", profile: PROFILE });
  const current = await runLobster(ROUTER, { phase_id: "T6-PROOF-002", profile: PROFILE });
  assert.equal(legacy.ok, true);
  assert.equal(current.ok, true);
  assert.equal(legacy.output[0].family, "legacy-v7");
  assert.equal(current.output[0].family, "normalized-current");
  assert.ok(legacy.output[0].workflow.endsWith("/v7-phase.lobster"));
  assert.ok(current.output[0].workflow.endsWith("/scoped-execution.lobster"));
});

void test("fails closed on unsupported ids", async () => {
  const result = await runLobster(ROUTER, { phase_id: "BAD-123", profile: PROFILE });
  assert.equal(result.ok, false);
  assert.equal(result.error.failure_kind, "unsupported_id_family");
});

void test("fails closed on missing profile in executor", async () => {
  const result = await runLobster(WORKFLOW, { phase_id: "T6-PROOF-003", profile: "" });
  assert.equal(result.ok, false);
  assert.equal(result.error.failure_kind, "missing_profile");
});

void test("fails closed on invalid profile path", async () => {
  const result = await runLobster(WORKFLOW, {
    phase_id: "T6-PROOF-004",
    profile: "/tmp/does-not-exist.json",
  });
  assert.equal(result.ok, false);
  assert.equal(result.error.failure_kind, "profile_read_failed");
});
