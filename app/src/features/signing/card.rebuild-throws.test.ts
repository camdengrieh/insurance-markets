import { describe, expect, it, vi } from "vitest";

import { evaluateCard } from "./card";
import { NOW_MS, deployItem } from "./testkit";

// G15 (TM-11): when the rebuild code itself throws on an item, the card says "failed", never "unavailable" or "verified".
const control = vi.hoisted(() => ({ throwing: false }));
vi.mock("@shared/xo/signing/rebuild", async (importOriginal) => {
  const original = await importOriginal<typeof import("@shared/xo/signing/rebuild")>();
  return {
    ...original,
    rebuildDecoded: (...args: Parameters<typeof original.rebuildDecoded>) => {
      if (control.throwing) throw new Error("boom");
      return original.rebuildDecoded(...args);
    },
  };
});

describe("a rebuild that throws", () => {
  it("fails the card and withholds the intent", () => {
    const item = deployItem();
    expect(evaluateCard(item, { nowMs: NOW_MS, state: "prepared" }).verification).toBe("verified");
    control.throwing = true;
    try {
      const evaluation = evaluateCard(item, { nowMs: NOW_MS, state: "prepared" });
      expect(evaluation.verification).toBe("failed");
      expect(evaluation.checks.find((check) => check.id === "rebuild")?.status).toBe("fail");
      expect(evaluation.intentJson).toBeNull();
    } finally {
      control.throwing = false;
    }
  });
});
