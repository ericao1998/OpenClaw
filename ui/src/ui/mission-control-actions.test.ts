import { describe, expect, it } from "vitest";
import {
  applyMissionControlIntakeDraftPatch,
  applyMissionControlRouteDraft,
  buildMissionControlIntakeSessionPayload,
  updateMissionControlDomainOwner,
  updateMissionControlLaneOwner,
} from "./mission-control-actions.ts";
import { PPV_WORKSPACE_REGISTRY } from "./mission-control-registry.ts";
import { createMissionControlIntakeDraft } from "./mission-control-store.ts";

describe("mission control actions", () => {
  it("updates domain owners without mutating the original registry", () => {
    const next = updateMissionControlDomainOwner(PPV_WORKSPACE_REGISTRY, "website", "Growth Ops");

    expect(next.domains.find((domain) => domain.id === "website")?.owner).toBe("Growth Ops");
    expect(PPV_WORKSPACE_REGISTRY.domains.find((domain) => domain.id === "website")?.owner).toBe(
      "Growth lane",
    );
  });

  it("updates lane owners without mutating the original registry", () => {
    const next = updateMissionControlLaneOwner(
      PPV_WORKSPACE_REGISTRY,
      "ppv-salesforce",
      "Revenue Ops",
    );

    expect(next.sessionLanes.find((lane) => lane.id === "ppv-salesforce")?.owner).toBe(
      "Revenue Ops",
    );
    expect(
      PPV_WORKSPACE_REGISTRY.sessionLanes.find((lane) => lane.id === "ppv-salesforce")?.owner,
    ).toBe("Claude / Delivery");
  });

  it("prefills the draft from a selected route", () => {
    const route = PPV_WORKSPACE_REGISTRY.intakeRoutes[1];
    const draft = applyMissionControlRouteDraft(
      {
        laneId: "ppv-control",
        routeId: "workspace-request",
        title: "Old title",
        request: "Keep this request",
      },
      route,
    );

    expect(draft).toEqual({
      laneId: route.laneId,
      routeId: route.id,
      title: route.title,
      request: "Keep this request",
    });
  });

  it("auto-syncs the lane when the route changes", () => {
    const draft = createMissionControlIntakeDraft(PPV_WORKSPACE_REGISTRY);

    const next = applyMissionControlIntakeDraftPatch(
      draft,
      { routeId: "implementation-work" },
      PPV_WORKSPACE_REGISTRY,
    );

    expect(next.routeId).toBe("implementation-work");
    expect(next.laneId).toBe("ppv-operator-os-stability");
  });

  it("keeps an explicit lane override when applying a route", () => {
    const draft = createMissionControlIntakeDraft(PPV_WORKSPACE_REGISTRY);

    const next = applyMissionControlIntakeDraftPatch(
      draft,
      { routeId: "implementation-work", laneId: "ppv-salesforce" },
      PPV_WORKSPACE_REGISTRY,
    );

    expect(next.routeId).toBe("implementation-work");
    expect(next.laneId).toBe("ppv-salesforce");
  });

  it("normalizes invalid route and lane ids back to defaults", () => {
    const next = applyMissionControlIntakeDraftPatch(
      {
        laneId: "missing-lane",
        routeId: "missing-route",
        title: "Title",
        request: "Request",
      },
      {},
      PPV_WORKSPACE_REGISTRY,
    );

    expect(next.laneId).toBe(PPV_WORKSPACE_REGISTRY.sessionLanes[0]?.id);
    expect(next.routeId).toBe(PPV_WORKSPACE_REGISTRY.intakeRoutes[0]?.id);
  });

  it("builds a routed session payload from the draft", () => {
    const payload = buildMissionControlIntakeSessionPayload(PPV_WORKSPACE_REGISTRY, {
      laneId: "ppv-salesforce",
      routeId: "alerts-and-handoffs",
      title: "  Urgent lead handoff  ",
      request: "  Check the active SMS incident and post the next owner.  ",
    });

    expect(payload).toEqual({
      ok: true,
      label: "PPV Salesforce · Urgent lead handoff",
      message:
        "Mission Control intake: prepare an alert or handoff summary, preserve the canonical state in OpenClaw, and make the next owner explicit.\n\nOperator request:\nCheck the active SMS incident and post the next owner.",
    });
  });

  it("falls back to the route title when no custom title is provided", () => {
    const payload = buildMissionControlIntakeSessionPayload(PPV_WORKSPACE_REGISTRY, {
      laneId: "ppv-control",
      routeId: "workspace-request",
      title: "   ",
      request: "Route this to the correct workspace lane.",
    });

    expect(payload).toEqual({
      ok: true,
      label: "PPV Control · Workspace request",
      message:
        "Mission Control intake: triage this workspace request, identify the owning repo/domain, define next actions, and hand off clearly.\n\nOperator request:\nRoute this to the correct workspace lane.",
    });
  });

  it("returns a user-facing error when the request is blank", () => {
    const payload = buildMissionControlIntakeSessionPayload(PPV_WORKSPACE_REGISTRY, {
      laneId: "ppv-control",
      routeId: "workspace-request",
      title: "Blank request",
      request: "   ",
    });

    expect(payload).toEqual({
      ok: false,
      error: "Add a request and choose a lane before creating a routed session.",
    });
  });
});
