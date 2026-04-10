import { describe, expect, it } from "vitest";
import { PPV_WORKSPACE_REGISTRY } from "./mission-control-registry.ts";
import { classifyMissionControlIntake } from "./mission-control-router.ts";

describe("mission control router", () => {
  it("routes website work with explicit reasoning", () => {
    const decision = classifyMissionControlIntake(PPV_WORKSPACE_REGISTRY, {
      title: "Website attribution cleanup",
      request: "Fix Google Ads attribution and lead intake funnel tracking on the website.",
    });

    expect(decision).toMatchObject({
      domainId: "website",
      laneId: "ppv-website",
      routeId: "implementation-work",
      confidence: "high",
      fallbackToControl: false,
      requiresHandoff: false,
    });
    expect(decision.routingReason).toContain("Website");
    expect(decision.matchedKeywords).toEqual(
      expect.arrayContaining(["website", "attribution", "lead intake", "google ads"]),
    );
  });

  it("routes Salesforce handoff-style work with the handoff route", () => {
    const decision = classifyMissionControlIntake(PPV_WORKSPACE_REGISTRY, {
      title: "Salesforce handoff",
      request:
        "Prepare a Slack handoff summary for the active ILA SMS consent incident in Salesforce.",
    });

    expect(decision).toMatchObject({
      domainId: "salesforce",
      laneId: "ppv-salesforce",
      routeId: "alerts-and-handoffs",
      requiresHandoff: true,
      fallbackToControl: false,
    });
  });

  it("falls back to Control when there is no strong match", () => {
    const decision = classifyMissionControlIntake(PPV_WORKSPACE_REGISTRY, {
      title: "",
      request: "Need help figuring out where this should go.",
    });

    expect(decision).toMatchObject({
      domainId: "control",
      laneId: "ppv-control",
      routeId: "workspace-request",
      confidence: "low",
      fallbackToControl: true,
    });
  });

  it("falls back to Control when multiple domains match equally", () => {
    const decision = classifyMissionControlIntake(PPV_WORKSPACE_REGISTRY, {
      title: "Cross-domain routing",
      request: "Website and Salesforce.",
    });

    expect(decision).toMatchObject({
      domainId: "control",
      laneId: "ppv-control",
      routeId: "workspace-request",
      fallbackToControl: true,
      requiresHandoff: true,
    });
    expect(decision.routingReason).toContain("multiple domains equally");
  });

  it("marks schedule-sensitive work when reminders or deadlines are present", () => {
    const decision = classifyMissionControlIntake(PPV_WORKSPACE_REGISTRY, {
      title: "Infra follow-up",
      request: "Set up the infra reminder and follow-up cron before next week.",
    });

    expect(decision).toMatchObject({
      domainId: "infra",
      laneId: "ppv-infra",
      requiresSchedule: true,
    });
  });
});
