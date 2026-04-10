import { describe, expect, it, vi } from "vitest";
import {
  createDefaultMissionControlRegistry,
  loadMissionControlRegistry,
  saveMissionControlRegistry,
  type MissionControlState,
} from "./mission-control-store.ts";

type RequestFn = (method: string, params?: unknown) => Promise<unknown>;

function createState(
  request?: RequestFn,
  overrides: Partial<MissionControlState> = {},
): MissionControlState {
  return {
    client: request ? ({ request } as MissionControlState["client"]) : null,
    connected: true,
    missionControlRegistry: createDefaultMissionControlRegistry(),
    lastError: null,
    ...overrides,
  };
}

describe("mission control store", () => {
  it("loads registry overrides from the gateway and merges them onto the default registry", async () => {
    const request = vi.fn(async (method: string) => {
      expect(method).toBe("missionControl.get");
      return {
        registry: {
          domains: [{ id: "website", owner: "Growth Ops", status: "Priority lane" }],
          sessionLanes: [{ id: "ppv-salesforce", owner: "Revenue Ops" }],
          intakeRoutes: [
            {
              id: "implementation-work",
              laneId: "ppv-salesforce",
              starterPrompt: "Mission Control intake: take the Salesforce lane first.",
            },
          ],
        },
      };
    });
    const state = createState(request);

    await loadMissionControlRegistry(state);

    expect(request).toHaveBeenCalledWith("missionControl.get", {});
    expect(
      state.missionControlRegistry.domains.find((domain) => domain.id === "website"),
    ).toMatchObject({
      owner: "Growth Ops",
      status: "Priority lane",
    });
    expect(
      state.missionControlRegistry.sessionLanes.find((lane) => lane.id === "ppv-salesforce"),
    ).toMatchObject({ owner: "Revenue Ops" });
    expect(
      state.missionControlRegistry.intakeRoutes.find((route) => route.id === "implementation-work"),
    ).toMatchObject({
      laneId: "ppv-salesforce",
      starterPrompt: "Mission Control intake: take the Salesforce lane first.",
    });
    expect(state.lastError).toBeNull();
  });

  it("does nothing when the client is disconnected", async () => {
    const request = vi.fn(async () => ({}));
    const state = createState(request, { connected: false });

    await loadMissionControlRegistry(state);

    expect(request).not.toHaveBeenCalled();
  });

  it("stores load errors on the shared error surface", async () => {
    const state = createState(async () => {
      throw new Error("gateway unavailable");
    });

    await loadMissionControlRegistry(state);

    expect(state.lastError).toBe("Error: gateway unavailable");
  });

  it("persists the current registry through missionControl.set", async () => {
    const request = vi.fn(async () => ({ ok: true }));
    const state = createState(request);
    state.missionControlRegistry.domains[0] = {
      ...state.missionControlRegistry.domains[0],
      owner: "Updated owner",
    };

    const saved = await saveMissionControlRegistry(state);

    expect(saved).toBe(true);
    expect(request).toHaveBeenCalledWith("missionControl.set", {
      registry: state.missionControlRegistry,
    });
    expect(state.lastError).toBeNull();
  });

  it("returns false and stores an error when save fails", async () => {
    const state = createState(async () => {
      throw new Error("write failed");
    });

    const saved = await saveMissionControlRegistry(state);

    expect(saved).toBe(false);
    expect(state.lastError).toBe("Error: write failed");
  });
});
