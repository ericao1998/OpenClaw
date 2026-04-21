const fs = require("fs");
const path = require("path");

function resolveProfilePath(profileRef, defaultProfile) {
  const value = (profileRef || "").trim();
  if (value) {
    if (value.includes(path.sep) || value.includes("/")) {
      return path.resolve(value);
    }
    throw new Error(
      `Non-path profile aliases are not supported by shared scoped execution: ${value}`,
    );
  }
  if (!defaultProfile) {
    throw new Error("No explicit profile and no configured default profile");
  }
  return path.resolve(defaultProfile);
}

function readProfile(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function validateProfile(profile) {
  const required = [
    "name",
    "target_repo_name",
    "target_repo_label",
    "target_repo_path",
    "runtime_root",
    "stack_label",
    "task_prefix",
    "docs",
  ];
  const missing = required.filter((key) =>
    key === "docs" ? !profile.docs || typeof profile.docs !== "object" : !profile[key],
  );
  return { ok: missing.length === 0, missing };
}

function loadProfile(profileRef, defaultProfile) {
  const profilePath = resolveProfilePath(profileRef, defaultProfile);
  let profile;
  try {
    profile = readProfile(profilePath);
  } catch (error) {
    const wrapped = new Error(`PROFILE_READ_FAILED:${profilePath}:${error.code || error.message}`);
    wrapped.code = error.code || "PROFILE_READ_FAILED";
    wrapped.profilePath = profilePath;
    throw wrapped;
  }
  const validation = validateProfile(profile);
  return { profilePath, profile, validation };
}

module.exports = { resolveProfilePath, readProfile, validateProfile, loadProfile };
