import { describe, expect, it } from "vitest";
import { classifyCompactionReason, resolveCompactionFailureReason } from "./compact-reasons.js";

describe("resolveCompactionFailureReason", () => {
  it("replaces generic compaction cancellation with the safeguard reason", () => {
    expect(
      resolveCompactionFailureReason({
        reason: "Compaction cancelled",
        safeguardCancelReason:
          "Compaction safeguard could not resolve an API key for anthropic/claude-opus-4-6.",
      }),
    ).toBe("Compaction safeguard could not resolve an API key for anthropic/claude-opus-4-6.");
  });

  it("preserves non-generic compaction failures", () => {
    expect(
      resolveCompactionFailureReason({
        reason: "Compaction timed out",
        safeguardCancelReason:
          "Compaction safeguard could not resolve an API key for anthropic/claude-opus-4-6.",
      }),
    ).toBe("Compaction timed out");
  });
});

describe("classifyCompactionReason", () => {
  it('classifies "nothing to compact" as a skip-like reason', () => {
    expect(classifyCompactionReason("Nothing to compact (session too small)")).toBe(
      "no_compactable_entries",
    );
  });

  it("classifies safeguard messages as guard-blocked", () => {
    expect(
      classifyCompactionReason(
        "Compaction safeguard could not resolve an API key for anthropic/claude-opus-4-6.",
      ),
    ).toBe("guard_blocked");
  });

  it("classifies OpenAI's generic 5xx wording as provider_error_5xx even without an HTTP code", () => {
    expect(
      classifyCompactionReason(
        "The server had an error processing your request. Sorry about that! You can retry your request, or contact us through our help center if you keep seeing this error.",
      ),
    ).toBe("provider_error_5xx");
    expect(classifyCompactionReason("internal server error")).toBe("provider_error_5xx");
    expect(classifyCompactionReason("Service Unavailable")).toBe("provider_error_5xx");
    // "504 Gateway Timeout" correctly classifies as "timeout" via the earlier
    // timeout rule — that's acceptable because both are transient-retry signals.
  });
});
