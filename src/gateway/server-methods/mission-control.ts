import { formatErrorMessage } from "../../infra/errors.js";
import {
  readMissionControlRegistry,
  resolveMissionControlStorePath,
  writeMissionControlRegistry,
} from "../../mission-control/store.js";
import { ErrorCodes, errorShape } from "../protocol/index.js";
import type { GatewayRequestHandlers } from "./types.js";

function readRegistryParam(params: Record<string, unknown>) {
  const registry = params.registry;
  if (!registry || typeof registry !== "object" || Array.isArray(registry)) {
    return null;
  }
  return registry as Record<string, unknown>;
}

export const missionControlHandlers: GatewayRequestHandlers = {
  "missionControl.get": async ({ respond }) => {
    try {
      const registry = readMissionControlRegistry();
      respond(true, {
        registry,
        path: resolveMissionControlStorePath(),
      });
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, formatErrorMessage(err)));
    }
  },
  "missionControl.set": async ({ params, respond }) => {
    const registry = readRegistryParam(params);
    if (!registry) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "missionControl.set requires registry (object)"),
      );
      return;
    }
    try {
      writeMissionControlRegistry(registry);
      respond(true, {
        ok: true,
        path: resolveMissionControlStorePath(),
      });
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, formatErrorMessage(err)));
    }
  },
};
