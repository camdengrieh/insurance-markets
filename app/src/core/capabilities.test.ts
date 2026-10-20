import { describe, expect, it } from "vitest";

import { CAPABILITY_IDS, NO_FACTS, allProven, factDetail, factLabel, isFactState, isProven, readFacts } from "./capabilities";

describe("capability facts", () => {
  it("starts with nothing proven", () => {
    for (const id of CAPABILITY_IDS) {
      expect(NO_FACTS[id]).toBe("unknown");
      expect(isProven(NO_FACTS[id])).toBe(false);
      expect(factLabel(NO_FACTS[id])).toBe("unproven");
    }
    expect(allProven(NO_FACTS, ["door_a_bundler_admits_first_userop"])).toBe(false);
    // An empty requirement is vacuously met, which is why callers always name the facts they need.
    expect(allProven(NO_FACTS, [])).toBe(true);
  });

  it("shows 'unproven' for anything that is not recorded as yes, a recorded no included", () => {
    expect(factLabel("yes")).toBe("proven");
    expect(factLabel("no")).toBe("unproven");
    expect(factLabel("unknown")).toBe("unproven");
    expect(factLabel(undefined)).toBe("unproven");
    expect(factDetail("no")).toContain("failed");
    expect(factDetail("unknown")).toContain("Not yet tested");
    expect(factDetail("yes")).toContain("operator");
  });

  it("reads a stored map strictly: unknown ids dropped, anything but yes or no is unknown", () => {
    const facts = readFacts({
      door_a_bundler_admits_first_userop: "yes",
      door_b_orderbook_registers_account: "no",
      door_c_l1_clobauth_accepted: "true",
      door_d_orderbook_credits_usdce: true,
      door_e_relayer_delivers_foreign_message: 1,
      paybox_signs_raw_digest: "YES",
      not_a_capability: "yes",
    });
    expect(facts.door_a_bundler_admits_first_userop).toBe("yes");
    expect(facts.door_b_orderbook_registers_account).toBe("no");
    expect(facts.door_c_l1_clobauth_accepted).toBe("unknown");
    expect(facts.door_d_orderbook_credits_usdce).toBe("unknown");
    expect(facts.door_e_relayer_delivers_foreign_message).toBe("unknown");
    expect(facts.paybox_signs_raw_digest).toBe("unknown");
    expect(Object.keys(facts).sort()).toEqual([...CAPABILITY_IDS].sort());
    for (const bad of [null, undefined, "yes", 5, [], ["door_a_bundler_admits_first_userop"]]) {
      expect(readFacts(bad)).toEqual(NO_FACTS);
    }
  });

  it("an inherited property is not a fact, and a bad value is not a state", () => {
    const hostile = Object.create({ door_a_bundler_admits_first_userop: "yes" }) as unknown;
    expect(readFacts(hostile).door_a_bundler_admits_first_userop).toBe("unknown");
    expect(isFactState("yes")).toBe(true);
    expect(isFactState("maybe")).toBe(false);
    expect(readFacts(JSON.parse('{"door_a_bundler_admits_first_userop":"maybe"}')).door_a_bundler_admits_first_userop).toBe("unknown");
  });

  it("the result is frozen", () => {
    const facts = readFacts({});
    expect(Object.isFrozen(facts)).toBe(true);
    expect(Object.isFrozen(NO_FACTS)).toBe(true);
  });
});
