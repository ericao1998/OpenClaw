name: scoped-execution
# Shared normalized scoped execution ingress for all repos using harness profiles.

args:
  phase_id: {}
  profile: {}

env:
  PHASE_ID: "${phase_id}"
  PROFILE: "${profile}"
  PROFILE_LOADER: "/home/eao168/openclaw/src/workflow-normalization/profile-loader.cjs"
  DEFAULT_PROFILE: "${profile}"

steps:
  - id: resolve_profile
    command: >-
      node -e '
        const phaseId = (process.env.PHASE_ID || "").trim();
        const profileArg = (process.env.PROFILE || "").trim();
        const loaderPath = process.env.PROFILE_LOADER;
        if (!phaseId) {
          console.error(JSON.stringify({ failure_kind: "missing_phase_id", rule_set: "scoped-execution@r3", message: "Missing phase_id" }));
          process.exit(1);
        }
        if (!profileArg) {
          console.error(JSON.stringify({ phase_id: phaseId, failure_kind: "missing_profile", rule_set: "scoped-execution@r3", message: "Missing profile" }));
          process.exit(1);
        }
        const { loadProfile } = require(loaderPath);
        const defaultProfile = (process.env.DEFAULT_PROFILE || "").trim();
        let result;
        try {
          result = loadProfile(profileArg, defaultProfile);
        } catch (error) {
          console.error(JSON.stringify({
            phase_id: phaseId,
            profile: profileArg,
            failure_kind: "profile_read_failed",
            rule_set: "scoped-execution@r3",
            profile_path: error.profilePath || null,
            message: error.message,
          }));
          process.exit(1);
        }
        if (!result.validation.ok) {
          console.error(JSON.stringify({
            phase_id: phaseId,
            profile: profileArg,
            failure_kind: "invalid_profile_contract",
            rule_set: "scoped-execution@r3",
            missing: result.validation.missing,
            profile_path: result.profilePath,
          }));
          process.exit(1);
        }
        process.stdout.write(JSON.stringify({
          phase_id: phaseId,
          profile: profileArg,
          profile_path: result.profilePath,
          target_repo_path: result.profile.target_repo_path,
          runtime_root: result.profile.runtime_root,
          docs: result.profile.docs,
          task_family: /^OOS-V7-/.test(phaseId) ? "legacy-v7" : "normalized-current"
        }));
      '

  - id: execute_scoped_proof
    command: >-
      node -e '
        const fs = require("fs");
        const path = require("path");
        const payload = JSON.parse(fs.readFileSync(0, "utf8"));
        const phaseId = payload.phase_id;
        const docs = payload.docs || {};
        const repoRoot = payload.target_repo_path;

        function fail(kind, message, extra = {}) {
          console.error(JSON.stringify({
            phase_id: phaseId,
            profile: payload.profile,
            profile_path: payload.profile_path,
            target_repo_path: repoRoot,
            task_family: payload.task_family,
            failure_kind: kind,
            rule_set: "scoped-execution@r3",
            message,
            ...extra,
          }));
          process.exit(1);
        }

        if (payload.task_family !== "normalized-current") {
          fail("unsupported_task_family", `Scoped executor only supports normalized-current proof lane, got ${payload.task_family}`);
        }
        if (!/^(OOS-V8-|V8-|TRANCHE-|T[6-9]-|C.+)/.test(phaseId)) {
          fail("unsupported_id_family", `Unsupported normalized id family: ${phaseId}`);
        }

        const registryRel = docs.issue_registry;
        const handoffRel = docs.active_handoff;
        if (!registryRel || !handoffRel) {
          fail("missing_canonical_docs", "Profile docs.issue_registry and docs.active_handoff are required", { docs });
        }

        const registryPath = path.join(repoRoot, registryRel);
        const handoffPath = path.join(repoRoot, handoffRel);
        if (!fs.existsSync(registryPath) || !fs.existsSync(handoffPath)) {
          fail("canonical_doc_missing", "Canonical docs not found on disk", { registry_path: registryPath, handoff_path: handoffPath });
        }

        const registry = fs.readFileSync(registryPath, "utf8");
        const handoff = fs.readFileSync(handoffPath, "utf8");
        const activeGateMatch = registry.match(/## Current Gate\n\n([\s\S]*?)(\n## |$)/);
        const handoffOverrideMatch = handoff.match(/## Current Override\n\n([\s\S]*?)(\n## |$)/);
        const nextAdmissible = (registry.match(/next admissible component is\s+([^\.\n]+)/i) || handoff.match(/Next admissible component:\s*([^\n]+)/i) || [null, null])[1];

        const scopedBrief = {
          phase_id: phaseId,
          target_repo_name: path.basename(repoRoot),
          target_repo_path: repoRoot,
          task_family: payload.task_family,
          profile_name: payload.profile && path.basename(path.dirname(payload.profile_path || payload.profile)),
          profile_path: payload.profile_path,
          runtime_root: payload.runtime_root,
          canonical_docs: {
            issue_registry: registryPath,
            active_handoff: handoffPath,
          },
          extracted_truth: {
            next_admissible_component: nextAdmissible ? nextAdmissible.trim() : null,
            registry_current_gate_excerpt: activeGateMatch ? activeGateMatch[1].trim().split(/\n/).slice(0, 8).join("\n") : null,
            active_handoff_override_excerpt: handoffOverrideMatch ? handoffOverrideMatch[1].trim().split(/\n/).slice(0, 10).join("\n") : null,
          },
          execution_controls: {
            anti_drift: true,
            fail_closed_profile_resolution: true,
            write_scope: "proof-only normalized execution skeleton",
            implementation_owner: "OpenClaw",
          },
          generated_at: new Date().toISOString(),
        };

        const proofDir = path.join(payload.runtime_root, "normalized-proof");
        fs.mkdirSync(proofDir, { recursive: true });
        const proofPath = path.join(proofDir, `${phaseId.replace(/[^A-Za-z0-9._-]/g, "_")}.json`);
        fs.writeFileSync(proofPath, JSON.stringify(scopedBrief, null, 2));

        process.stdout.write(JSON.stringify({
          ok: true,
          phase_id: phaseId,
          workflow: "scoped-execution",
          rule_set: "scoped-execution@r3",
          task_family: payload.task_family,
          profile: payload.profile,
          profile_path: payload.profile_path,
          target_repo_path: repoRoot,
          runtime_root: payload.runtime_root,
          registry_path: registryPath,
          active_handoff_path: handoffPath,
          proof_artifact: proofPath,
          scoped_brief: scopedBrief,
          status: "normalized_execution_proof_complete"
        }));
      '
    stdin: $resolve_profile.stdout
