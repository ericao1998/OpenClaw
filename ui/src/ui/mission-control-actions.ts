import type {
  MissionControlIntakeRoute,
  MissionControlWorkspaceRegistry,
} from "./mission-control-registry.ts";
import {
  normalizeMissionControlIntakeDraft,
  type MissionControlIntakeDraft,
} from "./mission-control-store.ts";

export function updateMissionControlDomainOwner(
  registry: MissionControlWorkspaceRegistry,
  domainId: string,
  owner: string,
): MissionControlWorkspaceRegistry {
  return {
    ...registry,
    domains: registry.domains.map((domain) =>
      domain.id === domainId ? { ...domain, owner } : domain,
    ),
  };
}

export function updateMissionControlLaneOwner(
  registry: MissionControlWorkspaceRegistry,
  laneId: string,
  owner: string,
): MissionControlWorkspaceRegistry {
  return {
    ...registry,
    sessionLanes: registry.sessionLanes.map((lane) =>
      lane.id === laneId ? { ...lane, owner } : lane,
    ),
  };
}

export function applyMissionControlRouteDraft(
  draft: MissionControlIntakeDraft,
  route: MissionControlIntakeRoute,
): MissionControlIntakeDraft {
  return {
    ...draft,
    routeId: route.id,
    laneId: route.laneId,
    title: route.title,
  };
}

export function applyMissionControlIntakeDraftPatch(
  draft: MissionControlIntakeDraft,
  patch: Partial<MissionControlIntakeDraft>,
  registry: MissionControlWorkspaceRegistry,
): MissionControlIntakeDraft {
  const nextPatch = { ...patch };
  if (typeof patch.routeId === "string" && typeof patch.laneId !== "string") {
    const route = registry.intakeRoutes.find((candidate) => candidate.id === patch.routeId);
    if (route) {
      nextPatch.laneId = route.laneId;
    }
  }
  return normalizeMissionControlIntakeDraft({ ...draft, ...nextPatch }, registry);
}

export type MissionControlIntakeSessionPayload =
  | {
      ok: true;
      label: string;
      message: string;
    }
  | {
      ok: false;
      error: string;
    };

export function buildMissionControlIntakeSessionPayload(
  registry: MissionControlWorkspaceRegistry,
  draft: MissionControlIntakeDraft,
): MissionControlIntakeSessionPayload {
  const lane =
    registry.sessionLanes.find((candidate) => candidate.id === draft.laneId) ??
    registry.sessionLanes[0];
  const route =
    registry.intakeRoutes.find((candidate) => candidate.id === draft.routeId) ??
    registry.intakeRoutes[0];
  const request = draft.request.trim();
  if (!lane || !route || !request) {
    return {
      ok: false,
      error: "Add a request and choose a lane before creating a routed session.",
    };
  }
  const title = draft.title.trim() || route.title;
  return {
    ok: true,
    label: `${lane.name} · ${title}`,
    message: `${route.starterPrompt}\n\nOperator request:\n${request}`,
  };
}
