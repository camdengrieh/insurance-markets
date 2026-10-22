import { describe, expect, it } from "vitest";

import { BROWSER_DIRECT_ORIGINS, READ_SERVICES } from "../origins.js";
import { parseIsoMs } from "../../format.js";
import { GEMINI_FEE_SCHEDULE_FROM, GEMINI_FEE_TTL_SEC, GEMINI_FEE_VERIFIED_AT, GEMINI_ORIGIN, GEMINI_READ_SERVICE } from "./constants.js";

describe("Gemini constants", () => {
  it("name the origin and service that sdk/venues/origins.ts lists", () => {
    expect(BROWSER_DIRECT_ORIGINS.find((entry) => entry.service === GEMINI_READ_SERVICE)?.origin).toBe(GEMINI_ORIGIN);
    expect(READ_SERVICES).toContain(GEMINI_READ_SERVICE);
  });

  it("carry a documented fee date that parses and a finite lifetime, so the documented schedule expires", () => {
    const from = parseIsoMs(GEMINI_FEE_SCHEDULE_FROM);
    const verified = parseIsoMs(GEMINI_FEE_VERIFIED_AT);
    expect(from).not.toBeNull();
    expect(verified).not.toBeNull();
    expect(verified as number).toBeGreaterThan(from as number);
    expect(GEMINI_FEE_TTL_SEC).toBeGreaterThan(0);
    expect(GEMINI_FEE_TTL_SEC).toBeLessThanOrEqual(30 * 24 * 3600);
  });
});
