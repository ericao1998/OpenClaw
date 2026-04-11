import { html, nothing } from "lit";
import { t } from "../i18n/index.ts";
import { getSafeLocalStorage } from "../local-storage.ts";
import { refreshChatAvatar } from "./app-chat.ts";
import { renderUsageTab } from "./app-render-usage-tab.ts";
import {
  renderChatControls,
  renderChatMobileToggle,
  renderChatSessionSelect,
  renderTab,
  renderSidebarConnectionStatus,
  renderTopbarThemeModeToggle,
  buildProjectTree,
  switchChatSession,
  type ProjectTreeChildNode,
} from "./app-render.helpers.ts";
import { warnQueryToken } from "./app-settings.ts";
import type { AppViewState } from "./app-view-state.ts";
import { extractText } from "./chat/message-extract.ts";
import { loadAgentFileContent, loadAgentFiles, saveAgentFile } from "./controllers/agent-files.ts";
import { loadAgentIdentities, loadAgentIdentity } from "./controllers/agent-identity.ts";
import { loadAgentSkills } from "./controllers/agent-skills.ts";
import {
  buildToolsEffectiveRequestKey,
  loadAgents,
  loadToolsCatalog,
  loadToolsEffective,
  refreshVisibleToolsEffectiveForCurrentSession,
  saveAgentsConfig,
} from "./controllers/agents.ts";
import { loadChannels } from "./controllers/channels.ts";
import { loadChatHistory } from "./controllers/chat.ts";
import {
  applyConfig,
  ensureAgentConfigEntry,
  findAgentConfigEntryIndex,
  loadConfig,
  openConfigFile,
  runUpdate,
  saveConfig,
  updateConfigFormValue,
  removeConfigFormValue,
} from "./controllers/config.ts";
import {
  loadCronRuns,
  loadMoreCronJobs,
  loadMoreCronRuns,
  reloadCronJobs,
  toggleCronJob,
  runCronJob,
  removeCronJob,
  addCronJob,
  startCronEdit,
  startCronClone,
  cancelCronEdit,
  validateCronForm,
  hasCronFormErrors,
  normalizeCronFormState,
  getVisibleCronJobs,
  updateCronJobsFilter,
  updateCronRunsFilter,
} from "./controllers/cron.ts";
import { loadDebug, callDebugMethod } from "./controllers/debug.ts";
import {
  approveDevicePairing,
  loadDevices,
  rejectDevicePairing,
  revokeDeviceToken,
  rotateDeviceToken,
} from "./controllers/devices.ts";
import {
  backfillDreamDiary,
  loadDreamDiary,
  loadDreamingStatus,
  resetGroundedShortTerm,
  resetDreamDiary,
  resolveConfiguredDreaming,
  updateDreamingEnabled,
} from "./controllers/dreaming.ts";
import {
  loadExecApprovals,
  removeExecApprovalsFormValue,
  saveExecApprovals,
  updateExecApprovalsFormValue,
} from "./controllers/exec-approvals.ts";
import { loadLogs } from "./controllers/logs.ts";
import { loadNodes } from "./controllers/nodes.ts";
import { loadPresence } from "./controllers/presence.ts";
import {
  branchSessionFromCheckpoint,
  createSession,
  deleteSessionsAndRefresh,
  loadSessions,
  patchSession,
  restoreSessionFromCheckpoint,
  toggleSessionCompactionCheckpoints,
} from "./controllers/sessions.ts";
import {
  closeClawHubDetail,
  installFromClawHub,
  installSkill,
  loadClawHubDetail,
  loadSkills,
  saveSkillApiKey,
  searchClawHub,
  setClawHubSearchQuery,
  updateSkillEdit,
  updateSkillEnabled,
} from "./controllers/skills.ts";
import { buildExternalLinkRel, EXTERNAL_LINK_TARGET } from "./external-link.ts";
import { icons } from "./icons.ts";
import {
  applyMissionControlIntakeDraftPatch,
  applyMissionControlRouteDraft,
  buildMissionControlIntakeSessionPayload,
  updateMissionControlDomainOwner,
  updateMissionControlLaneOwner,
} from "./mission-control-actions.ts";
import {
  PPV_WORKSPACE_REGISTRY,
  type MissionControlIntakeRoute,
  type MissionControlSessionLane,
  type MissionControlTreeNodeKind,
} from "./mission-control-registry.ts";
import "./components/dashboard-header.ts";
import {
  createMissionControlIntakeDraft,
  saveMissionControlRegistry,
} from "./mission-control-store.ts";
import { normalizeBasePath, TAB_GROUPS, subtitleForTab, titleForTab } from "./navigation.ts";
import {
  buildAgentMainSessionKey,
  parseAgentSessionKey,
  resolveAgentIdFromSessionKey,
} from "./session-key.ts";
import { normalizeLowercaseStringOrEmpty } from "./string-coerce.ts";
import { agentLogoUrl } from "./views/agents-utils.ts";
import {
  resolveAgentConfig,
  resolveConfiguredCronModelSuggestions,
  resolveEffectiveModelFallbacks,
  resolveModelPrimary,
  sortLocaleStrings,
} from "./views/agents-utils.ts";
import { renderChat } from "./views/chat.ts";
import { renderCommandPalette } from "./views/command-palette.ts";
import { renderConfig } from "./views/config.ts";
import { renderDreaming } from "./views/dreaming.ts";
import { renderExecApprovalPrompt } from "./views/exec-approval.ts";
import { renderGatewayUrlConfirmation } from "./views/gateway-url-confirmation.ts";
import { renderLoginGate } from "./views/login-gate.ts";
import { renderMissionControl } from "./views/mission-control.ts";
import { renderOverview } from "./views/overview.ts";

// Lazy-loaded view modules – deferred so the initial bundle stays small.
// Each loader resolves once; subsequent calls return the cached module.
type LazyState<T> = { mod: T | null; promise: Promise<T> | null };

let _pendingUpdate: (() => void) | undefined;

function createLazy<T>(loader: () => Promise<T>): () => T | null {
  const s: LazyState<T> = { mod: null, promise: null };
  return () => {
    if (s.mod) {
      return s.mod;
    }
    if (!s.promise) {
      s.promise = loader().then((m) => {
        s.mod = m;
        _pendingUpdate?.();
        return m;
      });
    }
    return null;
  };
}

const lazyAgents = createLazy(() => import("./views/agents.ts"));
const lazyChannels = createLazy(() => import("./views/channels.ts"));
const lazyCron = createLazy(() => import("./views/cron.ts"));
const lazyDebug = createLazy(() => import("./views/debug.ts"));
const lazyInstances = createLazy(() => import("./views/instances.ts"));
const lazyLogs = createLazy(() => import("./views/logs.ts"));
const lazyNodes = createLazy(() => import("./views/nodes.ts"));
const lazySessions = createLazy(() => import("./views/sessions.ts"));
const lazySkills = createLazy(() => import("./views/skills.ts"));

function formatDreamNextCycle(nextRunAtMs: number | undefined): string | null {
  if (typeof nextRunAtMs !== "number" || !Number.isFinite(nextRunAtMs)) {
    return null;
  }
  return new Date(nextRunAtMs).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
}

function resolveDreamingNextCycle(
  status: { phases: Record<string, { enabled: boolean; nextRunAtMs?: number }> } | null,
): string | null {
  if (!status) {
    return null;
  }
  const nextRunAtMs = Object.values(status.phases)
    .filter((phase) => phase.enabled && typeof phase.nextRunAtMs === "number")
    .map((phase) => phase.nextRunAtMs as number)
    .toSorted((a, b) => a - b)[0];
  return formatDreamNextCycle(nextRunAtMs);
}

let clawhubSearchTimer: ReturnType<typeof setTimeout> | null = null;

function lazyRender<M>(getter: () => M | null, render: (mod: M) => unknown) {
  const mod = getter();
  return mod ? render(mod) : nothing;
}

const UPDATE_BANNER_DISMISS_KEY = "openclaw:control-ui:update-banner-dismissed:v1";
const CRON_THINKING_SUGGESTIONS = ["off", "minimal", "low", "medium", "high"];
const CRON_TIMEZONE_SUGGESTIONS = [
  "UTC",
  "America/Los_Angeles",
  "America/Denver",
  "America/Chicago",
  "America/New_York",
  "Europe/London",
  "Europe/Berlin",
  "Asia/Tokyo",
];

function isHttpUrl(value: string): boolean {
  return /^https?:\/\//i.test(value.trim());
}

function normalizeSuggestionValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function uniquePreserveOrder(values: string[]): string[] {
  const seen = new Set<string>();
  const output: string[] = [];
  for (const value of values) {
    const normalized = value.trim();
    if (!normalized) {
      continue;
    }
    const key = normalized.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    output.push(normalized);
  }
  return output;
}

const MIN_SIDEBAR_NAV_WIDTH = 200;
const MAX_SIDEBAR_NAV_WIDTH = 400;
const DESKTOP_NAV_BREAKPOINT_PX = 1100;
const FALLBACK_SIDEBAR_NAV_WIDTH = 258;

function clampSidebarNavWidth(width: number): number {
  return Math.max(MIN_SIDEBAR_NAV_WIDTH, Math.min(MAX_SIDEBAR_NAV_WIDTH, Math.round(width)));
}

function resolveSidebarNavWidth(state: AppViewState): number {
  const configuredWidth =
    typeof state.settings.navWidth === "number"
      ? state.settings.navWidth
      : FALLBACK_SIDEBAR_NAV_WIDTH;
  return clampSidebarNavWidth(configuredWidth);
}

function updateSidebarNavWidth(state: AppViewState, nextWidth: number) {
  const clampedWidth = clampSidebarNavWidth(nextWidth);
  if (clampedWidth === resolveSidebarNavWidth(state)) {
    return;
  }
  state.applySettings({
    ...state.settings,
    navWidth: clampedWidth,
  });
}

function startSidebarResize(state: AppViewState, event: MouseEvent) {
  if (event.button !== 0) {
    return;
  }
  if (
    state.settings.navCollapsed ||
    window.matchMedia(`(max-width: ${DESKTOP_NAV_BREAKPOINT_PX}px)`).matches
  ) {
    return;
  }
  const startX = event.clientX;
  const startWidth = resolveSidebarNavWidth(state);
  const target = event.currentTarget instanceof HTMLElement ? event.currentTarget : null;
  const rootStyle = document.documentElement.style;
  const previousCursor = rootStyle.cursor;
  const previousUserSelect = rootStyle.userSelect;

  const finishResize = () => {
    rootStyle.cursor = previousCursor;
    rootStyle.userSelect = previousUserSelect;
    target?.classList.remove("sidebar-resizer--dragging");
    document.removeEventListener("mousemove", handleMouseMove);
    document.removeEventListener("mouseup", finishResize);
  };

  const handleMouseMove = (moveEvent: MouseEvent) => {
    updateSidebarNavWidth(state, startWidth + (moveEvent.clientX - startX));
  };

  rootStyle.cursor = "col-resize";
  rootStyle.userSelect = "none";
  target?.classList.add("sidebar-resizer--dragging");
  document.addEventListener("mousemove", handleMouseMove);
  document.addEventListener("mouseup", finishResize);
  event.preventDefault();
}

function handleSidebarResizeKeydown(state: AppViewState, event: KeyboardEvent) {
  if (window.matchMedia(`(max-width: ${DESKTOP_NAV_BREAKPOINT_PX}px)`).matches) {
    return;
  }
  const currentWidth = resolveSidebarNavWidth(state);
  let nextWidth: number | null = null;
  switch (event.key) {
    case "ArrowLeft":
      nextWidth = currentWidth - 16;
      break;
    case "ArrowRight":
      nextWidth = currentWidth + 16;
      break;
    case "Home":
      nextWidth = MIN_SIDEBAR_NAV_WIDTH;
      break;
    case "End":
      nextWidth = MAX_SIDEBAR_NAV_WIDTH;
      break;
    default:
      return;
  }
  event.preventDefault();
  updateSidebarNavWidth(state, nextWidth);
}

function resolveMissionControlChildKinds(
  kind: MissionControlTreeNodeKind,
): MissionControlTreeNodeKind[] {
  switch (kind) {
    case "workspace":
      return ["repo"];
    case "repo":
    case "module":
      return ["module", "chat-module", "acp-module"];
    case "chat-module":
    case "acp-module":
      return [];
  }
}

function describeMissionControlTreeNodeKind(kind: MissionControlTreeNodeKind): string {
  switch (kind) {
    case "workspace":
      return "workspace";
    case "repo":
      return "project root";
    case "module":
      return "module";
    case "chat-module":
      return "chat module";
    case "acp-module":
      return "ACP module";
  }
}

function buildMissionControlTreeNodeKindAliases(kind: MissionControlTreeNodeKind): string[] {
  return [
    kind,
    describeMissionControlTreeNodeKind(kind),
    kind === "chat-module" ? "chat" : "",
    kind === "chat-module" ? "chat module" : "",
    kind === "acp-module" ? "acp" : "",
    kind === "acp-module" ? "acp module" : "",
    kind === "module" ? "submodule" : "",
    kind === "module" ? "sub module" : "",
  ]
    .map((value) => normalizeLowercaseStringOrEmpty(value))
    .filter(Boolean);
}

function resolveMissionControlTreeNodeKindAlias(
  childKinds: MissionControlTreeNodeKind[],
  input: string,
): MissionControlTreeNodeKind | null {
  const normalizedInput = normalizeLowercaseStringOrEmpty(input);
  if (!normalizedInput) {
    return null;
  }
  return (
    childKinds.find((kind) =>
      buildMissionControlTreeNodeKindAliases(kind).includes(normalizedInput),
    ) ?? null
  );
}

function promptForMissionControlChildLabel(kind: MissionControlTreeNodeKind, parentLabel: string) {
  return window
    .prompt(`Name new ${describeMissionControlTreeNodeKind(kind)} under ${parentLabel}`)
    ?.trim();
}

function resolveMissionControlDomainLinkId(label: string): string | undefined {
  const normalizedLabel = normalizeLowercaseStringOrEmpty(label);
  if (!normalizedLabel) {
    return undefined;
  }
  const match = PPV_WORKSPACE_REGISTRY.domains.find((domain) => {
    const aliases = [domain.id, domain.name, domain.repo].map((value) =>
      normalizeLowercaseStringOrEmpty(value),
    );
    return aliases.includes(normalizedLabel);
  });
  return match?.id;
}

function appendMissionControlTreeNode(
  treeNodes: NonNullable<AppViewState["missionControlRegistry"]["treeNodes"]>,
  nextNode: NonNullable<AppViewState["missionControlRegistry"]["treeNodes"]>[number],
) {
  return [...treeNodes, nextNode];
}

function collectProjectTreeNodeIds(node: ProjectTreeChildNode): string[] {
  return [node.id, ...node.children.flatMap((child) => collectProjectTreeNodeIds(child))];
}

function resolveMissionControlWorkspaceNodeId(
  state: AppViewState,
  treeNodes: NonNullable<AppViewState["missionControlRegistry"]["treeNodes"]>,
): string {
  const workspaceNode = treeNodes.find(
    (entry) => entry.kind === "workspace" && (entry.parentId ?? null) === null,
  );
  return workspaceNode?.id ?? `workspace:${state.missionControlRegistry.id}`;
}

function ensureMissionControlWorkspaceNode(
  registry: AppViewState["missionControlRegistry"],
  treeNodes: NonNullable<AppViewState["missionControlRegistry"]["treeNodes"]>,
) {
  const existingWorkspaceNode = treeNodes.find(
    (node) => node.kind === "workspace" && (node.parentId ?? null) === null,
  );
  if (existingWorkspaceNode) {
    return {
      treeNodes,
      workspaceNode: existingWorkspaceNode,
    };
  }
  const workspaceNode = {
    id: `workspace:${registry.id}`,
    parentId: null,
    kind: "workspace" as const,
    label: `${registry.name} Workspace`,
  };
  return {
    treeNodes: appendMissionControlTreeNode(treeNodes, workspaceNode),
    workspaceNode,
  };
}

function linkMissionControlTreeNodeSession(
  treeNodes: NonNullable<AppViewState["missionControlRegistry"]["treeNodes"]>,
  nodeId: string,
  sessionKey: string,
) {
  return treeNodes.map((node) =>
    node.id === nodeId
      ? {
          ...node,
          linkedSessionKey: sessionKey,
        }
      : node,
  );
}

function buildProjectTreeSessionLabel(node: ProjectTreeChildNode): string {
  return node.pathLabels.join(" / ");
}

function buildProjectTreeSessionMessage(node: ProjectTreeChildNode): string {
  const scope = buildProjectTreeSessionLabel(node);
  switch (node.kind) {
    case "acp-module":
      return `Mission Control ACP session for ${scope}. Use this session for ACP-specific orchestration, tools, and follow-up work.`;
    case "chat-module":
      return `Mission Control chat session for ${scope}. Keep work for this grouped module in this chat and continue with the next scoped action.`;
    case "repo":
      return `Mission Control project session for ${scope}. Keep this work grouped under the project root and continue with the next scoped action.`;
    default:
      return `Mission Control session for ${scope}. Continue the scoped project work in this grouped context.`;
  }
}

function createMissionControlTreeChildNode(
  state: AppViewState,
  options: {
    treeNodes?: NonNullable<AppViewState["missionControlRegistry"]["treeNodes"]>;
    parentId: string | null;
    parentKind: MissionControlTreeNodeKind;
    parentLabel: string;
    requestedKind?: MissionControlTreeNodeKind;
    expandKeys?: string[];
  },
) {
  const childKinds = resolveMissionControlChildKinds(options.parentKind);
  if (childKinds.length === 0) {
    return;
  }
  const requestedKind =
    options.requestedKind && childKinds.includes(options.requestedKind)
      ? options.requestedKind
      : null;
  let nextKind = requestedKind ?? childKinds[0];
  let label = "";
  if (requestedKind) {
    label = promptForMissionControlChildLabel(requestedKind, options.parentLabel) ?? "";
  } else if (childKinds.length === 1) {
    label = promptForMissionControlChildLabel(nextKind, options.parentLabel) ?? "";
  } else {
    const rawInput = window
      .prompt(
        `Name new item under ${options.parentLabel}. Use a plain name for a module, or prefix with "chat:" / "acp:".`,
      )
      ?.trim();
    if (!rawInput) {
      return;
    }
    const prefixedMatch = rawInput.match(/^([^:]+):(.*)$/);
    if (prefixedMatch) {
      const requestedKind = resolveMissionControlTreeNodeKindAlias(
        childKinds,
        prefixedMatch[1] ?? "",
      );
      if (!requestedKind) {
        state.lastError = `Unknown child type "${prefixedMatch[1]?.trim()}". Use "module:", "chat:", or "acp:", or enter a plain name for a module.`;
        return;
      }
      const requestedLabel = prefixedMatch[2]?.trim() ?? "";
      if (!requestedLabel) {
        const promptedLabel = promptForMissionControlChildLabel(requestedKind, options.parentLabel);
        if (!promptedLabel) {
          return;
        }
        nextKind = requestedKind;
        label = promptedLabel;
      } else {
        nextKind = requestedKind;
        label = requestedLabel;
      }
    } else {
      const requestedKind = resolveMissionControlTreeNodeKindAlias(childKinds, rawInput);
      if (requestedKind) {
        const promptedLabel = promptForMissionControlChildLabel(requestedKind, options.parentLabel);
        if (!promptedLabel) {
          return;
        }
        nextKind = requestedKind;
        label = promptedLabel;
      } else {
        nextKind = childKinds.includes("module") ? "module" : childKinds[0];
        label = rawInput;
      }
    }
  }
  if (!label) {
    return;
  }
  const baseTreeNodes = options.treeNodes ?? state.missionControlRegistry.treeNodes ?? [];
  const nextNode = {
    id: `tree:${crypto.randomUUID()}`,
    parentId: options.parentId,
    kind: nextKind,
    label,
    ...(nextKind === "repo"
      ? {
          linkedDomainId: resolveMissionControlDomainLinkId(label),
        }
      : {}),
  };
  state.missionControlRegistry = {
    ...state.missionControlRegistry,
    treeNodes: appendMissionControlTreeNode(baseTreeNodes, nextNode),
  };
  const nextCollapsed: AppViewState["settings"]["navGroupsCollapsed"] = {
    ...state.settings.navGroupsCollapsed,
    project: false,
  };
  for (const key of options.expandKeys ?? []) {
    nextCollapsed[key] = false;
  }
  state.applySettings({
    ...state.settings,
    navGroupsCollapsed: nextCollapsed,
  });
  state.lastError = null;
  void saveMissionControlRegistry(state);
}

function removeMissionControlTreeNode(state: AppViewState, node: ProjectTreeChildNode) {
  if (node.kind === "workspace") {
    return;
  }
  const idsToRemove = new Set(collectProjectTreeNodeIds(node));
  const nestedCount = idsToRemove.size - 1;
  const confirmed = window.confirm(
    `Remove ${node.label}${nestedCount > 0 ? ` and ${nestedCount} nested item${nestedCount === 1 ? "" : "s"}` : ""} from the project tree? Existing chat sessions will not be deleted.`,
  );
  if (!confirmed) {
    return;
  }
  const currentTreeNodes = state.missionControlRegistry.treeNodes ?? [];
  const nextTreeNodes = currentTreeNodes.filter((entry) => !idsToRemove.has(entry.id));
  const nextCollapsed: AppViewState["settings"]["navGroupsCollapsed"] = {
    ...state.settings.navGroupsCollapsed,
  };
  for (const id of idsToRemove) {
    delete nextCollapsed[`tree:${id}`];
  }
  const nextSelectedProjectGroup = idsToRemove.has(state.selectedProjectGroup)
    ? resolveMissionControlWorkspaceNodeId(state, nextTreeNodes)
    : state.selectedProjectGroup;
  const nextSelectedProjectRepo =
    node.kind === "repo" && state.selectedProjectRepo === (node.repoContext?.id ?? "")
      ? "main"
      : state.selectedProjectRepo;
  state.missionControlRegistry = {
    ...state.missionControlRegistry,
    treeNodes: nextTreeNodes,
  };
  state.selectedProjectGroup = nextSelectedProjectGroup;
  state.selectedProjectRepo = nextSelectedProjectRepo;
  state.applySettings({
    ...state.settings,
    selectedProjectGroup: nextSelectedProjectGroup,
    selectedProjectRepo: nextSelectedProjectRepo,
    navGroupsCollapsed: nextCollapsed,
  });
  state.lastError = null;
  void saveMissionControlRegistry(state);
}

function isProjectTreeFolderNode(node: ProjectTreeChildNode): boolean {
  return node.kind === "workspace" || node.kind === "repo" || node.kind === "module";
}

function resolveProjectTreeSessionLeafLabel(node: ProjectTreeChildNode): string {
  return node.label;
}

function resolveProjectTreeSessionLeafIcon(node: ProjectTreeChildNode) {
  return node.kind === "acp-module" ? icons.link : icons.messageSquare;
}

type ProjectTreeNodeMatch = {
  node: ProjectTreeChildNode;
  parent: ProjectTreeChildNode | null;
};

function findProjectTreeNodeMatch(
  nodes: ProjectTreeChildNode[],
  targetId: string,
  parent: ProjectTreeChildNode | null = null,
): ProjectTreeNodeMatch | null {
  for (const node of nodes) {
    if (node.id === targetId) {
      return { node, parent };
    }
    const nested = findProjectTreeNodeMatch(node.children, targetId, node);
    if (nested) {
      return nested;
    }
  }
  return null;
}

function normalizeProjectTreeHandoffText(text: string | null): string {
  const collapsed = (text ?? "").replace(/\s+/g, " ").trim();
  if (!collapsed) {
    return "";
  }
  return collapsed.length > 280 ? `${collapsed.slice(0, 277).trimEnd()}...` : collapsed;
}

function collectProjectTreeRecentContext(
  messages: unknown[],
  role: "user" | "assistant",
  limit = 2,
): string[] {
  const collected: string[] = [];
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index] as { role?: unknown } | null;
    if (normalizeLowercaseStringOrEmpty(message?.role as string | undefined) !== role) {
      continue;
    }
    const text = normalizeProjectTreeHandoffText(extractText(message));
    if (!text || collected.includes(text)) {
      continue;
    }
    collected.push(text);
    if (collected.length >= limit) {
      break;
    }
  }
  return collected.toReversed();
}

async function loadProjectTreeSessionMessages(
  state: AppViewState,
  sessionKey: string,
): Promise<unknown[]> {
  if (
    state.sessionKey === sessionKey &&
    Array.isArray(state.chatMessages) &&
    state.chatMessages.length > 0
  ) {
    return state.chatMessages;
  }
  if (!state.client || !state.connected) {
    return [];
  }
  try {
    const response = (await state.client.request("chat.history", {
      sessionKey,
      limit: 40,
    })) as { messages?: unknown[] } | null;
    return Array.isArray(response?.messages) ? response.messages : [];
  } catch {
    return [];
  }
}

function buildProjectTreeAcpHandoffMessage(
  scope: string,
  parentSessionKey: string,
  messages: unknown[],
): string {
  const userContext = collectProjectTreeRecentContext(messages, "user");
  const assistantContext = collectProjectTreeRecentContext(messages, "assistant");
  const parts = [
    `Mission Control ACP handoff for ${scope}.`,
    "",
    "This ACP lane was spawned from the main chat for the same folder. Treat the main chat as the source of truth and use this lane for focused execution work.",
    "",
    `Parent session: ${parentSessionKey}`,
  ];
  if (userContext.length > 0) {
    parts.push("", "Recent user context:");
    for (const entry of userContext) {
      parts.push(`- ${entry}`);
    }
  }
  if (assistantContext.length > 0) {
    parts.push("", "Recent assistant context:");
    for (const entry of assistantContext) {
      parts.push(`- ${entry}`);
    }
  }
  parts.push(
    "",
    "Use this ACP lane for implementation, investigation, or validation. Report back with findings, concrete changes, validation, and blockers.",
  );
  return parts.join("\n");
}

async function createLinkedProjectTreeSession(
  state: AppViewState,
  node: ProjectTreeChildNode,
  options: {
    scopedRepoId: string;
    parentSessionKey?: string;
    message?: string;
  },
): Promise<string | null> {
  const created = await createSession(state, {
    agentId: options.scopedRepoId,
    label: buildProjectTreeSessionLabel(node),
    message: options.message ?? buildProjectTreeSessionMessage(node),
    parentSessionKey: options.parentSessionKey,
  });
  if (!created?.key) {
    state.lastError =
      state.sessionsError ??
      `Failed to create ${describeMissionControlTreeNodeKind(node.kind)} session.`;
    return null;
  }
  state.lastError = null;
  state.missionControlRegistry = {
    ...state.missionControlRegistry,
    treeNodes: linkMissionControlTreeNodeSession(
      state.missionControlRegistry.treeNodes ?? [],
      node.id,
      created.key,
    ),
  };
  void saveMissionControlRegistry(state);
  return created.key;
}

async function ensureProjectTreePrimaryChatSession(
  state: AppViewState,
  folderNode: ProjectTreeChildNode,
  scopedRepoId: string,
): Promise<string | null> {
  const projectTree = buildProjectTree(state);
  const latestFolderMatch = findProjectTreeNodeMatch(projectTree, folderNode.id);
  const latestFolderNode = latestFolderMatch?.node ?? folderNode;
  const currentSelectedChild = latestFolderNode.children.find(
    (child) => child.kind === "chat-module" && child.id === state.selectedProjectGroup,
  );
  const primaryChatNode =
    currentSelectedChild ??
    latestFolderNode.children.find(
      (child) =>
        child.kind === "chat-module" &&
        normalizeLowercaseStringOrEmpty(child.label) === "main chat",
    ) ??
    latestFolderNode.children.find((child) => child.kind === "chat-module") ??
    null;

  let resolvedChatNode = primaryChatNode;
  if (!resolvedChatNode) {
    const nextChatId = `tree:${crypto.randomUUID()}`;
    state.missionControlRegistry = {
      ...state.missionControlRegistry,
      treeNodes: appendMissionControlTreeNode(state.missionControlRegistry.treeNodes ?? [], {
        id: nextChatId,
        parentId: folderNode.id,
        kind: "chat-module",
        label: "Main Chat",
      }),
    };
    void saveMissionControlRegistry(state);
    resolvedChatNode = findProjectTreeNodeMatch(buildProjectTree(state), nextChatId)?.node ?? null;
  }
  if (!resolvedChatNode) {
    return null;
  }
  if (resolvedChatNode.linkedSessionKey) {
    return resolvedChatNode.linkedSessionKey;
  }
  return createLinkedProjectTreeSession(state, resolvedChatNode, {
    scopedRepoId,
  });
}

async function openProjectTreeNodeSession(
  state: AppViewState,
  node: ProjectTreeChildNode,
  options: {
    scopedRepoId: string;
    expandKeys?: string[];
  },
) {
  const nextCollapsed: AppViewState["settings"]["navGroupsCollapsed"] = {
    ...state.settings.navGroupsCollapsed,
    project: false,
  };
  for (const key of options.expandKeys ?? []) {
    nextCollapsed[key] = false;
  }
  state.applySettings({
    ...state.settings,
    selectedProjectRepo: options.scopedRepoId,
    selectedProjectGroup: node.id,
    navGroupsCollapsed: nextCollapsed,
  });
  state.selectedProjectRepo = options.scopedRepoId;
  state.selectedProjectGroup = node.id;
  if (state.tab !== "chat") {
    state.setTab("chat");
  }
  if (node.linkedSessionKey) {
    switchChatSession(state, node.linkedSessionKey);
    return;
  }
  let createdKey: string | null = null;
  if (node.kind === "acp-module") {
    const projectTree = buildProjectTree(state);
    const match = findProjectTreeNodeMatch(projectTree, node.id);
    const parentFolder = match?.parent;
    const parentSessionKey =
      parentFolder && isProjectTreeFolderNode(parentFolder)
        ? await ensureProjectTreePrimaryChatSession(state, parentFolder, options.scopedRepoId)
        : null;
    const parentMessages = parentSessionKey
      ? await loadProjectTreeSessionMessages(state, parentSessionKey)
      : [];
    createdKey = await createLinkedProjectTreeSession(state, node, {
      scopedRepoId: options.scopedRepoId,
      parentSessionKey: parentSessionKey ?? undefined,
      message: buildProjectTreeAcpHandoffMessage(
        buildProjectTreeSessionLabel(node),
        parentSessionKey ?? "not-linked",
        parentMessages,
      ),
    });
  } else {
    createdKey = await createLinkedProjectTreeSession(state, node, {
      scopedRepoId: options.scopedRepoId,
    });
  }
  if (!createdKey) {
    return;
  }
  switchChatSession(state, createdKey);
}

type DismissedUpdateBanner = {
  latestVersion: string;
  channel: string | null;
  dismissedAtMs: number;
};

function loadDismissedUpdateBanner(): DismissedUpdateBanner | null {
  try {
    const raw = getSafeLocalStorage()?.getItem(UPDATE_BANNER_DISMISS_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as Partial<DismissedUpdateBanner>;
    if (!parsed || typeof parsed.latestVersion !== "string") {
      return null;
    }
    return {
      latestVersion: parsed.latestVersion,
      channel: typeof parsed.channel === "string" ? parsed.channel : null,
      dismissedAtMs: typeof parsed.dismissedAtMs === "number" ? parsed.dismissedAtMs : Date.now(),
    };
  } catch {
    return null;
  }
}

function isUpdateBannerDismissed(updateAvailable: unknown): boolean {
  const dismissed = loadDismissedUpdateBanner();
  if (!dismissed) {
    return false;
  }
  const info = updateAvailable as { latestVersion?: unknown; channel?: unknown };
  const latestVersion = info && typeof info.latestVersion === "string" ? info.latestVersion : null;
  const channel = info && typeof info.channel === "string" ? info.channel : null;
  return Boolean(
    latestVersion && dismissed.latestVersion === latestVersion && dismissed.channel === channel,
  );
}

function dismissUpdateBanner(updateAvailable: unknown) {
  const info = updateAvailable as { latestVersion?: unknown; channel?: unknown };
  const latestVersion = info && typeof info.latestVersion === "string" ? info.latestVersion : null;
  if (!latestVersion) {
    return;
  }
  const channel = info && typeof info.channel === "string" ? info.channel : null;
  const payload: DismissedUpdateBanner = {
    latestVersion,
    channel,
    dismissedAtMs: Date.now(),
  };
  try {
    getSafeLocalStorage()?.setItem(UPDATE_BANNER_DISMISS_KEY, JSON.stringify(payload));
  } catch {
    // ignore
  }
}

const AVATAR_DATA_RE = /^data:/i;
const AVATAR_HTTP_RE = /^https?:\/\//i;
const COMMUNICATION_SECTION_KEYS = ["channels", "messages", "broadcast", "talk", "audio"] as const;
const APPEARANCE_SECTION_KEYS = ["__appearance__", "ui", "wizard"] as const;
const AUTOMATION_SECTION_KEYS = [
  "commands",
  "hooks",
  "bindings",
  "cron",
  "approvals",
  "plugins",
] as const;
const INFRASTRUCTURE_SECTION_KEYS = [
  "gateway",
  "web",
  "browser",
  "nodeHost",
  "canvasHost",
  "discovery",
  "media",
  "acp",
  "mcp",
] as const;
const AI_AGENTS_SECTION_KEYS = [
  "agents",
  "models",
  "skills",
  "tools",
  "memory",
  "session",
] as const;
type CommunicationSectionKey = (typeof COMMUNICATION_SECTION_KEYS)[number];
type AppearanceSectionKey = (typeof APPEARANCE_SECTION_KEYS)[number];
type AutomationSectionKey = (typeof AUTOMATION_SECTION_KEYS)[number];
type InfrastructureSectionKey = (typeof INFRASTRUCTURE_SECTION_KEYS)[number];
type AiAgentsSectionKey = (typeof AI_AGENTS_SECTION_KEYS)[number];

function resolveAssistantAvatarUrl(state: AppViewState): string | undefined {
  const list = state.agentsList?.agents ?? [];
  const parsed = parseAgentSessionKey(state.sessionKey);
  const agentId = parsed?.agentId ?? state.agentsList?.defaultId ?? "main";
  const agent = list.find((entry) => entry.id === agentId);
  const identity = agent?.identity;
  const candidate = identity?.avatarUrl ?? identity?.avatar;
  if (!candidate) {
    return undefined;
  }
  if (AVATAR_DATA_RE.test(candidate) || AVATAR_HTTP_RE.test(candidate)) {
    return candidate;
  }
  return identity?.avatarUrl;
}

export function renderApp(state: AppViewState) {
  const updatableState = state as AppViewState & { requestUpdate?: () => void };
  const requestHostUpdate =
    typeof updatableState.requestUpdate === "function"
      ? () => updatableState.requestUpdate?.()
      : undefined;
  _pendingUpdate = requestHostUpdate;

  // Gate: require successful gateway connection before showing the dashboard.
  // The gateway URL confirmation overlay is always rendered so URL-param flows still work.
  if (!state.connected) {
    return html` ${renderLoginGate(state)} ${renderGatewayUrlConfirmation(state)} `;
  }

  const presenceCount = state.presenceEntries.length;
  const sessionsCount = state.sessionsResult?.count ?? null;
  const cronNext = state.cronStatus?.nextWakeAtMs ?? null;
  const chatDisabledReason = state.connected ? null : t("chat.disconnected");
  const isChat = state.tab === "chat";
  const chatFocus = isChat && (state.settings.chatFocusMode || state.onboarding);
  const navDrawerOpen = Boolean(state.navDrawerOpen && !chatFocus && !state.onboarding);
  const navCollapsed = Boolean(state.settings.navCollapsed && !navDrawerOpen);
  const showThinking = state.onboarding ? false : state.settings.chatShowThinking;
  const showToolCalls = state.onboarding ? true : state.settings.chatShowToolCalls;
  const assistantAvatarUrl = resolveAssistantAvatarUrl(state);
  const chatAvatarUrl = state.chatAvatarUrl ?? assistantAvatarUrl ?? null;
  const configValue =
    state.configForm ?? (state.configSnapshot?.config as Record<string, unknown> | null);
  const configuredDreaming = resolveConfiguredDreaming(configValue);
  const dreamingOn = state.dreamingStatus?.enabled ?? configuredDreaming.enabled;
  const dreamingNextCycle = resolveDreamingNextCycle(state.dreamingStatus);
  const dreamingLoading = state.dreamingStatusLoading || state.dreamingModeSaving;
  const dreamingRefreshLoading = state.dreamingStatusLoading || state.dreamDiaryLoading;
  const sidebarNavWidth = resolveSidebarNavWidth(state);
  const refreshDreaming = () => {
    void Promise.all([loadDreamingStatus(state), loadDreamDiary(state)]);
  };
  const applyDreamingEnabled = (enabled: boolean) => {
    if (state.dreamingModeSaving || dreamingOn === enabled) {
      return;
    }
    void (async () => {
      const updated = await updateDreamingEnabled(state, enabled);
      if (!updated) {
        return;
      }
      await loadConfig(state);
      await loadDreamingStatus(state);
    })();
  };
  const basePath = normalizeBasePath(state.basePath ?? "");
  const resolvedAgentId =
    state.agentsSelectedId ??
    state.agentsList?.defaultId ??
    state.agentsList?.agents?.[0]?.id ??
    null;
  const activeSessionAgentId = resolveAgentIdFromSessionKey(state.sessionKey);
  const toolsPanelUsesActiveSession = Boolean(
    resolvedAgentId && activeSessionAgentId && resolvedAgentId === activeSessionAgentId,
  );
  const getCurrentConfigValue = () =>
    state.configForm ?? (state.configSnapshot?.config as Record<string, unknown> | null);
  const findAgentIndex = (agentId: string) =>
    findAgentConfigEntryIndex(getCurrentConfigValue(), agentId);
  const ensureAgentIndex = (agentId: string) => ensureAgentConfigEntry(state, agentId);
  const cronAgentSuggestions = sortLocaleStrings(
    new Set(
      [
        ...(state.agentsList?.agents?.map((entry) => entry.id.trim()) ?? []),
        ...state.cronJobs
          .map((job) => (typeof job.agentId === "string" ? job.agentId.trim() : ""))
          .filter(Boolean),
      ].filter(Boolean),
    ),
  );
  const cronModelSuggestions = sortLocaleStrings(
    new Set(
      [
        ...state.cronModelSuggestions,
        ...resolveConfiguredCronModelSuggestions(configValue),
        ...state.cronJobs
          .map((job) => {
            if (job.payload.kind !== "agentTurn" || typeof job.payload.model !== "string") {
              return "";
            }
            return job.payload.model.trim();
          })
          .filter(Boolean),
      ].filter(Boolean),
    ),
  );
  const visibleCronJobs = getVisibleCronJobs(state);
  const selectedDeliveryChannel =
    state.cronForm.deliveryChannel && state.cronForm.deliveryChannel.trim()
      ? state.cronForm.deliveryChannel.trim()
      : "last";
  const jobToSuggestions = state.cronJobs
    .map((job) => normalizeSuggestionValue(job.delivery?.to))
    .filter(Boolean);
  const accountToSuggestions = (
    selectedDeliveryChannel === "last"
      ? Object.values(state.channelsSnapshot?.channelAccounts ?? {}).flat()
      : (state.channelsSnapshot?.channelAccounts?.[selectedDeliveryChannel] ?? [])
  )
    .flatMap((account) => [
      normalizeSuggestionValue(account.accountId),
      normalizeSuggestionValue(account.name),
    ])
    .filter(Boolean);
  const rawDeliveryToSuggestions = uniquePreserveOrder([
    ...jobToSuggestions,
    ...accountToSuggestions,
  ]);
  const accountSuggestions = uniquePreserveOrder(accountToSuggestions);
  const deliveryToSuggestions =
    state.cronForm.deliveryMode === "webhook"
      ? rawDeliveryToSuggestions.filter((value) => isHttpUrl(value))
      : rawDeliveryToSuggestions;

  return html`
    ${renderCommandPalette({
      open: state.paletteOpen,
      query: state.paletteQuery,
      activeIndex: state.paletteActiveIndex,
      onToggle: () => {
        state.paletteOpen = !state.paletteOpen;
      },
      onQueryChange: (q) => {
        state.paletteQuery = q;
      },
      onActiveIndexChange: (i) => {
        state.paletteActiveIndex = i;
      },
      onNavigate: (tab) => {
        state.setTab(tab as import("./navigation.ts").Tab);
      },
      onSlashCommand: (cmd) => {
        state.setTab("chat" as import("./navigation.ts").Tab);
        state.chatMessage = cmd.endsWith(" ") ? cmd : `${cmd} `;
      },
    })}
    <div
      class="shell ${isChat ? "shell--chat" : ""} ${chatFocus
        ? "shell--chat-focus"
        : ""} ${navCollapsed ? "shell--nav-collapsed" : ""} ${navDrawerOpen
        ? "shell--nav-drawer-open"
        : ""} ${state.onboarding ? "shell--onboarding" : ""}"
      style=${`--shell-nav-width: ${sidebarNavWidth}px;`}
    >
      <button
        type="button"
        class="shell-nav-backdrop"
        aria-label="${t("nav.collapse")}"
        @click=${() => {
          state.navDrawerOpen = false;
        }}
      ></button>
      <header class="topbar">
        <div class="topnav-shell">
          <button
            type="button"
            class="topbar-nav-toggle"
            @click=${() => {
              state.navDrawerOpen = !navDrawerOpen;
            }}
            title="${navDrawerOpen ? t("nav.collapse") : t("nav.expand")}"
            aria-label="${navDrawerOpen ? t("nav.collapse") : t("nav.expand")}"
            aria-expanded=${navDrawerOpen}
          >
            <span class="nav-collapse-toggle__icon" aria-hidden="true">${icons.menu}</span>
          </button>
          <div class="topnav-shell__content">
            <dashboard-header .tab=${state.tab}></dashboard-header>
          </div>
          <div class="topnav-shell__actions">
            <button
              class="topbar-search"
              @click=${() => {
                state.paletteOpen = !state.paletteOpen;
              }}
              title="Search or jump to… (⌘K)"
              aria-label="Open command palette"
            >
              <span class="topbar-search__label">${t("common.search")}</span>
              <kbd class="topbar-search__kbd">⌘K</kbd>
            </button>
            <div class="topbar-status">
              ${isChat ? renderChatMobileToggle(state) : nothing}
              ${renderTopbarThemeModeToggle(state)}
            </div>
          </div>
        </div>
      </header>
      <div class="shell-nav">
        <aside class="sidebar ${navCollapsed ? "sidebar--collapsed" : ""}">
          <div class="sidebar-shell">
            <div class="sidebar-shell__header">
              <div class="sidebar-brand">
                ${navCollapsed
                  ? nothing
                  : html`
                      <img
                        class="sidebar-brand__logo"
                        src="${agentLogoUrl(basePath)}"
                        alt="OpenClaw"
                      />
                      <span class="sidebar-brand__copy">
                        <span class="sidebar-brand__eyebrow">${t("nav.control")}</span>
                        <span class="sidebar-brand__title">OpenClaw</span>
                      </span>
                    `}
              </div>
              <button
                type="button"
                class="nav-collapse-toggle"
                @click=${() =>
                  state.applySettings({
                    ...state.settings,
                    navCollapsed: !state.settings.navCollapsed,
                  })}
                title="${navCollapsed ? t("nav.expand") : t("nav.collapse")}"
                aria-label="${navCollapsed ? t("nav.expand") : t("nav.collapse")}"
              >
                <span class="nav-collapse-toggle__icon" aria-hidden="true"
                  >${navCollapsed ? icons.panelLeftOpen : icons.panelLeftClose}</span
                >
              </button>
            </div>
            <div class="sidebar-shell__body">
              <nav class="sidebar-nav">
                ${TAB_GROUPS.map((group) => {
                  const isGroupCollapsed = state.settings.navGroupsCollapsed[group.label] ?? false;
                  const hasActiveTab = group.tabs.some((tab) => tab === state.tab);
                  const showItems = navCollapsed || hasActiveTab || !isGroupCollapsed;
                  const projectTree = group.label === "chat" ? buildProjectTree(state) : [];

                  return html`
                    <section class="nav-section ${!showItems ? "nav-section--collapsed" : ""}">
                      ${!navCollapsed
                        ? html`
                            <button
                              class="nav-section__label"
                              @click=${() => {
                                const next = { ...state.settings.navGroupsCollapsed };
                                next[group.label] = !isGroupCollapsed;
                                state.applySettings({
                                  ...state.settings,
                                  navGroupsCollapsed: next,
                                });
                              }}
                              aria-expanded=${showItems}
                            >
                              <span class="nav-section__label-text"
                                >${t(`nav.${group.label}`)}</span
                              >
                              <span class="nav-section__chevron"> ${icons.chevronDown} </span>
                            </button>
                          `
                        : nothing}
                      <div class="nav-section__items">
                        ${group.tabs.map((tab) => {
                          if (group.label === "chat" && tab === "sessions" && !navCollapsed) {
                            const projectExpanded = !(
                              state.settings.navGroupsCollapsed.project ?? true
                            );
                            const renderTreeNode = (
                              node: (typeof projectTree)[number],
                              depth = 0,
                            ): unknown => {
                              const collapsedKey = `tree:${node.id}`;
                              const expanded = !(
                                state.settings.navGroupsCollapsed[collapsedKey] ?? false
                              );
                              const hasChildren = node.children.length > 0;
                              const isFolderNode = isProjectTreeFolderNode(node);
                              const canCreateChildren =
                                resolveMissionControlChildKinds(node.kind).length > 0;
                              const canRemoveNode = node.kind !== "workspace";
                              const hasExpandableContent = hasChildren;
                              const scopedRepoId =
                                node.repoContext?.id ??
                                state.selectedProjectRepo ??
                                resolveAgentIdFromSessionKey(state.sessionKey) ??
                                "main";
                              const isScopedNodeActive =
                                state.selectedProjectGroup === node.id ||
                                (node.kind === "repo" &&
                                  state.selectedProjectRepo === scopedRepoId);
                              const renderNodeActions = () => html`
                                <div class="nav-project-row__actions">
                                  ${canCreateChildren && node.kind === "workspace"
                                    ? html`
                                        <button
                                          type="button"
                                          class="nav-project-action nav-project-group__add nav-project-action--add-folder"
                                          title="Add under ${node.label}"
                                          aria-label="Add under ${node.label}"
                                          @click=${() =>
                                            createMissionControlTreeChildNode(state, {
                                              parentId: node.id,
                                              parentKind: node.kind,
                                              parentLabel: node.label,
                                              requestedKind: "repo",
                                              expandKeys: [collapsedKey],
                                            })}
                                        >
                                          ${icons.plus}
                                        </button>
                                      `
                                    : nothing}
                                  ${canCreateChildren && node.kind !== "workspace"
                                    ? html`
                                        <button
                                          type="button"
                                          class="nav-project-action nav-project-group__add nav-project-action--add-folder"
                                          title="Add module under ${node.label}"
                                          aria-label="Add module under ${node.label}"
                                          @click=${() =>
                                            createMissionControlTreeChildNode(state, {
                                              parentId: node.id,
                                              parentKind: node.kind,
                                              parentLabel: node.label,
                                              requestedKind: "module",
                                              expandKeys: [collapsedKey],
                                            })}
                                        >
                                          ${icons.plus}
                                        </button>
                                        <button
                                          type="button"
                                          class="nav-project-action nav-project-action--add-chat"
                                          title="Add chat under ${node.label}"
                                          aria-label="Add chat under ${node.label}"
                                          @click=${() =>
                                            createMissionControlTreeChildNode(state, {
                                              parentId: node.id,
                                              parentKind: node.kind,
                                              parentLabel: node.label,
                                              requestedKind: "chat-module",
                                              expandKeys: [collapsedKey],
                                            })}
                                        >
                                          ${icons.messageSquare}
                                        </button>
                                        <button
                                          type="button"
                                          class="nav-project-action nav-project-action--add-acp"
                                          title="Add ACP under ${node.label}"
                                          aria-label="Add ACP under ${node.label}"
                                          @click=${() =>
                                            createMissionControlTreeChildNode(state, {
                                              parentId: node.id,
                                              parentKind: node.kind,
                                              parentLabel: node.label,
                                              requestedKind: "acp-module",
                                              expandKeys: [collapsedKey],
                                            })}
                                        >
                                          ${icons.link}
                                        </button>
                                      `
                                    : nothing}
                                  ${canRemoveNode
                                    ? html`
                                        <button
                                          type="button"
                                          class="nav-project-action nav-project-action--remove nav-project-group__remove"
                                          title="Remove ${node.label}"
                                          aria-label="Remove ${node.label}"
                                          @click=${() => removeMissionControlTreeNode(state, node)}
                                        >
                                          -
                                        </button>
                                      `
                                    : nothing}
                                </div>
                              `;
                              const renderSessionLeaf = (
                                targetNode: ProjectTreeChildNode,
                                leafDepth: number,
                              ) => {
                                const isLeafActive = state.selectedProjectGroup === targetNode.id;
                                const leafTitle =
                                  targetNode.linkedSessionKey ??
                                  targetNode.repoContext?.title ??
                                  buildProjectTreeSessionLabel(targetNode);
                                return html`
                                  <div
                                    class="nav-project-group nav-project-group--depth-${leafDepth}"
                                  >
                                    <div class="nav-project-row-shell">
                                      <button
                                        type="button"
                                        class="nav-project-row nav-project-row--leaf ${isLeafActive
                                          ? "nav-project-row--active"
                                          : ""}"
                                        title=${leafTitle}
                                        @click=${() =>
                                          openProjectTreeNodeSession(state, targetNode, {
                                            scopedRepoId,
                                          })}
                                      >
                                        <span
                                          class="nav-project-row__caret nav-project-row__caret--placeholder"
                                          aria-hidden="true"
                                        ></span>
                                        <span class="nav-project-row__icon" aria-hidden="true"
                                          >${resolveProjectTreeSessionLeafIcon(targetNode)}</span
                                        >
                                        <span class="nav-project-group__text"
                                          >${resolveProjectTreeSessionLeafLabel(targetNode)}</span
                                        >
                                      </button>
                                      ${renderNodeActions()}
                                    </div>
                                  </div>
                                `;
                              };

                              if (!isFolderNode) {
                                return renderSessionLeaf(node, depth);
                              }

                              return html`
                                <div class="nav-project-group nav-project-group--depth-${depth}">
                                  <div class="nav-project-row-shell">
                                    <button
                                      type="button"
                                      class="nav-project-row nav-project-row--folder ${isScopedNodeActive
                                        ? "nav-project-row--active"
                                        : ""}"
                                      aria-expanded=${expanded}
                                      title=${node.label}
                                      @click=${() => {
                                        if (!hasExpandableContent) {
                                          return;
                                        }
                                        state.applySettings({
                                          ...state.settings,
                                          navGroupsCollapsed: {
                                            ...state.settings.navGroupsCollapsed,
                                            [collapsedKey]: expanded,
                                          },
                                        });
                                      }}
                                    >
                                      <span class="nav-project-row__caret" aria-hidden="true"
                                        >${hasExpandableContent
                                          ? expanded
                                            ? icons.chevronDown
                                            : icons.chevronRight
                                          : nothing}</span
                                      >
                                      <span class="nav-project-row__icon" aria-hidden="true"
                                        >${icons.folder}</span
                                      >
                                      <span class="nav-project-group__text">${node.label}</span>
                                    </button>
                                    ${renderNodeActions()}
                                  </div>
                                  ${hasExpandableContent
                                    ? html`<div
                                        class="nav-project-group__children ${expanded
                                          ? ""
                                          : "nav-project-group__children--collapsed"}"
                                      >
                                        ${node.children.map((child) =>
                                          renderTreeNode(child, depth + 1),
                                        )}
                                      </div>`
                                    : nothing}
                                </div>
                              `;
                            };
                            return html`
                              <div class="nav-project-node">
                                <div class="nav-project-node__row">
                                  <button
                                    type="button"
                                    class="nav-project-row nav-project-row--folder nav-project-row--root"
                                    aria-expanded=${projectExpanded}
                                    @click=${() => {
                                      const isCollapsed =
                                        state.settings.navGroupsCollapsed.project ?? true;
                                      state.applySettings({
                                        ...state.settings,
                                        navGroupsCollapsed: {
                                          ...state.settings.navGroupsCollapsed,
                                          project: !isCollapsed,
                                        },
                                      });
                                    }}
                                  >
                                    <span class="nav-project-row__caret" aria-hidden="true"
                                      >${projectExpanded
                                        ? icons.chevronDown
                                        : icons.chevronRight}</span
                                    >
                                    <span class="nav-project-row__icon" aria-hidden="true"
                                      >${icons.folder}</span
                                    >
                                    <span class="nav-project-group__text">${titleForTab(tab)}</span>
                                  </button>
                                  <div class="nav-project-row__actions">
                                    <button
                                      type="button"
                                      class="nav-project-action nav-project-group__add nav-project-action--add-folder"
                                      title="Add project root"
                                      aria-label="Add project root"
                                      @click=${() => {
                                        const ensuredWorkspace = ensureMissionControlWorkspaceNode(
                                          state.missionControlRegistry,
                                          state.missionControlRegistry.treeNodes ?? [],
                                        );
                                        createMissionControlTreeChildNode(state, {
                                          treeNodes: ensuredWorkspace.treeNodes,
                                          parentId: ensuredWorkspace.workspaceNode.id,
                                          parentKind: ensuredWorkspace.workspaceNode.kind,
                                          parentLabel: titleForTab(tab),
                                          requestedKind: "repo",
                                          expandKeys: [`tree:${ensuredWorkspace.workspaceNode.id}`],
                                        });
                                      }}
                                    >
                                      ${icons.plus}
                                    </button>
                                  </div>
                                </div>
                                ${projectExpanded
                                  ? html`
                                      <div class="nav-project-tree">
                                        <div class="nav-project-list">
                                          ${projectTree.map((treeNode) => renderTreeNode(treeNode))}
                                        </div>
                                      </div>
                                    `
                                  : nothing}
                              </div>
                            `;
                          }
                          return renderTab(state, tab, { collapsed: navCollapsed });
                        })}
                      </div>
                    </section>
                  `;
                })}
              </nav>
            </div>
            <div class="sidebar-shell__footer">
              <div class="sidebar-utility-group">
                <a
                  class="nav-item nav-item--external sidebar-utility-link"
                  href="https://docs.openclaw.ai"
                  target=${EXTERNAL_LINK_TARGET}
                  rel=${buildExternalLinkRel()}
                  title="${t("common.docs")} (opens in new tab)"
                >
                  <span class="nav-item__icon" aria-hidden="true">${icons.book}</span>
                  ${!navCollapsed
                    ? html`
                        <span class="nav-item__text">${t("common.docs")}</span>
                        <span class="nav-item__external-icon">${icons.externalLink}</span>
                      `
                    : nothing}
                </a>
                <div class="sidebar-mode-switch">${renderTopbarThemeModeToggle(state)}</div>
                ${(() => {
                  const version = state.hello?.server?.version ?? "";
                  return version
                    ? html`
                        <div class="sidebar-version" title=${`v${version}`}>
                          ${!navCollapsed
                            ? html`
                                <span class="sidebar-version__label">${t("common.version")}</span>
                                <span class="sidebar-version__text">v${version}</span>
                                ${renderSidebarConnectionStatus(state)}
                              `
                            : html` ${renderSidebarConnectionStatus(state)} `}
                        </div>
                      `
                    : nothing;
                })()}
              </div>
            </div>
          </div>
        </aside>
        ${!navCollapsed
          ? html`
              <div
                class="sidebar-resizer"
                role="separator"
                aria-orientation="vertical"
                aria-label="${t("nav.resize")}"
                title="${t("nav.resize")}"
                tabindex="0"
                @mousedown=${(event: MouseEvent) => startSidebarResize(state, event)}
                @keydown=${(event: KeyboardEvent) => handleSidebarResizeKeydown(state, event)}
              ></div>
            `
          : nothing}
      </div>
      <main class="content ${isChat ? "content--chat" : ""}">
        ${state.updateAvailable &&
        state.updateAvailable.latestVersion !== state.updateAvailable.currentVersion &&
        !isUpdateBannerDismissed(state.updateAvailable)
          ? html`<div class="update-banner callout danger" role="alert">
              <strong>Update available:</strong> v${state.updateAvailable.latestVersion} (running
              v${state.updateAvailable.currentVersion}).
              <button
                class="btn btn--sm update-banner__btn"
                ?disabled=${state.updateRunning || !state.connected}
                @click=${() => runUpdate(state)}
              >
                ${state.updateRunning ? "Updating…" : "Update now"}
              </button>
              <button
                class="update-banner__close"
                type="button"
                title="Dismiss"
                aria-label="Dismiss update banner"
                @click=${() => {
                  dismissUpdateBanner(state.updateAvailable);
                  state.updateAvailable = null;
                }}
              >
                ${icons.x}
              </button>
            </div>`
          : nothing}
        ${state.tab === "config"
          ? nothing
          : html`<section class="content-header">
              <div>
                ${isChat
                  ? renderChatSessionSelect(state)
                  : html`<div class="page-title">${titleForTab(state.tab)}</div>`}
                ${isChat ? nothing : html`<div class="page-sub">${subtitleForTab(state.tab)}</div>`}
              </div>
              <div class="page-meta">
                ${state.tab === "dreams"
                  ? html`
                      <div class="dreaming-header-controls">
                        <button
                          class="btn btn--subtle btn--sm"
                          ?disabled=${dreamingLoading || state.dreamDiaryLoading}
                          @click=${refreshDreaming}
                        >
                          ${dreamingRefreshLoading
                            ? t("dreaming.header.refreshing")
                            : t("dreaming.header.refresh")}
                        </button>
                        <button
                          class="dreams__phase-toggle ${dreamingOn
                            ? "dreams__phase-toggle--on"
                            : ""}"
                          ?disabled=${dreamingLoading}
                          @click=${() => applyDreamingEnabled(!dreamingOn)}
                        >
                          <span class="dreams__phase-toggle-dot"></span>
                          <span class="dreams__phase-toggle-label">
                            ${dreamingOn ? t("dreaming.header.on") : t("dreaming.header.off")}
                          </span>
                        </button>
                      </div>
                    `
                  : nothing}
                ${state.lastError
                  ? html`<div class="pill danger">${state.lastError}</div>`
                  : nothing}
                ${isChat ? renderChatControls(state) : nothing}
              </div>
            </section>`}
        ${state.tab === "missionControl"
          ? renderMissionControl({
              registry: state.missionControlRegistry,
              intakeDraft: state.missionControlIntakeDraft,
              onNavigate: (tab) => state.setTab(tab),
              onOpenSession: (sessionKey) => {
                switchChatSession(state, sessionKey);
                state.setTab("chat" as import("./navigation.ts").Tab);
              },
              onCreateLaneSession: async (lane: MissionControlSessionLane) => {
                const created = await createSession(state, {
                  label: lane.name,
                  message: `Mission Control routed work to ${lane.name}. Confirm domain ownership, define the next scoped action, and continue in the correct repo lane.`,
                });
                if (!created?.key) {
                  state.lastError = state.sessionsError ?? "Failed to create lane session.";
                  return;
                }
                state.lastError = null;
                switchChatSession(state, created.key);
                state.setTab("chat" as import("./navigation.ts").Tab);
              },
              onRouteRequest: (route: MissionControlIntakeRoute) => {
                state.missionControlIntakeDraft = applyMissionControlRouteDraft(
                  state.missionControlIntakeDraft,
                  route,
                );
              },
              onDomainOwnerChange: (domainId, owner) => {
                state.missionControlRegistry = updateMissionControlDomainOwner(
                  state.missionControlRegistry,
                  domainId,
                  owner,
                );
                void saveMissionControlRegistry(state);
              },
              onLaneOwnerChange: (laneId, owner) => {
                state.missionControlRegistry = updateMissionControlLaneOwner(
                  state.missionControlRegistry,
                  laneId,
                  owner,
                );
                void saveMissionControlRegistry(state);
              },
              onIntakeDraftChange: (patch) => {
                state.missionControlIntakeDraft = applyMissionControlIntakeDraftPatch(
                  state.missionControlIntakeDraft,
                  patch,
                  state.missionControlRegistry,
                );
              },
              onSubmitIntake: async () => {
                const payload = buildMissionControlIntakeSessionPayload(
                  state.missionControlRegistry,
                  state.missionControlIntakeDraft,
                );
                if (!payload.ok) {
                  state.lastError = payload.error;
                  return;
                }
                const created = await createSession(state, {
                  label: payload.label,
                  message: payload.message,
                });
                if (!created?.key) {
                  state.lastError =
                    state.sessionsError ?? "Failed to create routed Mission Control session.";
                  return;
                }
                state.lastError = null;
                state.missionControlIntakeDraft = createMissionControlIntakeDraft(
                  state.missionControlRegistry,
                );
                switchChatSession(state, created.key);
                state.setTab("chat" as import("./navigation.ts").Tab);
              },
              onResetIntake: () => {
                state.missionControlIntakeDraft = createMissionControlIntakeDraft(
                  state.missionControlRegistry,
                );
              },
              summary: {
                connected: state.connected,
                sessionsCount: state.sessionsResult?.count ?? 0,
                activeInstances: state.presenceEntries.length,
                agentsCount: state.agentsList?.agents?.length ?? 0,
                cronJobs: state.cronJobs.length,
                defaultSessionKey:
                  state.settings.lastActiveSessionKey || state.settings.sessionKey || null,
              },
              sessions: state.sessionsResult?.sessions ?? [],
            })
          : nothing}
        ${state.tab === "overview"
          ? renderOverview({
              connected: state.connected,
              hello: state.hello,
              settings: state.settings,
              password: state.password,
              lastError: state.lastError,
              lastErrorCode: state.lastErrorCode,
              presenceCount,
              sessionsCount,
              cronEnabled: state.cronStatus?.enabled ?? null,
              cronNext,
              lastChannelsRefresh: state.channelsLastSuccess,
              warnQueryToken,
              usageResult: state.usageResult,
              sessionsResult: state.sessionsResult,
              skillsReport: state.skillsReport,
              cronJobs: state.cronJobs,
              cronStatus: state.cronStatus,
              attentionItems: state.attentionItems,
              eventLog: state.eventLog,
              overviewLogLines: state.overviewLogLines,
              showGatewayToken: state.overviewShowGatewayToken,
              showGatewayPassword: state.overviewShowGatewayPassword,
              onSettingsChange: (next) => state.applySettings(next),
              onPasswordChange: (next) => (state.password = next),
              onSessionKeyChange: (next) => {
                state.sessionKey = next;
                state.chatMessage = "";
                state.resetToolStream();
                state.applySettings({
                  ...state.settings,
                  sessionKey: next,
                  lastActiveSessionKey: next,
                });
                void state.loadAssistantIdentity();
              },
              onToggleGatewayTokenVisibility: () => {
                state.overviewShowGatewayToken = !state.overviewShowGatewayToken;
              },
              onToggleGatewayPasswordVisibility: () => {
                state.overviewShowGatewayPassword = !state.overviewShowGatewayPassword;
              },
              onConnect: () => state.connect(),
              onRefresh: () => state.loadOverview(),
              onNavigate: (tab) => state.setTab(tab as import("./navigation.ts").Tab),
              onRefreshLogs: () => state.loadOverview(),
            })
          : nothing}
        ${state.tab === "channels"
          ? lazyRender(lazyChannels, (m) =>
              m.renderChannels({
                connected: state.connected,
                loading: state.channelsLoading,
                snapshot: state.channelsSnapshot,
                lastError: state.channelsError,
                lastSuccessAt: state.channelsLastSuccess,
                whatsappMessage: state.whatsappLoginMessage,
                whatsappQrDataUrl: state.whatsappLoginQrDataUrl,
                whatsappConnected: state.whatsappLoginConnected,
                whatsappBusy: state.whatsappBusy,
                configSchema: state.configSchema,
                configSchemaLoading: state.configSchemaLoading,
                configForm: state.configForm,
                configUiHints: state.configUiHints,
                configSaving: state.configSaving,
                configFormDirty: state.configFormDirty,
                nostrProfileFormState: state.nostrProfileFormState,
                nostrProfileAccountId: state.nostrProfileAccountId,
                onRefresh: (probe) => loadChannels(state, probe),
                onWhatsAppStart: (force) => state.handleWhatsAppStart(force),
                onWhatsAppWait: () => state.handleWhatsAppWait(),
                onWhatsAppLogout: () => state.handleWhatsAppLogout(),
                onConfigPatch: (path, value) => updateConfigFormValue(state, path, value),
                onConfigSave: () => state.handleChannelConfigSave(),
                onConfigReload: () => state.handleChannelConfigReload(),
                onNostrProfileEdit: (accountId, profile) =>
                  state.handleNostrProfileEdit(accountId, profile),
                onNostrProfileCancel: () => state.handleNostrProfileCancel(),
                onNostrProfileFieldChange: (field, value) =>
                  state.handleNostrProfileFieldChange(field, value),
                onNostrProfileSave: () => state.handleNostrProfileSave(),
                onNostrProfileImport: () => state.handleNostrProfileImport(),
                onNostrProfileToggleAdvanced: () => state.handleNostrProfileToggleAdvanced(),
              }),
            )
          : nothing}
        ${state.tab === "instances"
          ? lazyRender(lazyInstances, (m) =>
              m.renderInstances({
                loading: state.presenceLoading,
                entries: state.presenceEntries,
                lastError: state.presenceError,
                statusMessage: state.presenceStatus,
                onRefresh: () => loadPresence(state),
              }),
            )
          : nothing}
        ${state.tab === "sessions"
          ? lazyRender(lazySessions, (m) =>
              m.renderSessions({
                loading: state.sessionsLoading,
                result: state.sessionsResult,
                error: state.sessionsError,
                activeMinutes: state.sessionsFilterActive,
                limit: state.sessionsFilterLimit,
                includeGlobal: state.sessionsIncludeGlobal,
                includeUnknown: state.sessionsIncludeUnknown,
                basePath: state.basePath,
                searchQuery: state.sessionsSearchQuery,
                sortColumn: state.sessionsSortColumn,
                sortDir: state.sessionsSortDir,
                page: state.sessionsPage,
                pageSize: state.sessionsPageSize,
                selectedKeys: state.sessionsSelectedKeys,
                expandedCheckpointKey: state.sessionsExpandedCheckpointKey,
                checkpointItemsByKey: state.sessionsCheckpointItemsByKey,
                checkpointLoadingKey: state.sessionsCheckpointLoadingKey,
                checkpointBusyKey: state.sessionsCheckpointBusyKey,
                checkpointErrorByKey: state.sessionsCheckpointErrorByKey,
                onFiltersChange: (next) => {
                  state.sessionsFilterActive = next.activeMinutes;
                  state.sessionsFilterLimit = next.limit;
                  state.sessionsIncludeGlobal = next.includeGlobal;
                  state.sessionsIncludeUnknown = next.includeUnknown;
                },
                onSearchChange: (q) => {
                  state.sessionsSearchQuery = q;
                  state.sessionsPage = 0;
                },
                onSortChange: (col, dir) => {
                  state.sessionsSortColumn = col;
                  state.sessionsSortDir = dir;
                  state.sessionsPage = 0;
                },
                onPageChange: (p) => {
                  state.sessionsPage = p;
                },
                onPageSizeChange: (s) => {
                  state.sessionsPageSize = s;
                  state.sessionsPage = 0;
                },
                onRefresh: () => loadSessions(state),
                onPatch: (key, patch) => patchSession(state, key, patch),
                onToggleSelect: (key) => {
                  const next = new Set(state.sessionsSelectedKeys);
                  if (next.has(key)) {
                    next.delete(key);
                  } else {
                    next.add(key);
                  }
                  state.sessionsSelectedKeys = next;
                },
                onSelectPage: (keys) => {
                  const next = new Set(state.sessionsSelectedKeys);
                  for (const k of keys) {
                    next.add(k);
                  }
                  state.sessionsSelectedKeys = next;
                },
                onDeselectPage: (keys) => {
                  const next = new Set(state.sessionsSelectedKeys);
                  for (const k of keys) {
                    next.delete(k);
                  }
                  state.sessionsSelectedKeys = next;
                },
                onDeselectAll: () => {
                  state.sessionsSelectedKeys = new Set();
                },
                onDeleteSelected: async () => {
                  const keys = [...state.sessionsSelectedKeys];
                  const deleted = await deleteSessionsAndRefresh(state, keys);
                  if (deleted.length > 0) {
                    const next = new Set(state.sessionsSelectedKeys);
                    for (const k of deleted) {
                      next.delete(k);
                    }
                    state.sessionsSelectedKeys = next;
                  }
                },
                onNavigateToChat: (sessionKey) => {
                  switchChatSession(state, sessionKey);
                  state.setTab("chat" as import("./navigation.ts").Tab);
                },
                onToggleCheckpointDetails: (sessionKey) =>
                  toggleSessionCompactionCheckpoints(state, sessionKey),
                onBranchFromCheckpoint: async (sessionKey, checkpointId) => {
                  const nextKey = await branchSessionFromCheckpoint(
                    state,
                    sessionKey,
                    checkpointId,
                  );
                  if (nextKey) {
                    switchChatSession(state, nextKey);
                    state.setTab("chat" as import("./navigation.ts").Tab);
                  }
                },
                onRestoreCheckpoint: (sessionKey, checkpointId) =>
                  restoreSessionFromCheckpoint(state, sessionKey, checkpointId),
              }),
            )
          : nothing}
        ${renderUsageTab(state)}
        ${state.tab === "cron"
          ? lazyRender(lazyCron, (m) =>
              m.renderCron({
                basePath: state.basePath,
                loading: state.cronLoading,
                status: state.cronStatus,
                jobs: visibleCronJobs,
                jobsLoadingMore: state.cronJobsLoadingMore,
                jobsTotal: state.cronJobsTotal,
                jobsHasMore: state.cronJobsHasMore,
                jobsQuery: state.cronJobsQuery,
                jobsEnabledFilter: state.cronJobsEnabledFilter,
                jobsScheduleKindFilter: state.cronJobsScheduleKindFilter,
                jobsLastStatusFilter: state.cronJobsLastStatusFilter,
                jobsSortBy: state.cronJobsSortBy,
                jobsSortDir: state.cronJobsSortDir,
                editingJobId: state.cronEditingJobId,
                error: state.cronError,
                busy: state.cronBusy,
                form: state.cronForm,
                channels: state.channelsSnapshot?.channelMeta?.length
                  ? state.channelsSnapshot.channelMeta.map((entry) => entry.id)
                  : (state.channelsSnapshot?.channelOrder ?? []),
                channelLabels: state.channelsSnapshot?.channelLabels ?? {},
                channelMeta: state.channelsSnapshot?.channelMeta ?? [],
                runsJobId: state.cronRunsJobId,
                runs: state.cronRuns,
                runsTotal: state.cronRunsTotal,
                runsHasMore: state.cronRunsHasMore,
                runsLoadingMore: state.cronRunsLoadingMore,
                runsScope: state.cronRunsScope,
                runsStatuses: state.cronRunsStatuses,
                runsDeliveryStatuses: state.cronRunsDeliveryStatuses,
                runsStatusFilter: state.cronRunsStatusFilter,
                runsQuery: state.cronRunsQuery,
                runsSortDir: state.cronRunsSortDir,
                fieldErrors: state.cronFieldErrors,
                canSubmit: !hasCronFormErrors(state.cronFieldErrors),
                agentSuggestions: cronAgentSuggestions,
                modelSuggestions: cronModelSuggestions,
                thinkingSuggestions: CRON_THINKING_SUGGESTIONS,
                timezoneSuggestions: CRON_TIMEZONE_SUGGESTIONS,
                deliveryToSuggestions,
                accountSuggestions,
                onFormChange: (patch) => {
                  state.cronForm = normalizeCronFormState({ ...state.cronForm, ...patch });
                  state.cronFieldErrors = validateCronForm(state.cronForm);
                },
                onRefresh: () => state.loadCron(),
                onAdd: () => addCronJob(state),
                onEdit: (job) => startCronEdit(state, job),
                onClone: (job) => startCronClone(state, job),
                onCancelEdit: () => cancelCronEdit(state),
                onToggle: (job, enabled) => toggleCronJob(state, job, enabled),
                onRun: (job, mode) => runCronJob(state, job, mode ?? "force"),
                onRemove: (job) => removeCronJob(state, job),
                onLoadRuns: async (jobId) => {
                  updateCronRunsFilter(state, { cronRunsScope: "job" });
                  await loadCronRuns(state, jobId);
                },
                onLoadMoreJobs: () => loadMoreCronJobs(state),
                onJobsFiltersChange: async (patch) => {
                  updateCronJobsFilter(state, patch);
                  const shouldReload =
                    typeof patch.cronJobsQuery === "string" ||
                    Boolean(patch.cronJobsEnabledFilter) ||
                    Boolean(patch.cronJobsSortBy) ||
                    Boolean(patch.cronJobsSortDir);
                  if (shouldReload) {
                    await reloadCronJobs(state);
                  }
                },
                onJobsFiltersReset: async () => {
                  updateCronJobsFilter(state, {
                    cronJobsQuery: "",
                    cronJobsEnabledFilter: "all",
                    cronJobsScheduleKindFilter: "all",
                    cronJobsLastStatusFilter: "all",
                    cronJobsSortBy: "nextRunAtMs",
                    cronJobsSortDir: "asc",
                  });
                  await reloadCronJobs(state);
                },
                onLoadMoreRuns: () => loadMoreCronRuns(state),
                onRunsFiltersChange: async (patch) => {
                  updateCronRunsFilter(state, patch);
                  if (state.cronRunsScope === "all") {
                    await loadCronRuns(state, null);
                    return;
                  }
                  await loadCronRuns(state, state.cronRunsJobId);
                },
                onNavigateToChat: (sessionKey) => {
                  switchChatSession(state, sessionKey);
                  state.setTab("chat" as import("./navigation.ts").Tab);
                },
              }),
            )
          : nothing}
        ${state.tab === "agents"
          ? lazyRender(lazyAgents, (m) =>
              m.renderAgents({
                basePath: state.basePath ?? "",
                loading: state.agentsLoading,
                error: state.agentsError,
                agentsList: state.agentsList,
                selectedAgentId: resolvedAgentId,
                activePanel: state.agentsPanel,
                config: {
                  form: configValue,
                  loading: state.configLoading,
                  saving: state.configSaving,
                  dirty: state.configFormDirty,
                },
                channels: {
                  snapshot: state.channelsSnapshot,
                  loading: state.channelsLoading,
                  error: state.channelsError,
                  lastSuccess: state.channelsLastSuccess,
                },
                cron: {
                  status: state.cronStatus,
                  jobs: state.cronJobs,
                  loading: state.cronLoading,
                  error: state.cronError,
                },
                agentFiles: {
                  list: state.agentFilesList,
                  loading: state.agentFilesLoading,
                  error: state.agentFilesError,
                  active: state.agentFileActive,
                  contents: state.agentFileContents,
                  drafts: state.agentFileDrafts,
                  saving: state.agentFileSaving,
                },
                agentIdentityLoading: state.agentIdentityLoading,
                agentIdentityError: state.agentIdentityError,
                agentIdentityById: state.agentIdentityById,
                agentSkills: {
                  report: state.agentSkillsReport,
                  loading: state.agentSkillsLoading,
                  error: state.agentSkillsError,
                  agentId: state.agentSkillsAgentId,
                  filter: state.skillsFilter,
                },
                toolsCatalog: {
                  loading: state.toolsCatalogLoading,
                  error: state.toolsCatalogError,
                  result: state.toolsCatalogResult,
                },
                toolsEffective: {
                  loading: state.toolsEffectiveLoading,
                  error: state.toolsEffectiveError,
                  result: state.toolsEffectiveResult,
                },
                runtimeSessionKey: state.sessionKey,
                runtimeSessionMatchesSelectedAgent: toolsPanelUsesActiveSession,
                modelCatalog: state.chatModelCatalog ?? [],
                onRefresh: async () => {
                  await loadAgents(state);
                  const agentIds = state.agentsList?.agents?.map((entry) => entry.id) ?? [];
                  if (agentIds.length > 0) {
                    void loadAgentIdentities(state, agentIds);
                  }
                  const refreshedAgentId =
                    state.agentsSelectedId ??
                    state.agentsList?.defaultId ??
                    state.agentsList?.agents?.[0]?.id ??
                    null;
                  if (state.agentsPanel === "files" && refreshedAgentId) {
                    void loadAgentFiles(state, refreshedAgentId);
                  }
                  if (state.agentsPanel === "skills" && refreshedAgentId) {
                    void loadAgentSkills(state, refreshedAgentId);
                  }
                  if (state.agentsPanel === "tools" && refreshedAgentId) {
                    void loadToolsCatalog(state, refreshedAgentId);
                    if (refreshedAgentId === resolveAgentIdFromSessionKey(state.sessionKey)) {
                      void loadToolsEffective(state, {
                        agentId: refreshedAgentId,
                        sessionKey: state.sessionKey,
                      });
                    }
                  }
                  if (state.agentsPanel === "channels") {
                    void loadChannels(state, false);
                  }
                  if (state.agentsPanel === "cron") {
                    void state.loadCron();
                  }
                },
                onSelectAgent: (agentId) => {
                  if (state.agentsSelectedId === agentId) {
                    return;
                  }
                  state.agentsSelectedId = agentId;
                  state.agentFilesList = null;
                  state.agentFilesError = null;
                  state.agentFilesLoading = false;
                  state.agentFileActive = null;
                  state.agentFileContents = {};
                  state.agentFileDrafts = {};
                  state.agentSkillsReport = null;
                  state.agentSkillsError = null;
                  state.agentSkillsAgentId = null;
                  state.toolsCatalogResult = null;
                  state.toolsCatalogError = null;
                  state.toolsCatalogLoading = false;
                  state.toolsEffectiveResult = null;
                  state.toolsEffectiveResultKey = null;
                  state.toolsEffectiveError = null;
                  state.toolsEffectiveLoading = false;
                  state.toolsEffectiveLoadingKey = null;
                  void loadAgentIdentity(state, agentId);
                  if (state.agentsPanel === "files") {
                    void loadAgentFiles(state, agentId);
                  }
                  if (state.agentsPanel === "tools") {
                    void loadToolsCatalog(state, agentId);
                    if (agentId === resolveAgentIdFromSessionKey(state.sessionKey)) {
                      void loadToolsEffective(state, {
                        agentId,
                        sessionKey: state.sessionKey,
                      });
                    }
                  }
                  if (state.agentsPanel === "skills") {
                    void loadAgentSkills(state, agentId);
                  }
                },
                onSelectPanel: (panel) => {
                  state.agentsPanel = panel;
                  if (panel === "files" && resolvedAgentId) {
                    if (state.agentFilesList?.agentId !== resolvedAgentId) {
                      state.agentFilesList = null;
                      state.agentFilesError = null;
                      state.agentFileActive = null;
                      state.agentFileContents = {};
                      state.agentFileDrafts = {};
                      void loadAgentFiles(state, resolvedAgentId);
                    }
                  }
                  if (panel === "skills") {
                    if (resolvedAgentId) {
                      void loadAgentSkills(state, resolvedAgentId);
                    }
                  }
                  if (panel === "tools" && resolvedAgentId) {
                    if (
                      state.toolsCatalogResult?.agentId !== resolvedAgentId ||
                      state.toolsCatalogError
                    ) {
                      void loadToolsCatalog(state, resolvedAgentId);
                    }
                    if (resolvedAgentId === resolveAgentIdFromSessionKey(state.sessionKey)) {
                      const toolsRequestKey = buildToolsEffectiveRequestKey(state, {
                        agentId: resolvedAgentId,
                        sessionKey: state.sessionKey,
                      });
                      if (
                        state.toolsEffectiveResultKey !== toolsRequestKey ||
                        state.toolsEffectiveError
                      ) {
                        void loadToolsEffective(state, {
                          agentId: resolvedAgentId,
                          sessionKey: state.sessionKey,
                        });
                      }
                    } else {
                      state.toolsEffectiveResult = null;
                      state.toolsEffectiveResultKey = null;
                      state.toolsEffectiveError = null;
                      state.toolsEffectiveLoading = false;
                      state.toolsEffectiveLoadingKey = null;
                    }
                  }
                  if (panel === "channels") {
                    void loadChannels(state, false);
                  }
                  if (panel === "cron") {
                    void state.loadCron();
                  }
                },
                onLoadFiles: (agentId) => loadAgentFiles(state, agentId),
                onSelectFile: (name) => {
                  state.agentFileActive = name;
                  if (!resolvedAgentId) {
                    return;
                  }
                  void loadAgentFileContent(state, resolvedAgentId, name);
                },
                onFileDraftChange: (name, content) => {
                  state.agentFileDrafts = { ...state.agentFileDrafts, [name]: content };
                },
                onFileReset: (name) => {
                  const base = state.agentFileContents[name] ?? "";
                  state.agentFileDrafts = { ...state.agentFileDrafts, [name]: base };
                },
                onFileSave: (name) => {
                  if (!resolvedAgentId) {
                    return;
                  }
                  const content =
                    state.agentFileDrafts[name] ?? state.agentFileContents[name] ?? "";
                  void saveAgentFile(state, resolvedAgentId, name, content);
                },
                onToolsProfileChange: (agentId, profile, clearAllow) => {
                  const index =
                    profile || clearAllow ? ensureAgentIndex(agentId) : findAgentIndex(agentId);
                  if (index < 0) {
                    return;
                  }
                  const basePath = ["agents", "list", index, "tools"];
                  if (profile) {
                    updateConfigFormValue(state, [...basePath, "profile"], profile);
                  } else {
                    removeConfigFormValue(state, [...basePath, "profile"]);
                  }
                  if (clearAllow) {
                    removeConfigFormValue(state, [...basePath, "allow"]);
                  }
                },
                onToolsOverridesChange: (agentId, alsoAllow, deny) => {
                  const index =
                    alsoAllow.length > 0 || deny.length > 0
                      ? ensureAgentIndex(agentId)
                      : findAgentIndex(agentId);
                  if (index < 0) {
                    return;
                  }
                  const basePath = ["agents", "list", index, "tools"];
                  if (alsoAllow.length > 0) {
                    updateConfigFormValue(state, [...basePath, "alsoAllow"], alsoAllow);
                  } else {
                    removeConfigFormValue(state, [...basePath, "alsoAllow"]);
                  }
                  if (deny.length > 0) {
                    updateConfigFormValue(state, [...basePath, "deny"], deny);
                  } else {
                    removeConfigFormValue(state, [...basePath, "deny"]);
                  }
                },
                onConfigReload: () => loadConfig(state),
                onConfigSave: () => saveAgentsConfig(state),
                onChannelsRefresh: () => loadChannels(state, false),
                onCronRefresh: () => state.loadCron(),
                onCronRunNow: (jobId) => {
                  const job = state.cronJobs.find((entry) => entry.id === jobId);
                  if (!job) {
                    return;
                  }
                  void runCronJob(state, job, "force");
                },
                onSkillsFilterChange: (next) => (state.skillsFilter = next),
                onSkillsRefresh: () => {
                  if (resolvedAgentId) {
                    void loadAgentSkills(state, resolvedAgentId);
                  }
                },
                onAgentSkillToggle: (agentId, skillName, enabled) => {
                  const index = ensureAgentIndex(agentId);
                  if (index < 0) {
                    return;
                  }
                  const list = (getCurrentConfigValue() as { agents?: { list?: unknown[] } } | null)
                    ?.agents?.list;
                  const entry = Array.isArray(list)
                    ? (list[index] as { skills?: unknown })
                    : undefined;
                  const normalizedSkill = skillName.trim();
                  if (!normalizedSkill) {
                    return;
                  }
                  const allSkills =
                    state.agentSkillsReport?.skills?.map((skill) => skill.name).filter(Boolean) ??
                    [];
                  const existing = Array.isArray(entry?.skills)
                    ? entry.skills.map((name) => String(name).trim()).filter(Boolean)
                    : undefined;
                  const base = existing ?? allSkills;
                  const next = new Set(base);
                  if (enabled) {
                    next.add(normalizedSkill);
                  } else {
                    next.delete(normalizedSkill);
                  }
                  updateConfigFormValue(state, ["agents", "list", index, "skills"], [...next]);
                },
                onAgentSkillsClear: (agentId) => {
                  const index = findAgentIndex(agentId);
                  if (index < 0) {
                    return;
                  }
                  removeConfigFormValue(state, ["agents", "list", index, "skills"]);
                },
                onAgentSkillsDisableAll: (agentId) => {
                  const index = ensureAgentIndex(agentId);
                  if (index < 0) {
                    return;
                  }
                  updateConfigFormValue(state, ["agents", "list", index, "skills"], []);
                },
                onModelChange: (agentId, modelId) => {
                  const index = modelId ? ensureAgentIndex(agentId) : findAgentIndex(agentId);
                  if (index < 0) {
                    return;
                  }
                  const list = (getCurrentConfigValue() as { agents?: { list?: unknown[] } } | null)
                    ?.agents?.list;
                  const basePath = ["agents", "list", index, "model"];
                  if (!modelId) {
                    removeConfigFormValue(state, basePath);
                  } else {
                    const entry = Array.isArray(list)
                      ? (list[index] as { model?: unknown })
                      : undefined;
                    const existing = entry?.model;
                    if (existing && typeof existing === "object" && !Array.isArray(existing)) {
                      const fallbacks = (existing as { fallbacks?: unknown }).fallbacks;
                      const next = {
                        primary: modelId,
                        ...(Array.isArray(fallbacks) ? { fallbacks } : {}),
                      };
                      updateConfigFormValue(state, basePath, next);
                    } else {
                      updateConfigFormValue(state, basePath, modelId);
                    }
                  }
                  void refreshVisibleToolsEffectiveForCurrentSession(state);
                },
                onModelFallbacksChange: (agentId, fallbacks) => {
                  const normalized = fallbacks.map((name) => name.trim()).filter(Boolean);
                  const currentConfig = getCurrentConfigValue();
                  const resolvedConfig = resolveAgentConfig(currentConfig, agentId);
                  const effectivePrimary =
                    resolveModelPrimary(resolvedConfig.entry?.model) ??
                    resolveModelPrimary(resolvedConfig.defaults?.model);
                  const effectiveFallbacks = resolveEffectiveModelFallbacks(
                    resolvedConfig.entry?.model,
                    resolvedConfig.defaults?.model,
                  );
                  const index =
                    normalized.length > 0
                      ? effectivePrimary
                        ? ensureAgentIndex(agentId)
                        : -1
                      : (effectiveFallbacks?.length ?? 0) > 0 || findAgentIndex(agentId) >= 0
                        ? ensureAgentIndex(agentId)
                        : -1;
                  if (index < 0) {
                    return;
                  }
                  const list = (getCurrentConfigValue() as { agents?: { list?: unknown[] } } | null)
                    ?.agents?.list;
                  const basePath = ["agents", "list", index, "model"];
                  const entry = Array.isArray(list)
                    ? (list[index] as { model?: unknown })
                    : undefined;
                  const existing = entry?.model;
                  const resolvePrimary = () => {
                    if (typeof existing === "string") {
                      return existing.trim() || null;
                    }
                    if (existing && typeof existing === "object" && !Array.isArray(existing)) {
                      const primary = (existing as { primary?: unknown }).primary;
                      if (typeof primary === "string") {
                        const trimmed = primary.trim();
                        return trimmed || null;
                      }
                    }
                    return null;
                  };
                  const primary = resolvePrimary() ?? effectivePrimary;
                  if (normalized.length === 0) {
                    if (primary) {
                      updateConfigFormValue(state, basePath, primary);
                    } else {
                      removeConfigFormValue(state, basePath);
                    }
                    return;
                  }
                  if (!primary) {
                    return;
                  }
                  updateConfigFormValue(state, basePath, { primary, fallbacks: normalized });
                },
                onSetDefault: (agentId) => {
                  if (!configValue) {
                    return;
                  }
                  updateConfigFormValue(state, ["agents", "defaultId"], agentId);
                },
              }),
            )
          : nothing}
        ${state.tab === "skills"
          ? lazyRender(lazySkills, (m) =>
              m.renderSkills({
                connected: state.connected,
                loading: state.skillsLoading,
                report: state.skillsReport,
                error: state.skillsError,
                filter: state.skillsFilter,
                statusFilter: state.skillsStatusFilter,
                edits: state.skillEdits,
                messages: state.skillMessages,
                busyKey: state.skillsBusyKey,
                detailKey: state.skillsDetailKey,
                clawhubQuery: state.clawhubSearchQuery,
                clawhubResults: state.clawhubSearchResults,
                clawhubSearchLoading: state.clawhubSearchLoading,
                clawhubSearchError: state.clawhubSearchError,
                clawhubDetail: state.clawhubDetail,
                clawhubDetailSlug: state.clawhubDetailSlug,
                clawhubDetailLoading: state.clawhubDetailLoading,
                clawhubDetailError: state.clawhubDetailError,
                clawhubInstallSlug: state.clawhubInstallSlug,
                clawhubInstallMessage: state.clawhubInstallMessage,
                onFilterChange: (next) => (state.skillsFilter = next),
                onStatusFilterChange: (next) => (state.skillsStatusFilter = next),
                onRefresh: () => loadSkills(state, { clearMessages: true }),
                onToggle: (key, enabled) => updateSkillEnabled(state, key, enabled),
                onEdit: (key, value) => updateSkillEdit(state, key, value),
                onSaveKey: (key) => saveSkillApiKey(state, key),
                onInstall: (skillKey, name, installId) =>
                  installSkill(state, skillKey, name, installId),
                onDetailOpen: (key) => (state.skillsDetailKey = key),
                onDetailClose: () => (state.skillsDetailKey = null),
                onClawHubQueryChange: (query) => {
                  setClawHubSearchQuery(state, query);
                  if (clawhubSearchTimer) {
                    clearTimeout(clawhubSearchTimer);
                  }
                  clawhubSearchTimer = setTimeout(() => searchClawHub(state, query), 300);
                },
                onClawHubDetailOpen: (slug) => loadClawHubDetail(state, slug),
                onClawHubDetailClose: () => closeClawHubDetail(state),
                onClawHubInstall: (slug) => installFromClawHub(state, slug),
              }),
            )
          : nothing}
        ${state.tab === "nodes"
          ? lazyRender(lazyNodes, (m) =>
              m.renderNodes({
                loading: state.nodesLoading,
                nodes: state.nodes,
                devicesLoading: state.devicesLoading,
                devicesError: state.devicesError,
                devicesList: state.devicesList,
                configForm:
                  state.configForm ??
                  (state.configSnapshot?.config as Record<string, unknown> | null),
                configLoading: state.configLoading,
                configSaving: state.configSaving,
                configDirty: state.configFormDirty,
                configFormMode: state.configFormMode,
                execApprovalsLoading: state.execApprovalsLoading,
                execApprovalsSaving: state.execApprovalsSaving,
                execApprovalsDirty: state.execApprovalsDirty,
                execApprovalsSnapshot: state.execApprovalsSnapshot,
                execApprovalsForm: state.execApprovalsForm,
                execApprovalsSelectedAgent: state.execApprovalsSelectedAgent,
                execApprovalsTarget: state.execApprovalsTarget,
                execApprovalsTargetNodeId: state.execApprovalsTargetNodeId,
                onRefresh: () => loadNodes(state),
                onDevicesRefresh: () => loadDevices(state),
                onDeviceApprove: (requestId) => approveDevicePairing(state, requestId),
                onDeviceReject: (requestId) => rejectDevicePairing(state, requestId),
                onDeviceRotate: (deviceId, role, scopes) =>
                  rotateDeviceToken(state, { deviceId, role, scopes }),
                onDeviceRevoke: (deviceId, role) => revokeDeviceToken(state, { deviceId, role }),
                onLoadConfig: () => loadConfig(state),
                onLoadExecApprovals: () => {
                  const target =
                    state.execApprovalsTarget === "node" && state.execApprovalsTargetNodeId
                      ? { kind: "node" as const, nodeId: state.execApprovalsTargetNodeId }
                      : { kind: "gateway" as const };
                  return loadExecApprovals(state, target);
                },
                onBindDefault: (nodeId) => {
                  if (nodeId) {
                    updateConfigFormValue(state, ["tools", "exec", "node"], nodeId);
                  } else {
                    removeConfigFormValue(state, ["tools", "exec", "node"]);
                  }
                },
                onBindAgent: (agentIndex, nodeId) => {
                  const basePath = ["agents", "list", agentIndex, "tools", "exec", "node"];
                  if (nodeId) {
                    updateConfigFormValue(state, basePath, nodeId);
                  } else {
                    removeConfigFormValue(state, basePath);
                  }
                },
                onSaveBindings: () => saveConfig(state),
                onExecApprovalsTargetChange: (kind, nodeId) => {
                  state.execApprovalsTarget = kind;
                  state.execApprovalsTargetNodeId = nodeId;
                  state.execApprovalsSnapshot = null;
                  state.execApprovalsForm = null;
                  state.execApprovalsDirty = false;
                  state.execApprovalsSelectedAgent = null;
                },
                onExecApprovalsSelectAgent: (agentId) => {
                  state.execApprovalsSelectedAgent = agentId;
                },
                onExecApprovalsPatch: (path, value) =>
                  updateExecApprovalsFormValue(state, path, value),
                onExecApprovalsRemove: (path) => removeExecApprovalsFormValue(state, path),
                onSaveExecApprovals: () => {
                  const target =
                    state.execApprovalsTarget === "node" && state.execApprovalsTargetNodeId
                      ? { kind: "node" as const, nodeId: state.execApprovalsTargetNodeId }
                      : { kind: "gateway" as const };
                  return saveExecApprovals(state, target);
                },
              }),
            )
          : nothing}
        ${state.tab === "chat"
          ? renderChat({
              sessionKey: state.sessionKey,
              onSessionKeyChange: (next) => {
                state.sessionKey = next;
                state.chatMessage = "";
                state.chatAttachments = [];
                state.chatStream = null;
                state.chatStreamStartedAt = null;
                state.chatRunId = null;
                state.chatQueue = [];
                state.resetToolStream();
                state.resetChatScroll();
                state.applySettings({
                  ...state.settings,
                  sessionKey: next,
                  lastActiveSessionKey: next,
                });
                void state.loadAssistantIdentity();
                void loadChatHistory(state);
                void refreshChatAvatar(state);
              },
              thinkingLevel: state.chatThinkingLevel,
              showThinking,
              showToolCalls,
              loading: state.chatLoading,
              sending: state.chatSending,
              compactionStatus: state.compactionStatus,
              fallbackStatus: state.fallbackStatus,
              assistantAvatarUrl: chatAvatarUrl,
              messages: state.chatMessages,
              toolMessages: state.chatToolMessages,
              streamSegments: state.chatStreamSegments,
              stream: state.chatStream,
              streamStartedAt: state.chatStreamStartedAt,
              draft: state.chatMessage,
              queue: state.chatQueue,
              connected: state.connected,
              canSend: state.connected,
              disabledReason: chatDisabledReason,
              error: state.lastError,
              sessions: state.sessionsResult,
              focusMode: chatFocus,
              onRefresh: () => {
                state.resetToolStream();
                return Promise.all([loadChatHistory(state), refreshChatAvatar(state)]);
              },
              onToggleFocusMode: () => {
                if (state.onboarding) {
                  return;
                }
                state.applySettings({
                  ...state.settings,
                  chatFocusMode: !state.settings.chatFocusMode,
                });
              },
              onChatScroll: (event) => state.handleChatScroll(event),
              getDraft: () => state.chatMessage,
              onDraftChange: (next) => (state.chatMessage = next),
              onRequestUpdate: requestHostUpdate,
              attachments: state.chatAttachments,
              onAttachmentsChange: (next) => (state.chatAttachments = next),
              onSend: () => state.handleSendChat(),
              canAbort: Boolean(state.chatRunId),
              onAbort: () => void state.handleAbortChat(),
              onQueueRemove: (id) => state.removeQueuedMessage(id),
              onNewSession: async () => {
                const created = await createSession(state, {
                  agentId: resolvedAgentId ?? "main",
                });
                if (!created?.key) {
                  state.lastError = state.sessionsError ?? "Failed to create a new session.";
                  return;
                }
                state.lastError = null;
                switchChatSession(state, created.key);
              },
              onClearHistory: async () => {
                if (!state.client || !state.connected) {
                  return;
                }
                try {
                  await state.client.request("sessions.reset", { key: state.sessionKey });
                  state.chatMessages = [];
                  state.chatStream = null;
                  state.chatRunId = null;
                  await loadChatHistory(state);
                } catch (err) {
                  state.lastError = String(err);
                }
              },
              agentsList: state.agentsList,
              currentAgentId: resolvedAgentId ?? "main",
              onAgentChange: (agentId: string) => {
                state.sessionKey = buildAgentMainSessionKey({ agentId });
                state.chatMessages = [];
                state.chatStream = null;
                state.chatRunId = null;
                state.applySettings({
                  ...state.settings,
                  sessionKey: state.sessionKey,
                  lastActiveSessionKey: state.sessionKey,
                });
                void loadChatHistory(state);
                void state.loadAssistantIdentity();
              },
              onNavigateToAgent: () => {
                state.agentsSelectedId = resolvedAgentId;
                state.setTab("agents" as import("./navigation.ts").Tab);
              },
              onSessionSelect: (key: string) => {
                switchChatSession(state, key);
              },
              showNewMessages: state.chatNewMessagesBelow && !state.chatManualRefreshInFlight,
              onScrollToBottom: () => state.scrollToBottom(),
              // Sidebar props for tool output viewing
              sidebarOpen: state.sidebarOpen,
              sidebarContent: state.sidebarContent,
              sidebarError: state.sidebarError,
              splitRatio: state.splitRatio,
              onOpenSidebar: (content: string) => state.handleOpenSidebar(content),
              onCloseSidebar: () => state.handleCloseSidebar(),
              onSplitRatioChange: (ratio: number) => state.handleSplitRatioChange(ratio),
              assistantName: state.assistantName,
              assistantAvatar: state.assistantAvatar,
              basePath: state.basePath ?? "",
            })
          : nothing}
        ${state.tab === "config"
          ? renderConfig({
              raw: state.configRaw,
              originalRaw: state.configRawOriginal,
              valid: state.configValid,
              issues: state.configIssues,
              loading: state.configLoading,
              saving: state.configSaving,
              applying: state.configApplying,
              updating: state.updateRunning,
              connected: state.connected,
              schema: state.configSchema,
              schemaLoading: state.configSchemaLoading,
              uiHints: state.configUiHints,
              formMode: state.configFormMode,
              showModeToggle: true,
              formValue: state.configForm,
              originalValue: state.configFormOriginal,
              searchQuery: state.configSearchQuery,
              activeSection:
                state.configActiveSection &&
                (COMMUNICATION_SECTION_KEYS.includes(
                  state.configActiveSection as CommunicationSectionKey,
                ) ||
                  APPEARANCE_SECTION_KEYS.includes(
                    state.configActiveSection as AppearanceSectionKey,
                  ) ||
                  AUTOMATION_SECTION_KEYS.includes(
                    state.configActiveSection as AutomationSectionKey,
                  ) ||
                  INFRASTRUCTURE_SECTION_KEYS.includes(
                    state.configActiveSection as InfrastructureSectionKey,
                  ) ||
                  AI_AGENTS_SECTION_KEYS.includes(state.configActiveSection as AiAgentsSectionKey))
                  ? null
                  : state.configActiveSection,
              activeSubsection:
                state.configActiveSection &&
                (COMMUNICATION_SECTION_KEYS.includes(
                  state.configActiveSection as CommunicationSectionKey,
                ) ||
                  APPEARANCE_SECTION_KEYS.includes(
                    state.configActiveSection as AppearanceSectionKey,
                  ) ||
                  AUTOMATION_SECTION_KEYS.includes(
                    state.configActiveSection as AutomationSectionKey,
                  ) ||
                  INFRASTRUCTURE_SECTION_KEYS.includes(
                    state.configActiveSection as InfrastructureSectionKey,
                  ) ||
                  AI_AGENTS_SECTION_KEYS.includes(state.configActiveSection as AiAgentsSectionKey))
                  ? null
                  : state.configActiveSubsection,
              onRawChange: (next) => {
                state.configRaw = next;
              },
              onRequestUpdate: requestHostUpdate,
              onFormModeChange: (mode) => (state.configFormMode = mode),
              onFormPatch: (path, value) => updateConfigFormValue(state, path, value),
              onSearchChange: (query) => (state.configSearchQuery = query),
              onSectionChange: (section) => {
                state.configActiveSection = section;
                state.configActiveSubsection = null;
              },
              onSubsectionChange: (section) => (state.configActiveSubsection = section),
              onReload: () => loadConfig(state),
              onSave: () => saveConfig(state),
              onApply: () => applyConfig(state),
              onUpdate: () => runUpdate(state),
              onOpenFile: () => openConfigFile(state),
              version: state.hello?.server?.version ?? "",
              theme: state.theme,
              themeMode: state.themeMode,
              setTheme: (t, ctx) => state.setTheme(t, ctx),
              setThemeMode: (m, ctx) => state.setThemeMode(m, ctx),
              borderRadius: state.settings.borderRadius,
              setBorderRadius: (v) => state.setBorderRadius(v),
              gatewayUrl: state.settings.gatewayUrl,
              assistantName: state.assistantName,
              configPath: state.configSnapshot?.path ?? null,
              rawAvailable: typeof state.configSnapshot?.raw === "string",
              excludeSections: [
                ...COMMUNICATION_SECTION_KEYS,
                ...AUTOMATION_SECTION_KEYS,
                ...INFRASTRUCTURE_SECTION_KEYS,
                ...AI_AGENTS_SECTION_KEYS,
                "ui",
                "wizard",
              ],
              includeVirtualSections: false,
            })
          : nothing}
        ${state.tab === "communications"
          ? renderConfig({
              raw: state.configRaw,
              originalRaw: state.configRawOriginal,
              valid: state.configValid,
              issues: state.configIssues,
              loading: state.configLoading,
              saving: state.configSaving,
              applying: state.configApplying,
              updating: state.updateRunning,
              connected: state.connected,
              schema: state.configSchema,
              schemaLoading: state.configSchemaLoading,
              uiHints: state.configUiHints,
              formMode: state.communicationsFormMode,
              formValue: state.configForm,
              originalValue: state.configFormOriginal,
              searchQuery: state.communicationsSearchQuery,
              activeSection:
                state.communicationsActiveSection &&
                !COMMUNICATION_SECTION_KEYS.includes(
                  state.communicationsActiveSection as CommunicationSectionKey,
                )
                  ? null
                  : state.communicationsActiveSection,
              activeSubsection:
                state.communicationsActiveSection &&
                !COMMUNICATION_SECTION_KEYS.includes(
                  state.communicationsActiveSection as CommunicationSectionKey,
                )
                  ? null
                  : state.communicationsActiveSubsection,
              onRawChange: (next) => {
                state.configRaw = next;
              },
              onRequestUpdate: requestHostUpdate,
              onFormModeChange: (mode) => (state.communicationsFormMode = mode),
              onFormPatch: (path, value) => updateConfigFormValue(state, path, value),
              onSearchChange: (query) => (state.communicationsSearchQuery = query),
              onSectionChange: (section) => {
                state.communicationsActiveSection = section;
                state.communicationsActiveSubsection = null;
              },
              onSubsectionChange: (section) => (state.communicationsActiveSubsection = section),
              onReload: () => loadConfig(state),
              onSave: () => saveConfig(state),
              onApply: () => applyConfig(state),
              onUpdate: () => runUpdate(state),
              onOpenFile: () => openConfigFile(state),
              version: state.hello?.server?.version ?? "",
              theme: state.theme,
              themeMode: state.themeMode,
              setTheme: (t, ctx) => state.setTheme(t, ctx),
              setThemeMode: (m, ctx) => state.setThemeMode(m, ctx),
              borderRadius: state.settings.borderRadius,
              setBorderRadius: (v) => state.setBorderRadius(v),
              gatewayUrl: state.settings.gatewayUrl,
              assistantName: state.assistantName,
              configPath: state.configSnapshot?.path ?? null,
              rawAvailable: typeof state.configSnapshot?.raw === "string",
              navRootLabel: "Communication",
              includeSections: [...COMMUNICATION_SECTION_KEYS],
              includeVirtualSections: false,
            })
          : nothing}
        ${state.tab === "appearance"
          ? renderConfig({
              raw: state.configRaw,
              originalRaw: state.configRawOriginal,
              valid: state.configValid,
              issues: state.configIssues,
              loading: state.configLoading,
              saving: state.configSaving,
              applying: state.configApplying,
              updating: state.updateRunning,
              connected: state.connected,
              schema: state.configSchema,
              schemaLoading: state.configSchemaLoading,
              uiHints: state.configUiHints,
              formMode: state.appearanceFormMode,
              formValue: state.configForm,
              originalValue: state.configFormOriginal,
              searchQuery: state.appearanceSearchQuery,
              activeSection:
                state.appearanceActiveSection &&
                !APPEARANCE_SECTION_KEYS.includes(
                  state.appearanceActiveSection as AppearanceSectionKey,
                )
                  ? null
                  : state.appearanceActiveSection,
              activeSubsection:
                state.appearanceActiveSection &&
                !APPEARANCE_SECTION_KEYS.includes(
                  state.appearanceActiveSection as AppearanceSectionKey,
                )
                  ? null
                  : state.appearanceActiveSubsection,
              onRawChange: (next) => {
                state.configRaw = next;
              },
              onRequestUpdate: requestHostUpdate,
              onFormModeChange: (mode) => (state.appearanceFormMode = mode),
              onFormPatch: (path, value) => updateConfigFormValue(state, path, value),
              onSearchChange: (query) => (state.appearanceSearchQuery = query),
              onSectionChange: (section) => {
                state.appearanceActiveSection = section;
                state.appearanceActiveSubsection = null;
              },
              onSubsectionChange: (section) => (state.appearanceActiveSubsection = section),
              onReload: () => loadConfig(state),
              onSave: () => saveConfig(state),
              onApply: () => applyConfig(state),
              onUpdate: () => runUpdate(state),
              onOpenFile: () => openConfigFile(state),
              version: state.hello?.server?.version ?? "",
              theme: state.theme,
              themeMode: state.themeMode,
              setTheme: (t, ctx) => state.setTheme(t, ctx),
              setThemeMode: (m, ctx) => state.setThemeMode(m, ctx),
              borderRadius: state.settings.borderRadius,
              setBorderRadius: (v) => state.setBorderRadius(v),
              gatewayUrl: state.settings.gatewayUrl,
              assistantName: state.assistantName,
              configPath: state.configSnapshot?.path ?? null,
              rawAvailable: typeof state.configSnapshot?.raw === "string",
              navRootLabel: t("tabs.appearance"),
              includeSections: [...APPEARANCE_SECTION_KEYS],
              includeVirtualSections: true,
            })
          : nothing}
        ${state.tab === "automation"
          ? renderConfig({
              raw: state.configRaw,
              originalRaw: state.configRawOriginal,
              valid: state.configValid,
              issues: state.configIssues,
              loading: state.configLoading,
              saving: state.configSaving,
              applying: state.configApplying,
              updating: state.updateRunning,
              connected: state.connected,
              schema: state.configSchema,
              schemaLoading: state.configSchemaLoading,
              uiHints: state.configUiHints,
              formMode: state.automationFormMode,
              formValue: state.configForm,
              originalValue: state.configFormOriginal,
              searchQuery: state.automationSearchQuery,
              activeSection:
                state.automationActiveSection &&
                !AUTOMATION_SECTION_KEYS.includes(
                  state.automationActiveSection as AutomationSectionKey,
                )
                  ? null
                  : state.automationActiveSection,
              activeSubsection:
                state.automationActiveSection &&
                !AUTOMATION_SECTION_KEYS.includes(
                  state.automationActiveSection as AutomationSectionKey,
                )
                  ? null
                  : state.automationActiveSubsection,
              onRawChange: (next) => {
                state.configRaw = next;
              },
              onRequestUpdate: requestHostUpdate,
              onFormModeChange: (mode) => (state.automationFormMode = mode),
              onFormPatch: (path, value) => updateConfigFormValue(state, path, value),
              onSearchChange: (query) => (state.automationSearchQuery = query),
              onSectionChange: (section) => {
                state.automationActiveSection = section;
                state.automationActiveSubsection = null;
              },
              onSubsectionChange: (section) => (state.automationActiveSubsection = section),
              onReload: () => loadConfig(state),
              onSave: () => saveConfig(state),
              onApply: () => applyConfig(state),
              onUpdate: () => runUpdate(state),
              onOpenFile: () => openConfigFile(state),
              version: state.hello?.server?.version ?? "",
              theme: state.theme,
              themeMode: state.themeMode,
              setTheme: (t, ctx) => state.setTheme(t, ctx),
              setThemeMode: (m, ctx) => state.setThemeMode(m, ctx),
              borderRadius: state.settings.borderRadius,
              setBorderRadius: (v) => state.setBorderRadius(v),
              gatewayUrl: state.settings.gatewayUrl,
              assistantName: state.assistantName,
              configPath: state.configSnapshot?.path ?? null,
              rawAvailable: typeof state.configSnapshot?.raw === "string",
              navRootLabel: "Automation",
              includeSections: [...AUTOMATION_SECTION_KEYS],
              includeVirtualSections: false,
            })
          : nothing}
        ${state.tab === "infrastructure"
          ? renderConfig({
              raw: state.configRaw,
              originalRaw: state.configRawOriginal,
              valid: state.configValid,
              issues: state.configIssues,
              loading: state.configLoading,
              saving: state.configSaving,
              applying: state.configApplying,
              updating: state.updateRunning,
              connected: state.connected,
              schema: state.configSchema,
              schemaLoading: state.configSchemaLoading,
              uiHints: state.configUiHints,
              formMode: state.infrastructureFormMode,
              formValue: state.configForm,
              originalValue: state.configFormOriginal,
              searchQuery: state.infrastructureSearchQuery,
              activeSection:
                state.infrastructureActiveSection &&
                !INFRASTRUCTURE_SECTION_KEYS.includes(
                  state.infrastructureActiveSection as InfrastructureSectionKey,
                )
                  ? null
                  : state.infrastructureActiveSection,
              activeSubsection:
                state.infrastructureActiveSection &&
                !INFRASTRUCTURE_SECTION_KEYS.includes(
                  state.infrastructureActiveSection as InfrastructureSectionKey,
                )
                  ? null
                  : state.infrastructureActiveSubsection,
              onRawChange: (next) => {
                state.configRaw = next;
              },
              onRequestUpdate: requestHostUpdate,
              onFormModeChange: (mode) => (state.infrastructureFormMode = mode),
              onFormPatch: (path, value) => updateConfigFormValue(state, path, value),
              onSearchChange: (query) => (state.infrastructureSearchQuery = query),
              onSectionChange: (section) => {
                state.infrastructureActiveSection = section;
                state.infrastructureActiveSubsection = null;
              },
              onSubsectionChange: (section) => (state.infrastructureActiveSubsection = section),
              onReload: () => loadConfig(state),
              onSave: () => saveConfig(state),
              onApply: () => applyConfig(state),
              onUpdate: () => runUpdate(state),
              onOpenFile: () => openConfigFile(state),
              version: state.hello?.server?.version ?? "",
              theme: state.theme,
              themeMode: state.themeMode,
              setTheme: (t, ctx) => state.setTheme(t, ctx),
              setThemeMode: (m, ctx) => state.setThemeMode(m, ctx),
              borderRadius: state.settings.borderRadius,
              setBorderRadius: (v) => state.setBorderRadius(v),
              gatewayUrl: state.settings.gatewayUrl,
              assistantName: state.assistantName,
              configPath: state.configSnapshot?.path ?? null,
              rawAvailable: typeof state.configSnapshot?.raw === "string",
              navRootLabel: "Infrastructure",
              includeSections: [...INFRASTRUCTURE_SECTION_KEYS],
              includeVirtualSections: false,
            })
          : nothing}
        ${state.tab === "aiAgents"
          ? renderConfig({
              raw: state.configRaw,
              originalRaw: state.configRawOriginal,
              valid: state.configValid,
              issues: state.configIssues,
              loading: state.configLoading,
              saving: state.configSaving,
              applying: state.configApplying,
              updating: state.updateRunning,
              connected: state.connected,
              schema: state.configSchema,
              schemaLoading: state.configSchemaLoading,
              uiHints: state.configUiHints,
              formMode: state.aiAgentsFormMode,
              formValue: state.configForm,
              originalValue: state.configFormOriginal,
              searchQuery: state.aiAgentsSearchQuery,
              activeSection:
                state.aiAgentsActiveSection &&
                !AI_AGENTS_SECTION_KEYS.includes(state.aiAgentsActiveSection as AiAgentsSectionKey)
                  ? null
                  : state.aiAgentsActiveSection,
              activeSubsection:
                state.aiAgentsActiveSection &&
                !AI_AGENTS_SECTION_KEYS.includes(state.aiAgentsActiveSection as AiAgentsSectionKey)
                  ? null
                  : state.aiAgentsActiveSubsection,
              onRawChange: (next) => {
                state.configRaw = next;
              },
              onRequestUpdate: requestHostUpdate,
              onFormModeChange: (mode) => (state.aiAgentsFormMode = mode),
              onFormPatch: (path, value) => updateConfigFormValue(state, path, value),
              onSearchChange: (query) => (state.aiAgentsSearchQuery = query),
              onSectionChange: (section) => {
                state.aiAgentsActiveSection = section;
                state.aiAgentsActiveSubsection = null;
              },
              onSubsectionChange: (section) => (state.aiAgentsActiveSubsection = section),
              onReload: () => loadConfig(state),
              onSave: () => saveConfig(state),
              onApply: () => applyConfig(state),
              onUpdate: () => runUpdate(state),
              onOpenFile: () => openConfigFile(state),
              version: state.hello?.server?.version ?? "",
              theme: state.theme,
              themeMode: state.themeMode,
              setTheme: (t, ctx) => state.setTheme(t, ctx),
              setThemeMode: (m, ctx) => state.setThemeMode(m, ctx),
              borderRadius: state.settings.borderRadius,
              setBorderRadius: (v) => state.setBorderRadius(v),
              gatewayUrl: state.settings.gatewayUrl,
              assistantName: state.assistantName,
              configPath: state.configSnapshot?.path ?? null,
              rawAvailable: typeof state.configSnapshot?.raw === "string",
              navRootLabel: "AI & Agents",
              includeSections: [...AI_AGENTS_SECTION_KEYS],
              includeVirtualSections: false,
            })
          : nothing}
        ${state.tab === "debug"
          ? lazyRender(lazyDebug, (m) =>
              m.renderDebug({
                loading: state.debugLoading,
                status: state.debugStatus,
                health: state.debugHealth,
                models: state.debugModels,
                heartbeat: state.debugHeartbeat,
                eventLog: state.eventLog,
                methods: (state.hello?.features?.methods ?? []).toSorted(),
                callMethod: state.debugCallMethod,
                callParams: state.debugCallParams,
                callResult: state.debugCallResult,
                callError: state.debugCallError,
                onCallMethodChange: (next) => (state.debugCallMethod = next),
                onCallParamsChange: (next) => (state.debugCallParams = next),
                onRefresh: () => loadDebug(state),
                onCall: () => callDebugMethod(state),
              }),
            )
          : nothing}
        ${state.tab === "logs"
          ? lazyRender(lazyLogs, (m) =>
              m.renderLogs({
                loading: state.logsLoading,
                error: state.logsError,
                file: state.logsFile,
                entries: state.logsEntries,
                filterText: state.logsFilterText,
                levelFilters: state.logsLevelFilters,
                autoFollow: state.logsAutoFollow,
                truncated: state.logsTruncated,
                onFilterTextChange: (next) => (state.logsFilterText = next),
                onLevelToggle: (level, enabled) => {
                  state.logsLevelFilters = { ...state.logsLevelFilters, [level]: enabled };
                },
                onToggleAutoFollow: (next) => (state.logsAutoFollow = next),
                onRefresh: () => loadLogs(state, { reset: true }),
                onExport: (lines, label) => state.exportLogs(lines, label),
                onScroll: (event) => state.handleLogsScroll(event),
              }),
            )
          : nothing}
        ${state.tab === "dreams"
          ? renderDreaming({
              active: dreamingOn,
              shortTermCount: state.dreamingStatus?.shortTermCount ?? 0,
              groundedSignalCount: state.dreamingStatus?.groundedSignalCount ?? 0,
              totalSignalCount: state.dreamingStatus?.totalSignalCount ?? 0,
              promotedCount: state.dreamingStatus?.promotedToday ?? 0,
              phaseSignalCount: state.dreamingStatus?.phaseSignalCount ?? 0,
              shortTermEntries: state.dreamingStatus?.shortTermEntries ?? [],
              signalEntries: state.dreamingStatus?.signalEntries ?? [],
              promotedEntries: state.dreamingStatus?.promotedEntries ?? [],
              dreamingOf: null,
              nextCycle: dreamingNextCycle,
              timezone: state.dreamingStatus?.timezone ?? null,
              statusLoading: state.dreamingStatusLoading,
              statusError: state.dreamingStatusError,
              modeSaving: state.dreamingModeSaving,
              dreamDiaryLoading: state.dreamDiaryLoading,
              dreamDiaryActionLoading: state.dreamDiaryActionLoading,
              dreamDiaryError: state.dreamDiaryError,
              dreamDiaryPath: state.dreamDiaryPath,
              dreamDiaryContent: state.dreamDiaryContent,
              onRefresh: refreshDreaming,
              onRefreshDiary: () => loadDreamDiary(state),
              onBackfillDiary: () => backfillDreamDiary(state),
              onResetDiary: () => resetDreamDiary(state),
              onResetGroundedShortTerm: () => resetGroundedShortTerm(state),
              onToggleEnabled: applyDreamingEnabled,
              onRequestUpdate: requestHostUpdate,
            })
          : nothing}
      </main>
      ${renderExecApprovalPrompt(state)} ${renderGatewayUrlConfirmation(state)} ${nothing}
    </div>
  `;
}
