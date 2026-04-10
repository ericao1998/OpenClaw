import type { GatewayBrowserClient } from "./gateway.ts";
import {
  PPV_WORKSPACE_REGISTRY,
  type MissionControlTreeNode,
  type MissionControlWorkspaceRegistry,
} from "./mission-control-registry.ts";

export type MissionControlIntakeDraft = {
  laneId: string;
  routeId: string;
  title: string;
  request: string;
};

type PersistedMissionControlRegistry = {
  domains?: Array<{ id?: string; owner?: string; status?: string }>;
  sessionLanes?: Array<{ id?: string; owner?: string; purpose?: string }>;
  intakeRoutes?: Array<{ id?: string; laneId?: string; starterPrompt?: string }>;
  treeNodes?: import("./mission-control-registry.ts").MissionControlTreeNode[];
};

export type MissionControlState = {
  client: GatewayBrowserClient | null;
  connected: boolean;
  missionControlRegistry: MissionControlWorkspaceRegistry;
  lastError: string | null;
};

function cloneRegistry(registry: MissionControlWorkspaceRegistry): MissionControlWorkspaceRegistry {
  return JSON.parse(JSON.stringify(registry)) as MissionControlWorkspaceRegistry;
}

function createDefaultTreeNodes(base: MissionControlWorkspaceRegistry): MissionControlTreeNode[] {
  const workspaceId = `workspace:${base.id}`;
  return [
    {
      id: workspaceId,
      parentId: null,
      kind: "workspace" as const,
      label: `${base.name} Workspace`,
    },
    ...base.domains.map((domain) => ({
      id: `repo:${domain.id}`,
      parentId: workspaceId,
      kind: "repo" as const,
      label: domain.name,
      linkedDomainId: domain.id,
    })),
  ];
}

function materializeMissionControlRegistry(
  raw: unknown,
  base: MissionControlWorkspaceRegistry = cloneRegistry(PPV_WORKSPACE_REGISTRY),
): MissionControlWorkspaceRegistry {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return base;
  }
  const parsed = raw as PersistedMissionControlRegistry;
  const domainsById = new Map((parsed.domains ?? []).map((item) => [item.id ?? "", item]));
  const lanesById = new Map((parsed.sessionLanes ?? []).map((item) => [item.id ?? "", item]));
  const routesById = new Map((parsed.intakeRoutes ?? []).map((item) => [item.id ?? "", item]));
  return {
    ...base,
    treeNodes:
      Array.isArray(parsed.treeNodes) && parsed.treeNodes.length > 0
        ? parsed.treeNodes
        : createDefaultTreeNodes(base),
    domains: base.domains.map((domain) => {
      const persisted = domainsById.get(domain.id);
      return {
        ...domain,
        owner: typeof persisted?.owner === "string" ? persisted.owner : domain.owner,
        status: typeof persisted?.status === "string" ? persisted.status : domain.status,
      };
    }),
    sessionLanes: base.sessionLanes.map((lane) => {
      const persisted = lanesById.get(lane.id);
      return {
        ...lane,
        owner: typeof persisted?.owner === "string" ? persisted.owner : lane.owner,
        purpose: typeof persisted?.purpose === "string" ? persisted.purpose : lane.purpose,
      };
    }),
    intakeRoutes: base.intakeRoutes.map((route) => {
      const persisted = routesById.get(route.id);
      return {
        ...route,
        laneId: typeof persisted?.laneId === "string" ? persisted.laneId : route.laneId,
        starterPrompt:
          typeof persisted?.starterPrompt === "string"
            ? persisted.starterPrompt
            : route.starterPrompt,
      };
    }),
  };
}

export function createDefaultMissionControlRegistry(): MissionControlWorkspaceRegistry {
  return cloneRegistry(PPV_WORKSPACE_REGISTRY);
}

export async function loadMissionControlRegistry(state: MissionControlState) {
  if (!state.client || !state.connected) {
    return;
  }
  try {
    const response = (await state.client.request("missionControl.get", {})) as {
      registry?: unknown;
    } | null;
    state.missionControlRegistry = materializeMissionControlRegistry(response?.registry);
    state.lastError = null;
  } catch (err) {
    state.lastError = String(err);
  }
}

export async function saveMissionControlRegistry(state: MissionControlState) {
  if (!state.client || !state.connected) {
    return false;
  }
  try {
    await state.client.request("missionControl.set", {
      registry: state.missionControlRegistry,
    });
    state.lastError = null;
    return true;
  } catch (err) {
    state.lastError = String(err);
    return false;
  }
}

export function createMissionControlIntakeDraft(
  registry: MissionControlWorkspaceRegistry,
): MissionControlIntakeDraft {
  return {
    laneId: registry.sessionLanes[0]?.id ?? "",
    routeId: registry.intakeRoutes[0]?.id ?? "",
    title: "",
    request: "",
  };
}

export function normalizeMissionControlIntakeDraft(
  draft: MissionControlIntakeDraft,
  registry: MissionControlWorkspaceRegistry,
): MissionControlIntakeDraft {
  const laneExists = registry.sessionLanes.some((lane) => lane.id === draft.laneId);
  const routeExists = registry.intakeRoutes.some((route) => route.id === draft.routeId);
  return {
    laneId: laneExists ? draft.laneId : (registry.sessionLanes[0]?.id ?? ""),
    routeId: routeExists ? draft.routeId : (registry.intakeRoutes[0]?.id ?? ""),
    title: draft.title,
    request: draft.request,
  };
}
