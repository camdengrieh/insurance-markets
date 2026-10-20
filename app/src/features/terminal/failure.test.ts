import { BRIDGE_ERROR_CODES } from "@bridge/contract";
import { describe, expect, it } from "vitest";

import { FAILURE_KINDS, VIOLATION_DETAILS, failure, failureWords } from "./failure";

describe("failure words", () => {
  it("every kind has a title and an explanation, and none quotes anything", () => {
    for (const kind of FAILURE_KINDS) {
      const words = failureWords(failure(kind));
      expect(words.title.length, kind).toBeGreaterThan(3);
      expect(words.explain.length, kind).toBeGreaterThan(10);
      expect(`${words.title} ${words.explain}`, kind).not.toMatch(/[<>{}]|cku_|cka_|0x[0-9a-f]{8}/);
    }
  });

  it("every schema-violation detail reads differently", () => {
    const texts = VIOLATION_DETAILS.map((detail) => failureWords(failure("schema_violation", { detail })).explain);
    expect(new Set(texts).size).toBe(VIOLATION_DETAILS.length);
  });

  it("every daemon code is explained or named, never blank", () => {
    for (const code of BRIDGE_ERROR_CODES) {
      for (const kind of ["tool_error", "daemon_refused"] as const) {
        const words = failureWords(failure(kind, { bridgeCode: code }));
        expect(words.title.length, code).toBeGreaterThan(3);
        expect(words.explain.length, code).toBeGreaterThan(5);
      }
    }
  });

  it("adds the wait when the daemon gave one", () => {
    expect(failureWords(failure("daemon_refused", { bridgeCode: "rate_limited", retryAfterS: 12 })).explain).toContain("about 12 s");
  });

  it("does not tell a user that XO lacks a record when the daemon lacks a route", () => {
    const words = failureWords(failure("daemon_refused", { bridgeCode: "not_found", tool: "status" }));
    expect(words.title).toContain("status route");
    expect(failureWords(failure("tool_error", { bridgeCode: "not_found", tool: "xo_search" })).title).toContain("XO has no record");
  });
});
