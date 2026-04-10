import type {
  MissionControlDomain,
  MissionControlSessionLane,
  MissionControlWorkspaceRegistry,
} from "./mission-control-registry.ts";
import type { MissionControlIntakeDraft } from "./mission-control-store.ts";

export type MissionControlRoutingConfidence = "high" | "medium" | "low";

export type MissionControlRoutingDecision = {
  domainId: string;
  laneId: string;
  routeId: string;
  routingReason: string;
  confidence: MissionControlRoutingConfidence;
  requiresHandoff: boolean;
  requiresSchedule: boolean;
  suggestedNextAction: string;
  matchedKeywords: string[];
  fallbackToControl: boolean;
};

function normalizeText(value: string): string {
  return value.trim().toLowerCase();
}

function splitWords(value: string): string[] {
  return normalizeText(value)
    .split(/[^a-z0-9]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function includesKeyword(text: string, keyword: string): boolean {
  const normalizedKeyword = normalizeText(keyword);
  if (!normalizedKeyword) {
    return false;
  }
  if (normalizedKeyword.includes(" ")) {
    return text.includes(normalizedKeyword);
  }
  return splitWords(text).includes(normalizedKeyword);
}

function domainKeywords(
  domain: MissionControlDomain,
  lane: MissionControlSessionLane | null,
): string[] {
  return [
    ...(domain.routingKeywords ?? []),
    domain.name,
    domain.repo,
    ...(lane?.aliases ?? []),
    lane?.name ?? "",
  ]
    .map((item) => normalizeText(item))
    .filter(Boolean);
}

function confidenceForScore(score: number, margin: number): MissionControlRoutingConfidence {
  if (score >= 3 && margin >= 2) {
    return "high";
  }
  if (score >= 2) {
    return "medium";
  }
  return "low";
}

function defaultControlDecision(): MissionControlRoutingDecision {
  return {
    domainId: "control",
    laneId: "ppv-control",
    routeId: "workspace-request",
    routingReason:
      "No strong domain match was found, so Mission Control should keep this in Control for triage.",
    confidence: "low",
    requiresHandoff: false,
    requiresSchedule: false,
    suggestedNextAction:
      "Triage the request in Control, confirm the owning repo/domain, then route it onward.",
    matchedKeywords: [],
    fallbackToControl: true,
  };
}

function routeForDomain(domainId: string, text: string): string {
  const normalized = normalizeText(text);
  if (
    normalized.includes("handoff") ||
    normalized.includes("summary") ||
    normalized.includes("alert") ||
    normalized.includes("slack")
  ) {
    return "alerts-and-handoffs";
  }
  if (domainId === "control") {
    return "workspace-request";
  }
  return "implementation-work";
}

function suggestedNextActionForDomain(domain: MissionControlDomain): string {
  if (domain.id === "control") {
    return "Confirm workspace ownership and decide whether this stays in Control or hands off to a specialist lane.";
  }
  return `Open the ${domain.name} lane, confirm scope in the owning repo, and begin execution with explicit acceptance checks.`;
}

export function classifyMissionControlIntake(
  registry: MissionControlWorkspaceRegistry,
  draft: Pick<MissionControlIntakeDraft, "title" | "request">,
): MissionControlRoutingDecision {
  const text = normalizeText(`${draft.title}\n${draft.request}`);
  if (!text) {
    return defaultControlDecision();
  }

  const scored = registry.domains.map((domain) => {
    const lane =
      registry.sessionLanes.find((candidate) => candidate.domainId === domain.id) ??
      registry.sessionLanes[0] ??
      null;
    const matchedKeywords = Array.from(
      new Set(domainKeywords(domain, lane).filter((keyword) => includesKeyword(text, keyword))),
    );
    return {
      domain,
      lane,
      matchedKeywords,
      score: matchedKeywords.length,
    };
  });

  scored.sort((left, right) => right.score - left.score);
  const top = scored[0];
  const second = scored[1];
  if (!top || top.score === 0 || !top.lane) {
    return defaultControlDecision();
  }

  if (second && second.score > 0 && top.score === second.score) {
    return {
      ...defaultControlDecision(),
      routingReason: `The request matched multiple domains equally (${top.domain.name} and ${second.domain.name}), so Control should disambiguate ownership before routing it onward.`,
      matchedKeywords: Array.from(new Set([...top.matchedKeywords, ...second.matchedKeywords])),
      requiresHandoff: true,
    };
  }

  const margin = top.score - (second?.score ?? 0);
  const confidence = confidenceForScore(top.score, margin);
  const routeId = routeForDomain(top.domain.id, text);
  const requiresHandoff = routeId === "alerts-and-handoffs";
  const requiresSchedule =
    text.includes("deadline") ||
    text.includes("tomorrow") ||
    text.includes("next week") ||
    text.includes("cron") ||
    text.includes("follow up") ||
    text.includes("follow-up") ||
    text.includes("remind");

  return {
    domainId: top.domain.id,
    laneId: top.lane.id,
    routeId,
    routingReason: `Matched ${top.domain.name} from keywords: ${top.matchedKeywords.join(", ")}.`,
    confidence,
    requiresHandoff,
    requiresSchedule,
    suggestedNextAction: suggestedNextActionForDomain(top.domain),
    matchedKeywords: top.matchedKeywords,
    fallbackToControl: false,
  };
}
