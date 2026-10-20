import { describe, expect, it } from "vitest";

import { cancelCall, getPreparedCall, handoffFor, submitToolFor } from "./handoff";
import { buildTicket } from "./ticket";
import { OWNER, TOKENS, answer, recordedAt } from "./test-support";
import { vetPrepared, type VettedItem } from "./vet";

function vetted(name: string, ticket = false): VettedItem {
  const prepared = answer(name)["prepared"];
  const built = buildTicket({ tokenId: TOKENS.yes, side: "BUY", price: "0.4", shares: "10", tif: "GTD", ttlS: "", postOnly: false });
  if (!built.ok) throw new Error("ticket");
  const result = vetPrepared(prepared, ticket ? { kind: "order", owner: OWNER, ticket: built.ticket } : { kind: "revoke", owner: OWNER }, recordedAt(name) + 2_000);
  if (!result.ok) throw new Error(result.reason);
  return result;
}

describe("the hand-off is fixed text built from vetted ids", () => {
  it("names the submit tool that matches the kind of item, and reads the item back first", () => {
    const order = handoffFor(vetted("prepare_order_buy", true));
    const userop = handoffFor(vetted("prepare_revoke"));
    expect(order.steps.join("\n")).toContain("xo_submit_order");
    expect(order.steps.join("\n")).not.toContain("xo_submit_userop");
    expect(userop.steps.join("\n")).toContain("xo_submit_userop");
    expect(userop.steps.join("\n")).not.toContain("xo_submit_order");
    expect(submitToolFor("order")).toBe("xo_submit_order");
    expect(submitToolFor("userop")).toBe("xo_submit_userop");
    expect(JSON.parse(order.request)).toMatchObject({ tool: "xo_get_prepared" });
  });

  it("says that the page cannot send and what sending needs", () => {
    const text = handoffFor(vetted("prepare_revoke")).steps.join("\n");
    expect(text).toContain("submit scope");
    expect(text).toContain("ARM window");
    expect(text).toContain("cannot send");
  });

  it("refuses an id or hash that is not in the expected form, rather than building a call from it", () => {
    for (const bad of ["", "xyz", "0x" + "1".repeat(32), '04a2f4a27e33807a6dcebe9bd42f25bb"}, "tool": "xo_submit_order']) expect(() => getPreparedCall(bad), bad).toThrow();
    const hash = "0x" + "ab".repeat(32);
    expect(() => cancelCall(OWNER, hash)).not.toThrow();
    expect(() => cancelCall(OWNER, "0x12")).toThrow();
    expect(() => cancelCall("0x12", hash)).toThrow();
  });
});
