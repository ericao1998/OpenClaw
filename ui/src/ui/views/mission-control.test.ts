/* @vitest-environment jsdom */

import { render } from "lit";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PPV_WORKSPACE_REGISTRY } from "../mission-control-registry.ts";
import { createMissionControlIntakeDraft } from "../mission-control-store.ts";
import { renderMissionControl, type MissionControlProps } from "./mission-control.ts";

function createProps(overrides: Partial<MissionControlProps> = {}): MissionControlProps {
  return {
    registry: PPV_WORKSPACE_REGISTRY,
    intakeDraft: createMissionControlIntakeDraft(PPV_WORKSPACE_REGISTRY),
    onNavigate: vi.fn(),
    onOpenSession: vi.fn(),
    onCreateLaneSession: vi.fn(),
    onRouteRequest: vi.fn(),
    onDomainOwnerChange: vi.fn(),
    onLaneOwnerChange: vi.fn(),
    onIntakeDraftChange: vi.fn(),
    onSubmitIntake: vi.fn(),
    onResetIntake: vi.fn(),
    summary: {
      connected: true,
      sessionsCount: 2,
      activeInstances: 1,
      agentsCount: 3,
      cronJobs: 4,
      defaultSessionKey: "agent:main:main",
    },
    sessions: [],
    ...overrides,
  };
}

describe("mission control view", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("renders the new shell, task board, and live activity rail", async () => {
    const container = document.createElement("div");
    render(renderMissionControl(createProps()), container);
    await Promise.resolve();

    expect(container.querySelector("[data-mission-control-shell]")).not.toBeNull();
    expect(container.querySelector("[data-mission-control-left-rail]")).not.toBeNull();
    expect(container.querySelector("[data-mission-control-board]")).not.toBeNull();
    expect(container.querySelector("[data-mission-control-activity-rail]")).not.toBeNull();
  });

  it("only commits owner edits on change, not on every input event", async () => {
    const onDomainOwnerChange = vi.fn();
    const container = document.createElement("div");
    render(
      renderMissionControl(
        createProps({
          onDomainOwnerChange,
        }),
      ),
      container,
    );
    await Promise.resolve();

    const input = container.querySelector(
      '[data-mission-control-owner="operator-os"]',
    ) as HTMLInputElement | null;
    expect(input).not.toBeNull();

    input!.value = "New owner";
    input!.dispatchEvent(new Event("input", { bubbles: true }));
    expect(onDomainOwnerChange).not.toHaveBeenCalled();

    input!.dispatchEvent(new Event("change", { bubbles: true }));
    expect(onDomainOwnerChange).toHaveBeenCalledWith("operator-os", "New owner");
  });

  it("routes the selected intake template back through the callback", async () => {
    const onRouteRequest = vi.fn();
    const container = document.createElement("div");
    render(
      renderMissionControl(
        createProps({
          onRouteRequest,
        }),
      ),
      container,
    );
    await Promise.resolve();

    const button = container.querySelector(
      '[data-mission-control-quick-route="implementation-work"]',
    ) as HTMLButtonElement | null;
    expect(button).not.toBeNull();

    button!.click();

    expect(onRouteRequest).toHaveBeenCalledWith(
      expect.objectContaining({ id: "implementation-work", laneId: "ppv-operator-os-stability" }),
    );
  });

  it("applies the suggested routing decision from the task shell", async () => {
    const onIntakeDraftChange = vi.fn();
    const container = document.createElement("div");
    render(
      renderMissionControl(
        createProps({
          onIntakeDraftChange,
          intakeDraft: {
            ...createMissionControlIntakeDraft(PPV_WORKSPACE_REGISTRY),
            title: "Website attribution cleanup",
            request: "Fix Google Ads attribution on the website landing page.",
          },
        }),
      ),
      container,
    );
    await Promise.resolve();

    const button = container.querySelector(
      "[data-mission-control-apply-suggestion]",
    ) as HTMLButtonElement | null;
    expect(button).not.toBeNull();

    button!.click();

    expect(onIntakeDraftChange).toHaveBeenCalledWith({
      routeId: "implementation-work",
      laneId: "ppv-website",
    });
  });

  it("renders team rooms and lets the operator prefill a team handoff", async () => {
    const onIntakeDraftChange = vi.fn();
    const container = document.createElement("div");
    render(
      renderMissionControl(
        createProps({
          onIntakeDraftChange,
        }),
      ),
      container,
    );
    await Promise.resolve();

    expect(container.querySelector("[data-mission-control-projects]")).not.toBeNull();

    const handoffButton = container.querySelector(
      '[data-mission-control-project-handoff="website"]',
    ) as HTMLButtonElement | null;
    expect(handoffButton).not.toBeNull();

    handoffButton!.click();

    expect(onIntakeDraftChange).toHaveBeenCalledWith({
      routeId: "implementation-work",
      laneId: "ppv-website",
    });
  });
});
