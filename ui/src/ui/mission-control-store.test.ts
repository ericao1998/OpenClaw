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
  it("builds default project tree nodes for a fresh registry", () => {
    const registry = createDefaultMissionControlRegistry();

    expect(registry.treeNodes?.[0]).toMatchObject({
      id: "workspace:ppv",
      kind: "workspace",
      parentId: null,
    });
    expect(
      registry.treeNodes?.some((node) => node.kind === "repo" && node.parentId === "workspace:ppv"),
    ).toBe(true);
    expect(
      registry.treeNodes?.some(
        (node) =>
          node.kind === "module" &&
          node.parentId === "repo:control" &&
          node.label === "Mission Control UI",
      ),
    ).toBe(true);
    expect(
      registry.treeNodes?.some(
        (node) =>
          node.kind === "module" &&
          node.label === "Project Tree" &&
          String(node.parentId).includes("mission-control-ui"),
      ),
    ).toBe(true);
  });

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

  it("migrates legacy folder-linked sessions into explicit chat leaves", async () => {
    const request = vi.fn(async () => ({
      registry: {
        treeNodes: [
          {
            id: "workspace:ppv",
            parentId: null,
            kind: "workspace",
            label: "Prime Property Ventures Workspace",
          },
          {
            id: "repo:control",
            parentId: "workspace:ppv",
            kind: "repo",
            label: "Control",
            linkedDomainId: "control",
            linkedSessionKey: "agent:openclaw:dashboard:control",
          },
          {
            id: "module:operator-os",
            parentId: "repo:control",
            kind: "module",
            label: "Operator OS",
            linkedSessionKey: "agent:openclaw:dashboard:operator-os",
          },
        ],
      },
    }));
    const state = createState(request);

    await loadMissionControlRegistry(state);

    const repoNode = state.missionControlRegistry.treeNodes?.find(
      (node) => node.id === "repo:control",
    );
    const moduleNode = state.missionControlRegistry.treeNodes?.find(
      (node) => node.id === "module:operator-os",
    );
    expect(repoNode?.linkedSessionKey).toBeUndefined();
    expect(moduleNode?.linkedSessionKey).toBeUndefined();
    expect(state.missionControlRegistry.treeNodes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          parentId: "repo:control",
          kind: "chat-module",
          label: "Project Chat",
          linkedSessionKey: "agent:openclaw:dashboard:control",
        }),
        expect.objectContaining({
          parentId: "module:operator-os",
          kind: "chat-module",
          label: "Chat",
          linkedSessionKey: "agent:openclaw:dashboard:operator-os",
        }),
      ]),
    );
  });

  it("does not duplicate migrated chat leaves when the leaf already exists", async () => {
    const request = vi.fn(async () => ({
      registry: {
        treeNodes: [
          {
            id: "workspace:ppv",
            parentId: null,
            kind: "workspace",
            label: "Prime Property Ventures Workspace",
          },
          {
            id: "repo:control",
            parentId: "workspace:ppv",
            kind: "repo",
            label: "Control",
            linkedSessionKey: "agent:openclaw:dashboard:control",
          },
          {
            id: "repo:control:chat",
            parentId: "repo:control",
            kind: "chat-module",
            label: "Project Chat",
            linkedSessionKey: "agent:openclaw:dashboard:control",
          },
        ],
      },
    }));
    const state = createState(request);

    await loadMissionControlRegistry(state);

    expect(
      state.missionControlRegistry.treeNodes?.filter(
        (node) =>
          node.parentId === "repo:control" &&
          node.kind === "chat-module" &&
          node.linkedSessionKey === "agent:openclaw:dashboard:control",
      ),
    ).toHaveLength(1);
    const repoNode = state.missionControlRegistry.treeNodes?.find(
      (node) => node.id === "repo:control",
    );
    expect(repoNode).not.toHaveProperty("linkedSessionKey");
  });

  it("seeds curated repo modules when a persisted tree only has repo roots", async () => {
    const request = vi.fn(async () => ({
      registry: {
        treeNodes: [
          {
            id: "workspace:ppv",
            parentId: null,
            kind: "workspace",
            label: "Prime Property Ventures Workspace",
          },
          {
            id: "repo:control",
            parentId: "workspace:ppv",
            kind: "repo",
            label: "Control",
            linkedDomainId: "control",
          },
        ],
      },
    }));
    const state = createState(request);

    await loadMissionControlRegistry(state);

    expect(state.missionControlRegistry.treeNodes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          parentId: "repo:control",
          kind: "module",
          label: "Mission Control UI",
        }),
        expect.objectContaining({
          kind: "module",
          label: "Project Tree",
        }),
      ]),
    );
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
