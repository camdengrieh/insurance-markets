import { privateKeyToAccount } from "viem/accounts";
import { afterEach, describe, expect, it } from "vitest";

import { BASE_USDC } from "@sdk/chain/xo/constants";

import { checkActivations, registerVenueActivation, runActivations, subscribeVenueActivations, VENUE_ACTIVATIONS, type ActivationRow, type VenueActivation } from "./activation";
import { accountUsdcSource, balanceSources, readAllBalances, registerBalanceSource, totalOf } from "./balances";
import { BASE_CHAIN_ID } from "./constants";
import { createLocalSigner } from "./local-signer";
import { fakeChainCalls, fakeSponsor, TRADING_KEY } from "./testkit";
import type { TradingAccount } from "./types";

// The activation registry and runner, and the balance sources: venues register from their side, the panel runs them in
// order, a failed or unavailable venue does not stop the rest, and an unread balance is never counted as zero.

const owner = privateKeyToAccount(TRADING_KEY);
const acct: TradingAccount = { signer: createLocalSigner({ owner, sponsor: fakeSponsor() }), address: owner.address, mode: "generated", funding: null };
const removers: Array<() => void> = [];

afterEach(() => {
  for (const remove of removers.splice(0)) remove();
});

function venue(id: VenueActivation["venue"], behaviour: { status: VenueActivation["status"]; activate?: VenueActivation["activate"] }): VenueActivation {
  return { venue: id, status: behaviour.status, activate: behaviour.activate ?? (async () => ({ ok: true })) };
}

describe("the activation registry", () => {
  it("starts empty, keeps order, replaces by venue and notifies", () => {
    expect(VENUE_ACTIVATIONS).toEqual([]);
    let changes = 0;
    removers.push(subscribeVenueActivations(() => (changes += 1)));
    const a = venue("polymarket", { status: async () => ({ state: "ready" }) });
    const b = venue("limitless", { status: async () => ({ state: "ready" }) });
    removers.push(registerVenueActivation(a), registerVenueActivation(b));
    const a2 = venue("polymarket", { status: async () => ({ state: "unavailable", reason: "x" }) });
    removers.push(registerVenueActivation(a2));
    expect(VENUE_ACTIVATIONS.map((entry) => entry.venue)).toEqual(["polymarket", "limitless"]);
    expect(VENUE_ACTIVATIONS[0]).toBe(a2);
    expect(changes).toBe(3);
  });
});

describe("running the activations", () => {
  it("activates in order, re-reads status, and carries on past failures", async () => {
    const order: string[] = [];
    let polymarketReady = false;
    const list: VenueActivation[] = [
      venue("polymarket", {
        status: async () => (polymarketReady ? { state: "ready" } : { state: "needs_activation", steps: ["Create your wallet"] }),
        activate: async (_acct, progress) => {
          order.push("polymarket");
          progress("Creating your wallet");
          polymarketReady = true;
          return { ok: true };
        },
      }),
      venue("limitless", {
        status: async () => ({ state: "needs_activation", steps: ["Register"] }),
        activate: async () => {
          order.push("limitless");
          return { ok: false, refusal: { code: "venue_refused", message: "The venue refused.", venueText: "nope" } };
        },
      }),
      venue("xo", { status: async () => ({ state: "unavailable", reason: "Not offered here." }) }),
      venue("trueo", { status: async () => ({ state: "ready" }) }),
    ];
    const rows: Array<ActivationRow | null> = list.map(() => null);
    const steps: string[] = [];
    await runActivations(acct, list, (index, row) => {
      rows[index] = row;
      if (row.state === "activating" && row.step !== null) steps.push(row.step);
    });
    expect(order).toEqual(["polymarket", "limitless"]);
    expect(steps).toEqual(["Creating your wallet"]);
    expect(rows.map((row) => row?.state)).toEqual(["ready", "failed", "unavailable", "ready"]);
    expect(rows[1]).toMatchObject({ message: "The venue refused.", venueText: "nope" });
  });

  it("checks status without activating anything, and survives a status that throws", async () => {
    let activated = false;
    const list: VenueActivation[] = [
      venue("polymarket", {
        status: async () => ({ state: "needs_activation", steps: [] }),
        activate: async () => {
          activated = true;
          return { ok: true };
        },
      }),
      venue("limitless", {
        status: async () => {
          throw new Error("down");
        },
      }),
    ];
    const rows: ActivationRow[] = [];
    await checkActivations(acct, list, (index, row) => (rows[index] = row));
    expect(activated).toBe(false);
    expect(rows.map((row) => row.state)).toEqual(["needs_activation", "failed"]);
  });
});

describe("balances", () => {
  it("adds the account's USDC to the registered venue lines, and marks an unread line as incomplete", async () => {
    const calls = fakeChainCalls({ [BASE_CHAIN_ID]: { [BASE_USDC.toLowerCase()]: { name: "USD Coin", version: "2", balances: new Map([[owner.address.toLowerCase(), 12_340_000n]]) } } });
    removers.push(registerBalanceSource({ id: "venue", read: async () => [{ id: "cash", label: "Venue cash", micros: 5_000_000n }] }));
    removers.push(
      registerBalanceSource({
        id: "broken",
        read: async () => {
          throw new Error("down");
        },
      }),
    );
    const lines = await readAllBalances(acct, accountUsdcSource(calls), balanceSources());
    expect(lines.map((line) => [line.label, line.micros])).toEqual([
      ["USDC on Base", 12_340_000n],
      ["USDC on Polygon", null],
      ["Venue cash", 5_000_000n],
      ["A venue balance", null],
    ]);
    expect(totalOf(lines)).toEqual({ micros: 17_340_000n, complete: false });
  });
});
