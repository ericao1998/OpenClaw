import fs from "node:fs";
import path from "node:path";
import { resolveConfigDir } from "../utils.js";

const MISSION_CONTROL_STORE_PATH = path.join(
  resolveConfigDir(process.env),
  "settings",
  "mission-control.json",
);

export function resolveMissionControlStorePath(): string {
  return MISSION_CONTROL_STORE_PATH;
}

export function readMissionControlRegistry(): Record<string, unknown> | null {
  try {
    if (!fs.existsSync(MISSION_CONTROL_STORE_PATH)) {
      return null;
    }
    const parsed = JSON.parse(fs.readFileSync(MISSION_CONTROL_STORE_PATH, "utf8")) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return null;
    }
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

export function writeMissionControlRegistry(registry: Record<string, unknown>): void {
  fs.mkdirSync(path.dirname(MISSION_CONTROL_STORE_PATH), { recursive: true });
  fs.writeFileSync(
    MISSION_CONTROL_STORE_PATH,
    `${JSON.stringify(registry, null, 2).trimEnd()}\n`,
    "utf8",
  );
}
