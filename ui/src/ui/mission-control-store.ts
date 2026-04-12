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

type MissionControlTreeSeed = {
  kind: Extract<MissionControlTreeNode["kind"], "module" | "chat-module" | "acp-module">;
  label: string;
  children?: MissionControlTreeSeed[];
};

const DEFAULT_REPO_TREE_SEEDS: Record<string, MissionControlTreeSeed[]> = {
  "operator-os": [
    { kind: "module", label: "Apps" },
    { kind: "module", label: "Adapters" },
    { kind: "module", label: "Architecture Docs" },
    { kind: "module", label: "Governance" },
  ],
  website: [
    { kind: "module", label: "Prime Property Web" },
    { kind: "module", label: "Lead Intake API" },
    { kind: "module", label: "Event Router" },
    { kind: "module", label: "Ads Ops" },
  ],
  salesforce: [
    { kind: "module", label: "Phone Stack" },
    { kind: "module", label: "Lead Stack" },
    { kind: "module", label: "Email Stack" },
    { kind: "module", label: "SMS" },
    { kind: "module", label: "Ops Performance Hub" },
    { kind: "module", label: "Front-End UI" },
    { kind: "module", label: "Merge Codes" },
  ],
  "lead-crawler": [
    { kind: "module", label: "Normalize Job" },
    { kind: "module", label: "Salesforce Sync" },
    { kind: "module", label: "Skip Trace" },
    { kind: "module", label: "Admin API" },
  ],
  infra: [
    { kind: "module", label: "Azure Portal" },
    { kind: "module", label: "Deployments" },
    { kind: "module", label: "Network & Gateway" },
    { kind: "module", label: "Shared Services" },
  ],
  control: [
    {
      kind: "module",
      label: "Mission Control UI",
      children: [
        { kind: "module", label: "Project Tree" },
        { kind: "module", label: "Chat UX" },
        { kind: "module", label: "Mission Control" },
      ],
    },
    {
      kind: "module",
      label: "Gateway & Auth",
      children: [
        { kind: "module", label: "Pairing & Tokens" },
        { kind: "module", label: "Tailscale Access" },
      ],
    },
    { kind: "module", label: "Session Routing" },
    { kind: "module", label: "Docs & Specs" },
  ],
};

function cloneRegistry(registry: MissionControlWorkspaceRegistry): MissionControlWorkspaceRegistry {
  return JSON.parse(JSON.stringify(registry)) as MissionControlWorkspaceRegistry;
}

function normalizeLookupKey(value: string | undefined): string {
  return value?.trim().toLowerCase() ?? "";
}

function slugifySeedLabel(label: string): string {
  const slug = label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "node";
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

function normalizeMissionControlTreeNodes(
  treeNodes: MissionControlTreeNode[],
): MissionControlTreeNode[] {
  const clonedNodes = treeNodes.map((node) => ({ ...node }));
  const existingIds = new Set(clonedNodes.map((node) => node.id));
  const childrenByParent = new Map<string | null, MissionControlTreeNode[]>();
  for (const node of clonedNodes) {
    const bucket = childrenByParent.get(node.parentId ?? null) ?? [];
    bucket.push(node);
    childrenByParent.set(node.parentId ?? null, bucket);
  }
  const insertedNodes: MissionControlTreeNode[] = [];
  for (const node of clonedNodes) {
    const linkedSessionKey = node.linkedSessionKey?.trim();
    if (!linkedSessionKey || (node.kind !== "repo" && node.kind !== "module")) {
      continue;
    }
    const existingLeaf = (childrenByParent.get(node.id) ?? []).find(
      (child) =>
        (child.kind === "chat-module" || child.kind === "acp-module") &&
        child.linkedSessionKey?.trim() === linkedSessionKey,
    );
    if (!existingLeaf) {
      let nextId = `${node.id}:chat`;
      let suffix = 2;
      while (existingIds.has(nextId)) {
        nextId = `${node.id}:chat:${suffix}`;
        suffix += 1;
      }
      existingIds.add(nextId);
      const nextLeaf: MissionControlTreeNode = {
        id: nextId,
        parentId: node.id,
        kind: "chat-module",
        label: node.kind === "repo" ? "Project Chat" : "Chat",
        linkedSessionKey,
      };
      insertedNodes.push(nextLeaf);
      const bucket = childrenByParent.get(node.id) ?? [];
      bucket.push(nextLeaf);
      childrenByParent.set(node.id, bucket);
    }
    delete node.linkedSessionKey;
  }
  return [...clonedNodes, ...insertedNodes];
}

function resolveRepoSeedKey(node: MissionControlTreeNode): string {
  if (node.kind !== "repo") {
    return "";
  }
  const linkedDomainId = normalizeLookupKey(node.linkedDomainId);
  if (linkedDomainId && DEFAULT_REPO_TREE_SEEDS[linkedDomainId]) {
    return linkedDomainId;
  }
  const labelKey = normalizeLookupKey(node.label);
  if (labelKey && DEFAULT_REPO_TREE_SEEDS[labelKey]) {
    return labelKey;
  }
  const match = PPV_WORKSPACE_REGISTRY.domains.find((domain) => {
    const aliases = [domain.id, domain.name, domain.repo].map((value) => normalizeLookupKey(value));
    return aliases.includes(labelKey);
  });
  return match ? normalizeLookupKey(match.id) : "";
}

function seedMissionControlTreeNodes(
  treeNodes: MissionControlTreeNode[],
): MissionControlTreeNode[] {
  const clonedNodes = treeNodes.map((node) => ({ ...node }));
  const childrenByParent = new Map<string | null, MissionControlTreeNode[]>();
  const existingIds = new Set(clonedNodes.map((node) => node.id));
  for (const node of clonedNodes) {
    const bucket = childrenByParent.get(node.parentId ?? null) ?? [];
    bucket.push(node);
    childrenByParent.set(node.parentId ?? null, bucket);
  }
  const insertedNodes: MissionControlTreeNode[] = [];
  const appendSeedChildren = (
    parentId: string,
    seeds: MissionControlTreeSeed[],
    pathTokens: string[],
  ) => {
    for (const seed of seeds) {
      const siblingBucket = childrenByParent.get(parentId) ?? [];
      const existingNode =
        siblingBucket.find(
          (child) =>
            child.kind === seed.kind &&
            normalizeLookupKey(child.label) === normalizeLookupKey(seed.label),
        ) ?? null;
      let targetNode = existingNode;
      if (!targetNode) {
        let nextId = `${parentId}:${pathTokens.concat(slugifySeedLabel(seed.label)).join(":")}`;
        let suffix = 2;
        while (existingIds.has(nextId)) {
          nextId = `${parentId}:${pathTokens.concat(`${slugifySeedLabel(seed.label)}-${suffix}`).join(":")}`;
          suffix += 1;
        }
        targetNode = {
          id: nextId,
          parentId,
          kind: seed.kind,
          label: seed.label,
        };
        existingIds.add(nextId);
        insertedNodes.push(targetNode);
        siblingBucket.push(targetNode);
        childrenByParent.set(parentId, siblingBucket);
      }
      if (!seed.children?.length || targetNode.kind !== "module") {
        continue;
      }
      const nestedChildren = childrenByParent.get(targetNode.id) ?? [];
      const hasNestedModules = nestedChildren.some((child) => child.kind === "module");
      if (hasNestedModules) {
        continue;
      }
      appendSeedChildren(
        targetNode.id,
        seed.children,
        pathTokens.concat(slugifySeedLabel(seed.label)),
      );
    }
  };

  for (const node of clonedNodes) {
    if (node.kind !== "repo") {
      continue;
    }
    const seedKey = resolveRepoSeedKey(node);
    const seeds = DEFAULT_REPO_TREE_SEEDS[seedKey];
    if (!seeds?.length) {
      continue;
    }
    const repoChildren = childrenByParent.get(node.id) ?? [];
    const hasModuleChildren = repoChildren.some((child) => child.kind === "module");
    if (hasModuleChildren) {
      continue;
    }
    appendSeedChildren(node.id, seeds, [seedKey || slugifySeedLabel(node.label)]);
  }

  return [...clonedNodes, ...insertedNodes];
}

function materializeMissionControlTreeNodes(
  base: MissionControlWorkspaceRegistry,
  treeNodes?: MissionControlTreeNode[],
): MissionControlTreeNode[] {
  const baseTreeNodes =
    Array.isArray(treeNodes) && treeNodes.length > 0
      ? normalizeMissionControlTreeNodes(treeNodes)
      : createDefaultTreeNodes(base);
  return seedMissionControlTreeNodes(baseTreeNodes);
}

function materializeMissionControlRegistry(
  raw: unknown,
  base: MissionControlWorkspaceRegistry = createDefaultMissionControlRegistry(),
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
    treeNodes: materializeMissionControlTreeNodes(base, parsed.treeNodes),
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
  const base = cloneRegistry(PPV_WORKSPACE_REGISTRY);
  return {
    ...base,
    treeNodes: materializeMissionControlTreeNodes(base, base.treeNodes),
  };
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
