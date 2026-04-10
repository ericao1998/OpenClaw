import { html, nothing } from "lit";
import { t } from "../../i18n/index.ts";
import { formatRelativeTimestamp } from "../format.ts";
import {
  findLaneSessions,
  type MissionControlDomain,
  type MissionControlIntakeRoute,
  type MissionControlSessionLane,
  type MissionControlWorkspaceRegistry,
} from "../mission-control-registry.ts";
import {
  classifyMissionControlIntake,
  type MissionControlRoutingDecision,
  type MissionControlRoutingConfidence,
} from "../mission-control-router.ts";
import type { MissionControlIntakeDraft } from "../mission-control-store.ts";
import type { GatewaySessionRow } from "../types.ts";

type MissionControlNavTab = "overview" | "sessions" | "agents" | "channels";
type MissionControlBoardColumn = "queue" | "active" | "review" | "handoff";
type MissionControlTaskPriority = "critical" | "high" | "medium";

type MissionControlSummary = {
  connected: boolean;
  sessionsCount: number;
  activeInstances: number;
  agentsCount: number;
  cronJobs: number;
  defaultSessionKey: string | null;
};

export type MissionControlProps = {
  registry: MissionControlWorkspaceRegistry;
  intakeDraft: MissionControlIntakeDraft;
  onNavigate: (tab: MissionControlNavTab) => void;
  onOpenSession: (sessionKey: string) => void;
  onCreateLaneSession: (lane: MissionControlSessionLane) => void | Promise<void>;
  onRouteRequest: (route: MissionControlIntakeRoute) => void | Promise<void>;
  onDomainOwnerChange: (domainId: string, owner: string) => void;
  onLaneOwnerChange: (laneId: string, owner: string) => void;
  onIntakeDraftChange: (patch: Partial<MissionControlIntakeDraft>) => void;
  onSubmitIntake: () => void | Promise<void>;
  onResetIntake: () => void;
  summary: MissionControlSummary;
  sessions: GatewaySessionRow[];
};

type LaneBinding = {
  lane: MissionControlSessionLane;
  sessions: GatewaySessionRow[];
};

type MissionControlTaskBlueprint = {
  id: string;
  laneId: string;
  routeId: string;
  column: MissionControlBoardColumn;
  title: string;
  summary: string;
  priority: MissionControlTaskPriority;
  tags: string[];
  schedule: string | null;
  requiresHandoff?: boolean;
  requiresSchedule?: boolean;
};

type MissionControlTaskCard = {
  id: string;
  column: MissionControlBoardColumn;
  lane: MissionControlSessionLane;
  domain: MissionControlDomain;
  route: MissionControlIntakeRoute | null;
  title: string;
  summary: string;
  priority: MissionControlTaskPriority;
  tags: string[];
  owner: string;
  schedule: string | null;
  requiresHandoff: boolean;
  requiresSchedule: boolean;
  isDraft: boolean;
  sessions: GatewaySessionRow[];
  latestUpdatedAt: number | null;
};

type MissionControlActivityItem = {
  id: string;
  title: string;
  detail: string;
  meta: string;
  tone: "" | "ok" | "danger";
  actionLabel: string;
  onAction: () => void | Promise<void>;
};

type MissionControlStatCard = {
  id: string;
  label: string;
  value: string;
  detail: string;
  accent: string;
};

type MissionControlSectionItem = {
  id: string;
  label: string;
  count: string;
  detail: string;
  active?: boolean;
  live?: boolean;
};

const INPUT_STYLE =
  "width: 100%; padding: 10px 12px; border-radius: 12px; border: 1px solid rgba(148, 163, 184, 0.22); background: rgba(15, 23, 42, 0.62); color: inherit; box-sizing: border-box;";

const PANEL_STYLE =
  "border-radius: 20px; border: 1px solid rgba(148, 163, 184, 0.16); background: linear-gradient(180deg, rgba(15, 23, 42, 0.92), rgba(15, 23, 42, 0.78)); box-shadow: 0 18px 42px rgba(15, 23, 42, 0.22);";

const BOARD_COLUMNS: Array<{ id: MissionControlBoardColumn; tone: string }> = [
  { id: "queue", tone: "rgba(249, 115, 22, 0.18)" },
  { id: "active", tone: "rgba(14, 165, 233, 0.18)" },
  { id: "review", tone: "rgba(16, 185, 129, 0.18)" },
  { id: "handoff", tone: "rgba(244, 114, 182, 0.18)" },
];

const TASK_BLUEPRINTS: MissionControlTaskBlueprint[] = [
  {
    id: "control-router",
    laneId: "ppv-control",
    routeId: "workspace-request",
    column: "queue",
    title: "Route launch-week operator requests",
    summary:
      "Keep cross-domain asks in Control until ownership and the next repo lane are explicit.",
    priority: "high",
    tags: ["routing", "ownership"],
    schedule: "Next 30 min",
  },
  {
    id: "lead-crawler-backlog",
    laneId: "ppv-lead-crawler",
    routeId: "implementation-work",
    column: "queue",
    title: "Stabilize enrichment retry budget",
    summary:
      "Tighten acquisition backlog handling before crawler output spills into downstream review.",
    priority: "medium",
    tags: ["crawler", "pipeline"],
    schedule: "Today",
  },
  {
    id: "website-attribution",
    laneId: "ppv-website",
    routeId: "implementation-work",
    column: "active",
    title: "Close attribution leak on intake landing page",
    summary: "Preserve campaign visibility through form submit and keep the growth lane unblocked.",
    priority: "critical",
    tags: ["website", "google ads"],
    schedule: "Now",
  },
  {
    id: "salesforce-consent",
    laneId: "ppv-salesforce",
    routeId: "alerts-and-handoffs",
    column: "handoff",
    title: "Publish next owner for the SMS consent incident",
    summary:
      "Prepare the Slack-facing handoff while keeping the canonical state inside the session lane.",
    priority: "high",
    tags: ["salesforce", "slack"],
    schedule: "Today 17:00 UTC",
    requiresHandoff: true,
  },
  {
    id: "operator-os-governor",
    laneId: "ppv-operator-os-stability",
    routeId: "implementation-work",
    column: "review",
    title: "Harden vendor fallback governor",
    summary:
      "Review the latest stability slice before the execution lane carries it into wider rollout.",
    priority: "high",
    tags: ["operator os", "stability"],
    schedule: null,
  },
  {
    id: "infra-gateway",
    laneId: "ppv-infra",
    routeId: "implementation-work",
    column: "review",
    title: "Audit gateway bind and node reachability",
    summary: "Confirm the platform lane is still safe for the next round of remote operations.",
    priority: "medium",
    tags: ["infra", "gateway"],
    schedule: "Tomorrow",
    requiresSchedule: true,
  },
];

function latestUpdatedAt(sessions: GatewaySessionRow[]): number | null {
  const timestamps = sessions
    .map((row) => row.updatedAt)
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  if (timestamps.length === 0) {
    return null;
  }
  return Math.max(...timestamps);
}

function sortSessionsByUpdate(sessions: GatewaySessionRow[]): GatewaySessionRow[] {
  return [...sessions].toSorted((left, right) => (right.updatedAt ?? 0) - (left.updatedAt ?? 0));
}

function findDraftLane(
  registry: MissionControlWorkspaceRegistry,
  draft: MissionControlIntakeDraft,
) {
  return (
    registry.sessionLanes.find((lane) => lane.id === draft.laneId) ??
    registry.sessionLanes[0] ??
    null
  );
}

function findDraftRoute(
  registry: MissionControlWorkspaceRegistry,
  draft: MissionControlIntakeDraft,
) {
  return (
    registry.intakeRoutes.find((route) => route.id === draft.routeId) ??
    registry.intakeRoutes[0] ??
    null
  );
}

function findDomainById(registry: MissionControlWorkspaceRegistry, domainId: string) {
  return registry.domains.find((domain) => domain.id === domainId) ?? null;
}

function findDomainForLane(
  registry: MissionControlWorkspaceRegistry,
  lane: MissionControlSessionLane,
) {
  return findDomainById(registry, lane.domainId);
}

function findDomainLanes(
  registry: MissionControlWorkspaceRegistry,
  domainId: string,
): MissionControlSessionLane[] {
  return registry.sessionLanes.filter((lane) => lane.domainId === domainId);
}

function confidenceTone(confidence: MissionControlRoutingConfidence): "" | "ok" | "danger" {
  if (confidence === "high") {
    return "ok";
  }
  if (confidence === "low") {
    return "danger";
  }
  return "";
}

function priorityTone(priority: MissionControlTaskPriority): "" | "ok" | "danger" {
  if (priority === "critical") {
    return "danger";
  }
  if (priority === "medium") {
    return "ok";
  }
  return "";
}

function sectionStateLabel(item: MissionControlSectionItem) {
  if (item.active) {
    return t("missionControl.shell.active");
  }
  if (item.live) {
    return t("missionControl.shell.live");
  }
  return t("missionControl.shell.standby");
}

function renderOwnerEditor(
  item: MissionControlDomain | MissionControlSessionLane,
  onChange: (value: string) => void,
) {
  return html`
    <label style="display: block; min-width: 160px;">
      <div class="muted" style="margin-bottom: 6px; text-align: left;">
        ${t("missionControl.registry.owner")}
      </div>
      <input
        data-mission-control-owner=${item.id}
        .value=${item.owner}
        style=${INPUT_STYLE}
        @change=${(event: Event) => onChange((event.target as HTMLInputElement).value)}
      />
    </label>
  `;
}

function renderStatCard(card: MissionControlStatCard) {
  return html`
    <div
      class="card"
      data-mission-control-stat=${card.id}
      style=${`${PANEL_STYLE} padding: 16px; background: linear-gradient(135deg, ${card.accent}, rgba(15, 23, 42, 0.94));`}
    >
      <div class="muted">${card.label}</div>
      <div style="margin-top: 10px; font-size: 28px; font-weight: 700; letter-spacing: -0.02em;">
        ${card.value}
      </div>
      <div class="card-sub" style="margin-top: 8px; line-height: 1.5;">${card.detail}</div>
    </div>
  `;
}

function renderRailSection(item: MissionControlSectionItem) {
  return html`
    <div
      data-mission-control-section=${item.id}
      style=${[
        "padding: 12px 14px;",
        "border-radius: 16px;",
        "border: 1px solid rgba(148, 163, 184, 0.14);",
        item.active
          ? "background: linear-gradient(135deg, rgba(14, 165, 233, 0.22), rgba(15, 23, 42, 0.82));"
          : "background: rgba(15, 23, 42, 0.52);",
      ].join(" ")}
    >
      <div class="row" style="justify-content: space-between; gap: 12px; align-items: baseline;">
        <div style="font-weight: 600;">${item.label}</div>
        <span class="chip ${item.active ? "ok" : ""}">${item.count}</span>
      </div>
      <div class="muted" style="margin-top: 8px; line-height: 1.45;">${item.detail}</div>
      <div
        style="margin-top: 10px; font-size: 12px; letter-spacing: 0.06em; text-transform: uppercase; color: rgba(148, 163, 184, 0.95);"
      >
        ${sectionStateLabel(item)}
      </div>
    </div>
  `;
}

function renderActionButton(
  label: string,
  onClick: () => void | Promise<void>,
  dataAttr?: [string, string],
) {
  if (dataAttr?.[0] === "data-mission-control-quick-route") {
    return html`
      <button class="btn btn--sm" data-mission-control-quick-route=${dataAttr[1]} @click=${onClick}>
        ${label}
      </button>
    `;
  }
  if (dataAttr?.[0] === "data-mission-control-project-handoff") {
    return html`
      <button
        class="btn btn--sm"
        data-mission-control-project-handoff=${dataAttr[1]}
        @click=${onClick}
      >
        ${label}
      </button>
    `;
  }
  return html`<button class="btn btn--sm" @click=${onClick}>${label}</button>`;
}

function renderTaskCard(task: MissionControlTaskCard, props: MissionControlProps) {
  const routeLabel = task.route?.title ?? t("missionControl.board.routeFallback");
  const session = task.sessions[0] ?? null;
  return html`
    <div
      data-mission-control-task=${task.id}
      style=${`${PANEL_STYLE} padding: 16px; background: linear-gradient(180deg, rgba(15, 23, 42, 0.94), rgba(15, 23, 42, 0.78));`}
    >
      <div class="row" style="justify-content: space-between; gap: 12px; align-items: flex-start;">
        <div style="min-width: 0;">
          <div style="font-size: 16px; font-weight: 700; line-height: 1.35;">${task.title}</div>
          <div class="muted" style="margin-top: 8px; line-height: 1.5;">${task.summary}</div>
        </div>
        <span class="chip ${priorityTone(task.priority)}"
          >${t(`missionControl.board.priority.${task.priority}`)}</span
        >
      </div>
      <div class="chip-row" style="margin-top: 12px;">
        <span class="chip">${task.domain.name}</span>
        <span class="chip mono">${task.domain.repo}</span>
        <span class="chip">${routeLabel}</span>
        ${task.isDraft
          ? html`<span class="chip danger">${t("missionControl.board.draft")}</span>`
          : nothing}
        ${task.requiresHandoff
          ? html`<span class="chip">${t("missionControl.board.requiresHandoff")}</span>`
          : nothing}
        ${task.requiresSchedule
          ? html`<span class="chip">${t("missionControl.board.requiresSchedule")}</span>`
          : nothing}
      </div>
      <div
        style="margin-top: 14px; display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 10px;"
      >
        <div>
          <div class="muted">${t("missionControl.board.ownerLabel")}</div>
          <div style="margin-top: 4px;">${task.owner}</div>
        </div>
        <div>
          <div class="muted">${t("missionControl.board.laneLabel")}</div>
          <div style="margin-top: 4px;">${task.lane.name}</div>
        </div>
        <div>
          <div class="muted">${t("missionControl.board.scheduleLabel")}</div>
          <div style="margin-top: 4px;">
            ${task.schedule ?? t("missionControl.board.noSchedule")}
          </div>
        </div>
      </div>
      <div class="chip-row" style="margin-top: 14px;">
        ${task.tags.map((tag) => html`<span class="chip">${tag}</span>`)}
        ${session
          ? html`<span class="chip ok"
              >${session.label || session.displayName || session.key}</span
            >`
          : html`<span class="chip">${t("missionControl.board.noLiveSession")}</span>`}
      </div>
      <div
        class="row"
        style="margin-top: 16px; justify-content: space-between; gap: 12px; align-items: center; flex-wrap: wrap;"
      >
        <div class="muted">
          ${task.latestUpdatedAt
            ? t("missionControl.board.latestActivity", {
                time: formatRelativeTimestamp(task.latestUpdatedAt),
              })
            : t("missionControl.board.noRecentActivity")}
        </div>
        <div class="row" style="gap: 8px; flex-wrap: wrap;">
          ${task.route
            ? html`
                <button class="btn btn--sm" @click=${() => props.onRouteRequest(task.route!)}>
                  ${t("missionControl.board.useRoute")}
                </button>
              `
            : nothing}
          ${session
            ? html`
                <button
                  class="btn btn--sm primary"
                  data-mission-control-task-session=${task.id}
                  @click=${() => props.onOpenSession(session.key)}
                >
                  ${t("missionControl.board.openSession")}
                </button>
              `
            : html`
                <button
                  class="btn btn--sm primary"
                  data-mission-control-task-create=${task.id}
                  @click=${() => props.onCreateLaneSession(task.lane)}
                >
                  ${t("missionControl.board.createSession")}
                </button>
              `}
        </div>
      </div>
    </div>
  `;
}

function renderBoardColumn(
  columnId: MissionControlBoardColumn,
  tasks: MissionControlTaskCard[],
  props: MissionControlProps,
) {
  const columnTasks = tasks.filter((task) => task.column === columnId);
  const accent =
    BOARD_COLUMNS.find((column) => column.id === columnId)?.tone ?? "rgba(148, 163, 184, 0.16)";
  return html`
    <div
      data-mission-control-column=${columnId}
      style=${`${PANEL_STYLE} padding: 14px; background: linear-gradient(180deg, ${accent}, rgba(15, 23, 42, 0.92));`}
    >
      <div class="row" style="justify-content: space-between; gap: 12px; align-items: center;">
        <div>
          <div style="font-size: 15px; font-weight: 700;">
            ${t(`missionControl.board.columns.${columnId}.title`)}
          </div>
          <div class="card-sub" style="margin-top: 4px;">
            ${t(`missionControl.board.columns.${columnId}.subtitle`)}
          </div>
        </div>
        <span class="pill">${String(columnTasks.length)}</span>
      </div>
      <div style="margin-top: 14px; display: grid; gap: 12px;">
        ${columnTasks.length > 0
          ? columnTasks.map((task) => renderTaskCard(task, props))
          : html`
              <div
                style=${`${PANEL_STYLE} padding: 16px; border-style: dashed; background: rgba(15, 23, 42, 0.42);`}
              >
                <div style="font-weight: 600;">${t("missionControl.board.emptyTitle")}</div>
                <div class="muted" style="margin-top: 6px; line-height: 1.5;">
                  ${t(`missionControl.board.columns.${columnId}.empty`)}
                </div>
              </div>
            `}
      </div>
    </div>
  `;
}

function buildBoardTasks(
  props: MissionControlProps,
  laneBindings: LaneBinding[],
  routingDecision: MissionControlRoutingDecision,
) {
  const tasks: MissionControlTaskCard[] = TASK_BLUEPRINTS.flatMap((blueprint) => {
    const lane = props.registry.sessionLanes.find((candidate) => candidate.id === blueprint.laneId);
    if (!lane) {
      return [];
    }
    const domain = findDomainForLane(props.registry, lane);
    if (!domain) {
      return [];
    }
    const route =
      props.registry.intakeRoutes.find((candidate) => candidate.id === blueprint.routeId) ?? null;
    const sessions =
      laneBindings.find((binding) => binding.lane.id === lane.id)?.sessions ??
      findLaneSessions(lane, props.sessions);
    const orderedSessions = sortSessionsByUpdate(sessions);
    return [
      {
        id: blueprint.id,
        column: blueprint.column,
        lane,
        domain,
        route,
        title: blueprint.title,
        summary: blueprint.summary,
        priority: blueprint.priority,
        tags: blueprint.tags,
        owner: lane.owner,
        schedule: blueprint.schedule,
        requiresHandoff: Boolean(blueprint.requiresHandoff),
        requiresSchedule: Boolean(blueprint.requiresSchedule),
        isDraft: false,
        sessions: orderedSessions,
        latestUpdatedAt: latestUpdatedAt(orderedSessions),
      },
    ];
  });

  const draftTitle = props.intakeDraft.title.trim();
  const draftRequest = props.intakeDraft.request.trim();
  const hasDraftContent = draftTitle.length > 0 || draftRequest.length > 0;
  const draftLane = findDraftLane(props.registry, props.intakeDraft);
  const draftRoute = findDraftRoute(props.registry, props.intakeDraft);
  const routingDomain = findDomainById(props.registry, routingDecision.domainId);
  if (hasDraftContent && draftLane && draftRoute && routingDomain) {
    const sessions =
      laneBindings.find((binding) => binding.lane.id === draftLane.id)?.sessions ??
      findLaneSessions(draftLane, props.sessions);
    tasks.unshift({
      id: "draft-intake",
      column: "queue",
      lane: draftLane,
      domain: routingDomain,
      route: draftRoute,
      title: draftTitle || t("missionControl.actionBar.draftFallbackTitle"),
      summary: draftRequest || draftRoute.detail,
      priority: routingDecision.confidence === "high" ? "high" : "medium",
      tags: routingDecision.matchedKeywords.slice(0, 3),
      owner: draftLane.owner,
      schedule: routingDecision.requiresSchedule
        ? t("missionControl.board.scheduleRequested")
        : null,
      requiresHandoff: routingDecision.requiresHandoff,
      requiresSchedule: routingDecision.requiresSchedule,
      isDraft: true,
      sessions: sortSessionsByUpdate(sessions),
      latestUpdatedAt: latestUpdatedAt(sessions),
    });
  }

  return tasks;
}

function buildStats(
  props: MissionControlProps,
  tasks: MissionControlTaskCard[],
  laneBindings: LaneBinding[],
) {
  const liveSessionCount = laneBindings.reduce(
    (count, binding) => count + binding.sessions.length,
    0,
  );
  const approvalsCount = tasks.filter(
    (task) => task.column === "review" || task.column === "handoff" || task.requiresHandoff,
  ).length;
  const atRiskCount = tasks.filter(
    (task) =>
      task.priority === "critical" || (task.sessions.length === 0 && task.column !== "queue"),
  ).length;
  const scheduledCount = tasks.filter(
    (task) => task.requiresSchedule || task.schedule !== null,
  ).length;

  const stats: MissionControlStatCard[] = [
    {
      id: "tasks",
      label: t("missionControl.stats.tasks"),
      value: String(tasks.length),
      detail: t("missionControl.stats.tasksDetail", {
        count: String(tasks.filter((task) => task.isDraft).length),
      }),
      accent: "rgba(14, 165, 233, 0.28)",
    },
    {
      id: "sessions",
      label: t("missionControl.stats.sessions"),
      value: String(liveSessionCount || props.summary.sessionsCount),
      detail: t("missionControl.stats.sessionsDetail", {
        mapped: String(laneBindings.filter((binding) => binding.sessions.length > 0).length),
        total: String(laneBindings.length),
      }),
      accent: "rgba(16, 185, 129, 0.24)",
    },
    {
      id: "approvals",
      label: t("missionControl.stats.approvals"),
      value: String(approvalsCount),
      detail: t("missionControl.stats.approvalsDetail"),
      accent: "rgba(244, 114, 182, 0.22)",
    },
    {
      id: "risk",
      label: t("missionControl.stats.risk"),
      value: String(atRiskCount),
      detail: t("missionControl.stats.riskDetail", { count: String(scheduledCount) }),
      accent: "rgba(249, 115, 22, 0.22)",
    },
  ];

  return {
    stats,
    liveSessionCount,
    approvalsCount,
  };
}

function buildSections(
  props: MissionControlProps,
  tasks: MissionControlTaskCard[],
  approvalsCount: number,
): MissionControlSectionItem[] {
  const docsCount = props.registry.domains.reduce(
    (count, domain) => count + domain.docsPaths.length,
    0,
  );
  const memoryCount = props.registry.domains.reduce(
    (count, domain) => count + domain.memorySources.length,
    0,
  );
  return [
    {
      id: "tasks",
      label: t("missionControl.shell.sections.tasks"),
      count: String(tasks.length),
      detail: t("missionControl.shell.sectionDetail.tasks"),
      active: true,
      live: true,
    },
    {
      id: "agents",
      label: t("missionControl.shell.sections.agents"),
      count: String(props.summary.agentsCount),
      detail: t("missionControl.shell.sectionDetail.agents"),
      live: props.summary.agentsCount > 0,
    },
    {
      id: "approvals",
      label: t("missionControl.shell.sections.approvals"),
      count: String(approvalsCount),
      detail: t("missionControl.shell.sectionDetail.approvals"),
      live: approvalsCount > 0,
    },
    {
      id: "calendar",
      label: t("missionControl.shell.sections.calendar"),
      count: String(tasks.filter((task) => task.schedule !== null).length),
      detail: t("missionControl.shell.sectionDetail.calendar"),
    },
    {
      id: "projects",
      label: t("missionControl.shell.sections.projects"),
      count: String(props.registry.domains.length),
      detail: t("missionControl.shell.sectionDetail.projects"),
      live: true,
    },
    {
      id: "memory",
      label: t("missionControl.shell.sections.memory"),
      count: String(memoryCount),
      detail: t("missionControl.shell.sectionDetail.memory"),
    },
    {
      id: "docs",
      label: t("missionControl.shell.sections.docs"),
      count: String(docsCount),
      detail: t("missionControl.shell.sectionDetail.docs"),
    },
    {
      id: "team",
      label: t("missionControl.shell.sections.team"),
      count: String(props.registry.sessionLanes.length),
      detail: t("missionControl.shell.sectionDetail.team"),
      live: true,
    },
    {
      id: "system",
      label: t("missionControl.shell.sections.system"),
      count: String(props.summary.activeInstances),
      detail: t("missionControl.shell.sectionDetail.system"),
      live: props.summary.connected,
    },
  ];
}

function buildActivityItems(
  props: MissionControlProps,
  laneBindings: LaneBinding[],
  routingDecision: MissionControlRoutingDecision,
): MissionControlActivityItem[] {
  const items: MissionControlActivityItem[] = [];
  const draftTitle = props.intakeDraft.title.trim();
  const draftRequest = props.intakeDraft.request.trim();
  const routingDomain = findDomainById(props.registry, routingDecision.domainId);
  if ((draftTitle || draftRequest) && routingDomain) {
    items.push({
      id: "suggested-route",
      title: t("missionControl.activity.suggestedRouteTitle", {
        domain: routingDomain.name,
      }),
      detail: routingDecision.routingReason,
      meta: routingDecision.suggestedNextAction,
      tone: confidenceTone(routingDecision.confidence),
      actionLabel: t("missionControl.router.apply"),
      onAction: () =>
        props.onIntakeDraftChange({
          routeId: routingDecision.routeId,
          laneId: routingDecision.laneId,
        }),
    });
  }

  const liveSessions = laneBindings
    .flatMap((binding) =>
      sortSessionsByUpdate(binding.sessions)
        .slice(0, 1)
        .map((session) => ({
          lane: binding.lane,
          session,
        })),
    )
    .toSorted((left, right) => (right.session.updatedAt ?? 0) - (left.session.updatedAt ?? 0));

  items.push(
    ...liveSessions.slice(0, 3).map(({ lane, session }) => ({
      id: `session-${lane.id}`,
      title: t("missionControl.activity.liveSessionTitle", {
        lane: lane.name,
      }),
      detail: session.label || session.displayName || session.key,
      meta: session.updatedAt
        ? t("missionControl.activity.sessionMeta", {
            time: formatRelativeTimestamp(session.updatedAt),
          })
        : lane.purpose,
      tone: "ok" as const,
      actionLabel: t("missionControl.board.openSession"),
      onAction: () => props.onOpenSession(session.key),
    })),
  );

  const idleLane = laneBindings.find((binding) => binding.sessions.length === 0);
  if (idleLane) {
    items.push({
      id: `idle-${idleLane.lane.id}`,
      title: t("missionControl.activity.idleLaneTitle", {
        lane: idleLane.lane.name,
      }),
      detail: idleLane.lane.purpose,
      meta: t("missionControl.activity.idleLaneMeta"),
      tone: "",
      actionLabel: t("missionControl.board.createSession"),
      onAction: () => props.onCreateLaneSession(idleLane.lane),
    });
  }

  if (props.summary.defaultSessionKey) {
    items.push({
      id: "default-session",
      title: t("missionControl.activity.defaultSessionTitle"),
      detail: props.summary.defaultSessionKey,
      meta: t("missionControl.activity.defaultSessionMeta"),
      tone: "",
      actionLabel: t("missionControl.activity.openSessions"),
      onAction: () => props.onNavigate("sessions"),
    });
  }

  return items.slice(0, 5);
}

function renderActivityItem(item: MissionControlActivityItem) {
  return html`
    <div
      style="padding: 14px; border-radius: 16px; border: 1px solid rgba(148, 163, 184, 0.14); background: rgba(15, 23, 42, 0.58);"
    >
      <div class="row" style="justify-content: space-between; gap: 12px; align-items: flex-start;">
        <div style="min-width: 0;">
          <div style="font-weight: 600; line-height: 1.35;">${item.title}</div>
          <div class="muted" style="margin-top: 6px; line-height: 1.45;">${item.detail}</div>
        </div>
        <span class="chip ${item.tone}"
          >${item.tone === "danger"
            ? t("missionControl.activity.attention")
            : item.tone === "ok"
              ? t("missionControl.activity.live")
              : t("missionControl.activity.ready")}</span
        >
      </div>
      <div class="muted" style="margin-top: 10px; line-height: 1.45;">${item.meta}</div>
      <div class="row" style="margin-top: 12px; justify-content: flex-end;">
        <button class="btn btn--sm" @click=${item.onAction}>${item.actionLabel}</button>
      </div>
    </div>
  `;
}

function renderProjectCard(
  domain: MissionControlDomain,
  props: MissionControlProps,
  sessions: GatewaySessionRow[],
) {
  const lanes = findDomainLanes(props.registry, domain.id);
  const defaultLane = lanes[0] ?? null;
  const latest = latestUpdatedAt(sessions);
  return html`
    <div style=${`${PANEL_STYLE} padding: 16px;`}>
      <div class="row" style="justify-content: space-between; gap: 12px; align-items: flex-start;">
        <div>
          <div class="card-title">${domain.name}</div>
          <div class="card-sub mono">${domain.repo}</div>
        </div>
        <span class="chip">${domain.status}</span>
      </div>
      <div class="muted" style="margin-top: 10px; line-height: 1.5;">${domain.role}</div>
      <div class="chip-row" style="margin-top: 12px;">
        ${domain.docsPaths.slice(0, 1).map((path) => html`<span class="chip mono">${path}</span>`)}
        ${domain.memorySources
          .slice(0, 1)
          .map((source) => html`<span class="chip">${source}</span>`)}
        <span class="chip ${sessions.length > 0 ? "ok" : ""}"
          >${sessions.length > 0
            ? t("missionControl.projects.activeSessions", { count: String(sessions.length) })
            : t("missionControl.projects.noSessions")}</span
        >
      </div>
      <div style="margin-top: 14px;">
        ${renderOwnerEditor(domain, (owner) => props.onDomainOwnerChange(domain.id, owner))}
      </div>
      <div
        class="row"
        style="margin-top: 14px; justify-content: space-between; gap: 12px; align-items: center; flex-wrap: wrap;"
      >
        <div class="muted">
          ${latest
            ? t("missionControl.projects.latestActivity", {
                time: formatRelativeTimestamp(latest),
              })
            : t("missionControl.projects.noActivity")}
        </div>
        <div class="row" style="gap: 8px; flex-wrap: wrap;">
          ${defaultLane
            ? html`
                <button
                  class="btn btn--sm"
                  data-mission-control-project-handoff=${domain.id}
                  @click=${() =>
                    props.onIntakeDraftChange({
                      routeId:
                        domain.id === "control" ? "workspace-request" : "implementation-work",
                      laneId: defaultLane.id,
                    })}
                >
                  ${t("missionControl.projects.handoff")}
                </button>
              `
            : nothing}
          ${sessions[0]
            ? html`
                <button class="btn btn--sm" @click=${() => props.onOpenSession(sessions[0].key)}>
                  ${t("missionControl.board.openSession")}
                </button>
              `
            : defaultLane
              ? html`
                  <button
                    class="btn btn--sm"
                    @click=${() => props.onCreateLaneSession(defaultLane)}
                  >
                    ${t("missionControl.board.createSession")}
                  </button>
                `
              : nothing}
        </div>
      </div>
    </div>
  `;
}

function renderLaneCoverage(binding: LaneBinding, props: MissionControlProps) {
  const latest = latestUpdatedAt(binding.sessions);
  return html`
    <div class="list-item">
      <div class="list-main">
        <div class="list-title">${binding.lane.name}</div>
        <div class="list-sub mono">${binding.lane.key}</div>
        <div class="muted" style="margin-top: 6px;">${binding.lane.purpose}</div>
        <div class="chip-row" style="margin-top: 10px;">
          <span class="chip"
            >${binding.sessions.length > 0
              ? t("missionControl.system.covered")
              : t("missionControl.system.idle")}</span
          >
          ${binding.sessions
            .slice(0, 2)
            .map(
              (session) =>
                html`<span class="chip ok"
                  >${session.label || session.displayName || session.key}</span
                >`,
            )}
        </div>
      </div>
      <div class="list-meta" style="min-width: 240px;">
        ${renderOwnerEditor(binding.lane, (owner) =>
          props.onLaneOwnerChange(binding.lane.id, owner),
        )}
        <div class="muted" style="margin-top: 8px;">
          ${latest
            ? t("missionControl.board.latestActivity", {
                time: formatRelativeTimestamp(latest),
              })
            : t("missionControl.system.noActivity")}
        </div>
        <div
          class="row"
          style="margin-top: 10px; gap: 8px; justify-content: flex-end; flex-wrap: wrap;"
        >
          ${binding.sessions[0]
            ? html`
                <button
                  class="btn btn--sm"
                  @click=${() => props.onOpenSession(binding.sessions[0].key)}
                >
                  ${t("missionControl.board.openSession")}
                </button>
              `
            : html`
                <button class="btn btn--sm" @click=${() => props.onCreateLaneSession(binding.lane)}>
                  ${t("missionControl.board.createSession")}
                </button>
              `}
        </div>
      </div>
    </div>
  `;
}

export function renderMissionControl(props: MissionControlProps) {
  const laneBindings = props.registry.sessionLanes.map((lane) => ({
    lane,
    sessions: sortSessionsByUpdate(findLaneSessions(lane, props.sessions)),
  }));
  const routingDecision = classifyMissionControlIntake(props.registry, props.intakeDraft);
  const tasks = buildBoardTasks(props, laneBindings, routingDecision);
  const { stats, liveSessionCount, approvalsCount } = buildStats(props, tasks, laneBindings);
  const sections = buildSections(props, tasks, approvalsCount);
  const activityItems = buildActivityItems(props, laneBindings, routingDecision);
  const draftRoute = findDraftRoute(props.registry, props.intakeDraft);
  const draftLane = findDraftLane(props.registry, props.intakeDraft);
  const routingDomain = findDomainById(props.registry, routingDecision.domainId);

  return html`
    <section
      data-mission-control-shell
      style="display: flex; gap: 18px; align-items: flex-start; flex-wrap: wrap;"
    >
      <aside
        data-mission-control-left-rail
        style=${`${PANEL_STYLE} flex: 0 1 220px; width: 220px; padding: 18px; position: sticky; top: 12px;`}
      >
        <div
          style="font-size: 12px; letter-spacing: 0.08em; text-transform: uppercase; color: rgba(148, 163, 184, 0.92);"
        >
          ${props.registry.name}
        </div>
        <div style="margin-top: 10px; font-size: 22px; font-weight: 700; line-height: 1.2;">
          ${t("missionControl.shell.title")}
        </div>
        <div class="muted" style="margin-top: 8px; line-height: 1.5;">
          ${t("missionControl.shell.subtitle")}
        </div>
        <div style="margin-top: 16px; display: grid; gap: 10px;">
          ${sections.map((item) => renderRailSection(item))}
        </div>
        <div
          style=${`${PANEL_STYLE} margin-top: 16px; padding: 14px; background: rgba(15, 23, 42, 0.58);`}
        >
          <div style="font-weight: 600;">${t("missionControl.shell.quickLinksTitle")}</div>
          <div class="row" style="margin-top: 12px; gap: 8px; flex-wrap: wrap;">
            <button class="btn btn--sm" @click=${() => props.onNavigate("agents")}>
              ${t("missionControl.shell.quickLinks.agents")}
            </button>
            <button class="btn btn--sm" @click=${() => props.onNavigate("sessions")}>
              ${t("missionControl.shell.quickLinks.sessions")}
            </button>
            <button class="btn btn--sm" @click=${() => props.onNavigate("overview")}>
              ${t("missionControl.shell.quickLinks.system")}
            </button>
          </div>
        </div>
      </aside>

      <div style="flex: 1 1 760px; min-width: min(760px, 100%); display: grid; gap: 18px;">
        <div
          style=${`${PANEL_STYLE} padding: 18px; background: linear-gradient(135deg, rgba(14, 165, 233, 0.2), rgba(15, 23, 42, 0.94));`}
        >
          <div
            class="row"
            style="justify-content: space-between; gap: 12px; align-items: flex-start; flex-wrap: wrap;"
          >
            <div>
              <div class="card-title">${t("missionControl.workspaceHeader.title")}</div>
              <div class="card-sub" style="margin-top: 6px; line-height: 1.5;">
                ${t("missionControl.workspaceHeader.subtitle")}
              </div>
            </div>
            <div class="pill ${props.summary.connected ? "ok" : "danger"}">
              ${props.summary.connected
                ? t("missionControl.summary.connected")
                : t("missionControl.summary.disconnected")}
            </div>
          </div>
          <div class="chip-row" style="margin-top: 14px;">
            <span class="chip"
              >${t("missionControl.workspaceHeader.liveSessions", {
                count: String(liveSessionCount || props.summary.sessionsCount),
              })}</span
            >
            <span class="chip"
              >${t("missionControl.workspaceHeader.instances", {
                count: String(props.summary.activeInstances),
              })}</span
            >
            <span class="chip"
              >${t("missionControl.workspaceHeader.cron", {
                count: String(props.summary.cronJobs),
              })}</span
            >
            ${props.summary.defaultSessionKey
              ? html`<span class="chip mono">${props.summary.defaultSessionKey}</span>`
              : nothing}
          </div>
        </div>

        <div
          style="display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: 12px;"
        >
          ${stats.map((card) => renderStatCard(card))}
        </div>

        <div
          data-mission-control-action-bar
          style=${`${PANEL_STYLE} padding: 18px; background: linear-gradient(180deg, rgba(15, 23, 42, 0.96), rgba(30, 41, 59, 0.84));`}
        >
          <div
            class="row"
            style="justify-content: space-between; gap: 12px; align-items: flex-start; flex-wrap: wrap;"
          >
            <div>
              <div class="card-title">${t("missionControl.actionBar.title")}</div>
              <div class="card-sub" style="margin-top: 6px; line-height: 1.5;">
                ${t("missionControl.actionBar.subtitle")}
              </div>
            </div>
            <span class="chip ${confidenceTone(routingDecision.confidence)}"
              >${t(`missionControl.router.confidence.${routingDecision.confidence}`)}</span
            >
          </div>

          <div
            style="margin-top: 14px; display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 12px;"
          >
            <label>
              <div class="muted" style="margin-bottom: 6px;">
                ${t("missionControl.intake.routeLabel")}
              </div>
              <select
                style=${INPUT_STYLE}
                .value=${props.intakeDraft.routeId}
                @change=${(event: Event) =>
                  props.onIntakeDraftChange({ routeId: (event.target as HTMLSelectElement).value })}
              >
                ${props.registry.intakeRoutes.map(
                  (route) => html`<option value=${route.id}>${route.title}</option>`,
                )}
              </select>
            </label>
            <label>
              <div class="muted" style="margin-bottom: 6px;">
                ${t("missionControl.intake.laneLabel")}
              </div>
              <select
                style=${INPUT_STYLE}
                .value=${props.intakeDraft.laneId}
                @change=${(event: Event) =>
                  props.onIntakeDraftChange({ laneId: (event.target as HTMLSelectElement).value })}
              >
                ${props.registry.sessionLanes.map(
                  (lane) => html`<option value=${lane.id}>${lane.name}</option>`,
                )}
              </select>
            </label>
            <label>
              <div class="muted" style="margin-bottom: 6px;">
                ${t("missionControl.intake.titleLabel")}
              </div>
              <input
                .value=${props.intakeDraft.title}
                style=${INPUT_STYLE}
                @input=${(event: Event) =>
                  props.onIntakeDraftChange({ title: (event.target as HTMLInputElement).value })}
                placeholder=${t("missionControl.intake.titlePlaceholder")}
              />
            </label>
          </div>

          <label style="display: block; margin-top: 12px;">
            <div class="muted" style="margin-bottom: 6px;">
              ${t("missionControl.intake.requestLabel")}
            </div>
            <textarea
              .value=${props.intakeDraft.request}
              style=${`${INPUT_STYLE} min-height: 104px; resize: vertical;`}
              @input=${(event: Event) =>
                props.onIntakeDraftChange({ request: (event.target as HTMLTextAreaElement).value })}
              placeholder=${t("missionControl.intake.requestPlaceholder")}
            ></textarea>
          </label>

          <div class="chip-row" style="margin-top: 12px;">
            ${props.registry.intakeRoutes.map((route) =>
              renderActionButton(route.title, () => props.onRouteRequest(route), [
                "data-mission-control-quick-route",
                route.id,
              ]),
            )}
          </div>

          <div
            style=${`${PANEL_STYLE} margin-top: 14px; padding: 14px; background: rgba(15, 23, 42, 0.58);`}
          >
            <div
              class="row"
              style="justify-content: space-between; gap: 12px; align-items: flex-start; flex-wrap: wrap;"
            >
              <div>
                <div style="font-weight: 600;">${t("missionControl.actionBar.focusTitle")}</div>
                <div class="muted" style="margin-top: 6px; line-height: 1.5;">
                  ${routingDomain
                    ? t("missionControl.router.domain", { domain: routingDomain.name })
                    : nothing}
                  ${draftLane
                    ? html`<div style="margin-top: 4px;">
                        ${t("missionControl.intake.previewLane", { lane: draftLane.name })}
                      </div>`
                    : nothing}
                  ${draftRoute
                    ? html`<div style="margin-top: 4px;">${draftRoute.starterPrompt}</div>`
                    : nothing}
                </div>
              </div>
              <div class="chip-row" style="justify-content: flex-end;">
                ${routingDecision.matchedKeywords.length > 0
                  ? routingDecision.matchedKeywords.map(
                      (keyword) => html`<span class="chip">${keyword}</span>`,
                    )
                  : html`<span class="chip">${t("missionControl.actionBar.noKeywordMatch")}</span>`}
              </div>
            </div>
            <div class="muted" style="margin-top: 10px; line-height: 1.5;">
              <div>${routingDecision.routingReason}</div>
              <div style="margin-top: 4px;">${routingDecision.suggestedNextAction}</div>
            </div>
          </div>

          <div
            class="row"
            style="margin-top: 14px; justify-content: space-between; gap: 12px; flex-wrap: wrap; align-items: center;"
          >
            <div class="chip-row">
              ${routingDecision.requiresHandoff
                ? html`<span class="chip">${t("missionControl.actionBar.handoff")}</span>`
                : nothing}
              ${routingDecision.requiresSchedule
                ? html`<span class="chip">${t("missionControl.actionBar.schedule")}</span>`
                : nothing}
            </div>
            <div class="row" style="gap: 8px; flex-wrap: wrap;">
              <button
                class="btn btn--sm"
                data-mission-control-apply-suggestion
                @click=${() =>
                  props.onIntakeDraftChange({
                    routeId: routingDecision.routeId,
                    laneId: routingDecision.laneId,
                  })}
              >
                ${t("missionControl.router.apply")}
              </button>
              <button class="btn btn--sm" @click=${props.onResetIntake}>
                ${t("missionControl.intake.reset")}
              </button>
              <button class="btn btn--sm primary" @click=${props.onSubmitIntake}>
                ${t("missionControl.intake.submit")}
              </button>
            </div>
          </div>
        </div>

        <div
          data-mission-control-board
          style="display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 14px;"
        >
          ${BOARD_COLUMNS.map((column) => renderBoardColumn(column.id, tasks, props))}
        </div>

        <div
          style="display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 16px;"
        >
          <div data-mission-control-projects class="card" style=${`${PANEL_STYLE} padding: 18px;`}>
            <div class="card-title">${t("missionControl.projects.title")}</div>
            <div class="card-sub" style="margin-top: 6px; line-height: 1.5;">
              ${t("missionControl.projects.subtitle")}
            </div>
            <div style="margin-top: 14px; display: grid; gap: 12px;">
              ${props.registry.domains.map((domain) => {
                const sessions = findDomainLanes(props.registry, domain.id).flatMap((lane) =>
                  findLaneSessions(lane, props.sessions),
                );
                return renderProjectCard(domain, props, sortSessionsByUpdate(sessions));
              })}
            </div>
          </div>

          <div data-mission-control-system class="card" style=${`${PANEL_STYLE} padding: 18px;`}>
            <div class="card-title">${t("missionControl.system.title")}</div>
            <div class="card-sub" style="margin-top: 6px; line-height: 1.5;">
              ${t("missionControl.system.subtitle")}
            </div>
            <div class="chip-row" style="margin-top: 14px;">
              <span class="chip"
                >${t("missionControl.system.coverage", {
                  matched: String(
                    laneBindings.filter((binding) => binding.sessions.length > 0).length,
                  ),
                  total: String(laneBindings.length),
                })}</span
              >
            </div>
            <div class="list" style="margin-top: 14px;">
              ${laneBindings.map((binding) => renderLaneCoverage(binding, props))}
            </div>
          </div>
        </div>
      </div>

      <aside
        data-mission-control-activity-rail
        style="flex: 0 1 320px; width: 320px; display: grid; gap: 16px;"
      >
        <div class="card" style=${`${PANEL_STYLE} padding: 18px;`}>
          <div class="card-title">${t("missionControl.activity.title")}</div>
          <div class="card-sub" style="margin-top: 6px; line-height: 1.5;">
            ${t("missionControl.activity.subtitle")}
          </div>
          <div style="margin-top: 14px; display: grid; gap: 12px;">
            ${activityItems.map((item) => renderActivityItem(item))}
          </div>
        </div>

        <div class="card" style=${`${PANEL_STYLE} padding: 18px;`}>
          <div class="card-title">${t("missionControl.approvals.title")}</div>
          <div class="card-sub" style="margin-top: 6px; line-height: 1.5;">
            ${t("missionControl.approvals.subtitle")}
          </div>
          <div class="list" style="margin-top: 14px;">
            ${tasks
              .filter((task) => task.column === "review" || task.column === "handoff")
              .slice(0, 3)
              .map(
                (task) => html`
                  <div class="list-item">
                    <div class="list-main">
                      <div class="list-title">${task.title}</div>
                      <div class="list-sub">${task.domain.name}</div>
                      <div class="muted" style="margin-top: 6px;">${task.summary}</div>
                    </div>
                    <div class="list-meta">
                      <span class="chip ${priorityTone(task.priority)}"
                        >${t(`missionControl.board.priority.${task.priority}`)}</span
                      >
                    </div>
                  </div>
                `,
              )}
          </div>
        </div>

        <div class="card" style=${`${PANEL_STYLE} padding: 18px;`}>
          <div class="card-title">${t("missionControl.context.title")}</div>
          <div class="card-sub" style="margin-top: 6px; line-height: 1.5;">
            ${t("missionControl.context.subtitle")}
          </div>
          ${routingDomain
            ? html`
                <div style="margin-top: 14px; font-weight: 600;">${routingDomain.name}</div>
                <div class="chip-row" style="margin-top: 10px;">
                  <span class="chip mono">${routingDomain.repo}</span>
                  ${draftLane ? html`<span class="chip">${draftLane.name}</span>` : nothing}
                </div>
                <div style="margin-top: 14px; font-weight: 600;">
                  ${t("missionControl.context.docs")}
                </div>
                <div class="chip-row" style="margin-top: 10px;">
                  ${routingDomain.docsPaths.map(
                    (path) => html`<span class="chip mono">${path}</span>`,
                  )}
                </div>
                <div style="margin-top: 14px; font-weight: 600;">
                  ${t("missionControl.context.memory")}
                </div>
                <div class="chip-row" style="margin-top: 10px;">
                  ${routingDomain.memorySources.map(
                    (source) => html`<span class="chip">${source}</span>`,
                  )}
                </div>
              `
            : html`
                <div class="muted" style="margin-top: 14px; line-height: 1.5;">
                  ${t("missionControl.context.noDomain")}
                </div>
              `}
          <div class="row" style="margin-top: 16px; gap: 8px; flex-wrap: wrap;">
            <button class="btn btn--sm" @click=${() => props.onNavigate("overview")}>
              ${t("missionControl.context.openSystem")}
            </button>
            <button class="btn btn--sm" @click=${() => props.onNavigate("agents")}>
              ${t("missionControl.context.openAgents")}
            </button>
          </div>
        </div>
      </aside>
    </section>
  `;
}
