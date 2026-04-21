import crypto from "node:crypto";
import { resolveContextTokensForModel } from "../../agents/context.js";
import { DEFAULT_CONTEXT_TOKENS } from "../../agents/defaults.js";
import type { OpenClawConfig } from "../../config/config.js";
import { resolveFreshSessionTotalTokens, type SessionEntry } from "../../config/sessions.js";

export function resolveMemoryFlushContextWindowTokens(params: {
  modelId?: string;
  agentCfgContextTokens?: number;
  cfg?: OpenClawConfig;
  provider?: string;
}): number {
  return (
    resolveContextTokensForModel({
      cfg: params.cfg,
      provider: params.provider,
      model: params.modelId,
      contextTokensOverride: params.agentCfgContextTokens,
      allowAsyncLoad: false,
    }) ?? DEFAULT_CONTEXT_TOKENS
  );
}

function resolvePositiveTokenCount(value: number | undefined): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? Math.floor(value)
    : undefined;
}

function resolveMemoryFlushGateState<
  TEntry extends Pick<SessionEntry, "totalTokens" | "totalTokensFresh">,
>(params: {
  entry?: TEntry;
  tokenCount?: number;
  contextWindowTokens: number;
  reserveTokensFloor: number;
  softThresholdTokens: number;
}): { entry: TEntry; totalTokens: number; threshold: number } | null {
  if (!params.entry) {
    return null;
  }

  const totalTokens =
    resolvePositiveTokenCount(params.tokenCount) ?? resolveFreshSessionTotalTokens(params.entry);
  if (!totalTokens || totalTokens <= 0) {
    return null;
  }

  const contextWindow = Math.max(1, Math.floor(params.contextWindowTokens));
  const reserveTokens = Math.max(0, Math.floor(params.reserveTokensFloor));
  const softThreshold = Math.max(0, Math.floor(params.softThresholdTokens));
  const threshold = Math.max(0, contextWindow - reserveTokens - softThreshold);
  if (threshold <= 0) {
    return null;
  }

  return { entry: params.entry, totalTokens, threshold };
}

export function shouldRunMemoryFlush(params: {
  entry?: Pick<
    SessionEntry,
    | "totalTokens"
    | "totalTokensFresh"
    | "compactionCount"
    | "memoryFlushCompactionCount"
    | "lastCompactionFailAt"
    | "consecutiveCompactionFailures"
  >;
  /**
   * Optional token count override for flush gating. When provided, this value is
   * treated as a fresh context snapshot and used instead of the cached
   * SessionEntry.totalTokens (which may be stale/unknown).
   */
  tokenCount?: number;
  contextWindowTokens: number;
  reserveTokensFloor: number;
  softThresholdTokens: number;
  /** Override "now" for tests. Defaults to Date.now(). */
  now?: number;
}): boolean {
  const state = resolveMemoryFlushGateState(params);
  if (!state || state.totalTokens < state.threshold) {
    return false;
  }

  if (hasAlreadyFlushedForCurrentCompaction(state.entry)) {
    return false;
  }

  if (isWithinCompactionFailureCooldown(state.entry, params.now ?? Date.now())) {
    return false;
  }

  return true;
}

export function shouldRunPreflightCompaction(params: {
  entry?: Pick<
    SessionEntry,
    "totalTokens" | "totalTokensFresh" | "lastCompactionFailAt" | "consecutiveCompactionFailures"
  >;
  /**
   * Optional projected token count override for pre-run compaction gating.
   * When provided, this value is treated as a fresh estimate and used instead
   * of any cached SessionEntry total.
   */
  tokenCount?: number;
  contextWindowTokens: number;
  reserveTokensFloor: number;
  softThresholdTokens: number;
  /** Override "now" for tests. Defaults to Date.now(). */
  now?: number;
}): boolean {
  const state = resolveMemoryFlushGateState(params);
  if (!state || state.totalTokens < state.threshold) {
    return false;
  }
  if (isWithinCompactionFailureCooldown(state.entry, params.now ?? Date.now())) {
    return false;
  }
  return true;
}

/**
 * Returns true when a recent compaction failure is still within its
 * exponential-backoff window. Without this, a transient upstream provider
 * outage turns into a per-turn compaction hammer: every subsequent user
 * message re-enters the gate, fires compaction, fails the same way, and
 * repeats. The backoff gives the upstream time to recover and stops wasting
 * tokens/credits on doomed retries.
 *
 * Window: 60s, 120s, 240s, 480s, capped at 900s (15 min) after the 5th
 * consecutive failure. Reset by {@link incrementCompactionCount} on success.
 */
export function isWithinCompactionFailureCooldown(
  entry: Pick<SessionEntry, "lastCompactionFailAt" | "consecutiveCompactionFailures">,
  now: number,
): boolean {
  const last = entry.lastCompactionFailAt;
  if (typeof last !== "number" || !Number.isFinite(last) || last <= 0) {
    return false;
  }
  if (now < last) {
    // Clock skew / test pathologies — treat as not in cooldown.
    return false;
  }
  const failures = Math.max(1, entry.consecutiveCompactionFailures ?? 1);
  const baseMs = 60_000;
  const capMs = 900_000;
  const cooldownMs = Math.min(capMs, baseMs * 2 ** (failures - 1));
  return now - last < cooldownMs;
}

/**
 * Returns true when a memory flush has already been performed for the current
 * compaction cycle. This prevents repeated flush runs within the same cycle —
 * important for both the token-based and transcript-size–based trigger paths.
 */
export function hasAlreadyFlushedForCurrentCompaction(
  entry: Pick<SessionEntry, "compactionCount" | "memoryFlushCompactionCount">,
): boolean {
  const compactionCount = entry.compactionCount ?? 0;
  const lastFlushAt = entry.memoryFlushCompactionCount;
  return typeof lastFlushAt === "number" && lastFlushAt === compactionCount;
}

/**
 * Compute a lightweight content hash from the tail of a session transcript.
 * Used for state-based flush deduplication — if the hash hasn't changed since
 * the last flush, the context is effectively the same and flushing again would
 * produce duplicate memory entries.
 *
 * Hash input: `messages.length` + content of the last 3 user/assistant messages.
 * Algorithm: SHA-256 truncated to 16 hex chars (collision-resistant enough for dedup).
 */
export function computeContextHash(messages: Array<{ role?: string; content?: unknown }>): string {
  const userAssistant = messages.filter((m) => m.role === "user" || m.role === "assistant");
  const tail = userAssistant.slice(-3);
  const payload = `${messages.length}:${tail.map((m, i) => `[${i}:${m.role ?? ""}]${typeof m.content === "string" ? m.content : JSON.stringify(m.content ?? "")}`).join("\x00")}`;
  const hash = crypto.createHash("sha256").update(payload).digest("hex");
  return hash.slice(0, 16);
}
