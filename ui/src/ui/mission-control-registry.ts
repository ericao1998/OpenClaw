import type { GatewaySessionRow } from "./types.ts";

export type MissionControlDomain = {
  id: string;
  name: string;
  repo: string;
  owner: string;
  role: string;
  status: string;
  docsPaths: string[];
  memorySources: string[];
  routingKeywords: string[];
};

export type MissionControlSessionLane = {
  id: string;
  name: string;
  key: string;
  owner: string;
  purpose: string;
  domainId: string;
  aliases: string[];
};

export type MissionControlIntakeRoute = {
  id: string;
  title: string;
  target: string;
  detail: string;
  laneId: string;
  starterPrompt: string;
};

export type MissionControlTreeNodeKind =
  | "workspace"
  | "repo"
  | "module"
  | "chat-module"
  | "acp-module";

export type MissionControlTreeNode = {
  id: string;
  parentId: string | null;
  kind: MissionControlTreeNodeKind;
  label: string;
  linkedDomainId?: string;
  linkedLaneId?: string;
  linkedSessionKey?: string;
};

export type MissionControlWorkspaceRegistry = {
  id: string;
  name: string;
  domains: MissionControlDomain[];
  sessionLanes: MissionControlSessionLane[];
  intakeRoutes: MissionControlIntakeRoute[];
  treeNodes?: MissionControlTreeNode[];
};

export const PPV_WORKSPACE_REGISTRY: MissionControlWorkspaceRegistry = {
  id: "ppv",
  name: "Prime Property Ventures",
  domains: [
    {
      id: "operator-os",
      name: "Operator OS",
      repo: "PPV-Operator-OS",
      owner: "Execution lane",
      role: "Autonomous execution engine and app-factory lane",
      status: "Execution system",
      docsPaths: [
        "PPV-Operator-OS/Architect-Docs/Operator-OS/00-START-HERE.md",
        "PPV-Operator-OS/Architect-Docs/Operator-OS/04-ACTIVE-HANDOFF.md",
      ],
      memorySources: ["PPV Operator-OS Stability session"],
      routingKeywords: [
        "operator os",
        "operator-os",
        "harness",
        "governor",
        "autonomous",
        "vendor fallback",
        "control plane",
      ],
    },
    {
      id: "website",
      name: "Website",
      repo: "PPV_Website",
      owner: "Growth lane",
      role: "Public web, intake, ads ops, and funnel UX",
      status: "Go-to-market domain",
      docsPaths: ["PPV_Website/Architect-Docs/Google-Ads-Realignment/AI-HANDOFF.md"],
      memorySources: ["PPV Website session"],
      routingKeywords: [
        "website",
        "ads",
        "seo",
        "landing page",
        "attribution",
        "funnel",
        "lead intake",
        "google ads",
        "meta",
      ],
    },
    {
      id: "salesforce",
      name: "Salesforce",
      repo: "prime-salesforce-dev",
      owner: "Revenue lane",
      role: "CRM workflows, nurture logic, and sales operations",
      status: "Revenue ops domain",
      docsPaths: [
        "prime-salesforce-dev/Architect-Docs/Inbound-Lead-Automation/04-ACTIVE-HANDOFF.md",
        "prime-salesforce-dev/Architect-Docs/Inbound-Lead-Automation/AI-HANDOFF.md",
      ],
      memorySources: ["PPV Salesforce session"],
      routingKeywords: [
        "salesforce",
        "crm",
        "lead nurture",
        "twilio",
        "consent",
        "sms",
        "ila",
        "automation",
      ],
    },
    {
      id: "lead-crawler",
      name: "Lead Crawler",
      repo: "Lead-Crawler",
      owner: "Acquisition lane",
      role: "Crawler logic, enrichment, and pipeline orchestration",
      status: "Acquisition domain",
      docsPaths: ["Lead-Crawler/README.md"],
      memorySources: ["PPV Lead Crawler session"],
      routingKeywords: [
        "crawler",
        "lead crawler",
        "enrichment",
        "scrape",
        "pipeline",
        "acquisition",
      ],
    },
    {
      id: "infra",
      name: "Infra",
      repo: "azure-portal-dev",
      owner: "Platform lane",
      role: "Infrastructure, orchestration, and shared services",
      status: "Platform domain",
      docsPaths: ["azure-portal-dev/README.md"],
      memorySources: ["PPV Infra session"],
      routingKeywords: [
        "infra",
        "infrastructure",
        "azure",
        "deployment",
        "server",
        "network",
        "gateway",
      ],
    },
    {
      id: "control",
      name: "Control",
      repo: "openclaw",
      owner: "Control lane",
      role: "OpenClaw web UI and workspace coordination layer",
      status: "Mission Control host",
      docsPaths: ["PPV-Dev-Root/Architect-Docs/Mission-Control/17-EXECUTION-READY-MVP-SPEC.md"],
      memorySources: ["PPV Control session"],
      routingKeywords: [
        "mission control",
        "openclaw",
        "routing",
        "coordination",
        "workspace",
        "control",
        "handoff",
      ],
    },
  ],
  sessionLanes: [
    {
      id: "ppv-control",
      name: "PPV Control",
      key: "control",
      owner: "Hermes / Control",
      purpose: "Workspace orchestration and cross-repo routing",
      domainId: "control",
      aliases: ["ppv control", "ppv-control"],
    },
    {
      id: "ppv-operator-os-stability",
      name: "PPV Operator-OS Stability",
      key: "operator-os-stability",
      owner: "Claude / Delivery",
      purpose: "Harness reliability and execution hardening",
      domainId: "operator-os",
      aliases: ["ppv operator-os stability", "ppv operator os stability", "operator-os-stability"],
    },
    {
      id: "ppv-website",
      name: "PPV Website",
      key: "website",
      owner: "Claude / Delivery",
      purpose: "Public web, intake, ads ops, and attribution work",
      domainId: "website",
      aliases: ["ppv website", "ppv-website"],
    },
    {
      id: "ppv-salesforce",
      name: "PPV Salesforce",
      key: "salesforce",
      owner: "Claude / Delivery",
      purpose: "CRM, automation, and message-flow work",
      domainId: "salesforce",
      aliases: ["ppv salesforce", "ppv-salesforce"],
    },
    {
      id: "ppv-lead-crawler",
      name: "PPV Lead Crawler",
      key: "lead-crawler",
      owner: "Claude / Delivery",
      purpose: "Crawler and enrichment pipeline work",
      domainId: "lead-crawler",
      aliases: ["ppv lead crawler", "ppv-lead-crawler", "lead crawler"],
    },
    {
      id: "ppv-infra",
      name: "PPV Infra",
      key: "infra",
      owner: "Claude / Delivery",
      purpose: "Infra, deployment, and environment operations",
      domainId: "infra",
      aliases: ["ppv infra", "ppv-infra"],
    },
  ],
  intakeRoutes: [
    {
      id: "workspace-request",
      title: "Workspace request",
      target: "Mission Control → PPV Control",
      detail:
        "Triage the request, assign a domain owner, and route follow-up into the right repo lane.",
      laneId: "ppv-control",
      starterPrompt:
        "Mission Control intake: triage this workspace request, identify the owning repo/domain, define next actions, and hand off clearly.",
    },
    {
      id: "implementation-work",
      title: "Implementation work",
      target: "Repo lane + scoped session",
      detail:
        "Push execution into the owning repo while preserving workspace-level context and handoff visibility.",
      laneId: "ppv-operator-os-stability",
      starterPrompt:
        "Mission Control intake: convert this into scoped implementation work, confirm repo ownership, list acceptance checks, and start execution.",
    },
    {
      id: "alerts-and-handoffs",
      title: "Alerts and handoffs",
      target: "Slack summary + session state",
      detail:
        "Use Slack as a coordination surface, but keep canonical state in OpenClaw sessions and docs.",
      laneId: "ppv-control",
      starterPrompt:
        "Mission Control intake: prepare an alert or handoff summary, preserve the canonical state in OpenClaw, and make the next owner explicit.",
    },
  ],
};

function normalizeMissionControlText(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

function collectSessionTexts(row: GatewaySessionRow): string[] {
  return [row.key, row.label, row.displayName, row.subject, row.room, row.space].map((value) =>
    normalizeMissionControlText(value),
  );
}

export function findLaneSessions(
  lane: MissionControlSessionLane,
  sessions: GatewaySessionRow[],
): GatewaySessionRow[] {
  const aliases = lane.aliases.map((alias) => normalizeMissionControlText(alias)).filter(Boolean);
  return sessions.filter((row) => {
    const haystacks = collectSessionTexts(row);
    return aliases.some((alias) => haystacks.some((text) => text.includes(alias)));
  });
}
