// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";

import { act, allText, cleanup, click, must } from "../../ui/testing/dom";
import { clobItemFor, clobPreparedAnswer } from "./clob-test-support";
import { buildClobTicket, type ClobMarketFacts } from "./clob-ticket";
import { OWNER, accountWith, factsWith, installReads, makeRig, mountTrade, prepareEnvelope, typeInto, until, type RigOptions } from "./test-support";

// The venue order ticket inside the trade desk: unproven by default (nothing to hand to an agent), the worst case and
// the signed fields shown before anything is prepared, and, once every fact is recorded and the venue switch is on,
// one prepare call through the clob_order tool whose answer is vetted before it is shown.

afterEach(cleanup);

const NOW = Date.parse("2026-10-19T12:00:00Z");
const TOKEN = "74611051635435493013469257818411865069553882173471237703549469284847187679089";
const NO_TOKEN = "68215442288791572296498952759094916177229244750752613990844701608971303593663";
const PM: ClobMarketFacts = { venue: "polymarket", marketId: "0x" + "99".repeat(32), tick: "0.01", minSize: "5", polymarketBook: "v2", fetchedAtMs: NOW - 15_000 };
const LM: ClobMarketFacts = { venue: "limitless", marketId: "will-it-rain-1792411200000", tick: "0.001", minSize: "0", polymarketBook: null, fetchedAtMs: NOW - 15_000 };
const CHOICES = [
  { label: "Outcome 1: Yes", tokenId: TOKEN, short: "Yes", outcome: "yes" as const },
  { label: "Outcome 2: No", tokenId: NO_TOKEN, short: "No", outcome: "no" as const },
];

async function open(facts: ClobMarketFacts, options: RigOptions & { readonly account?: Record<string, unknown> } = {}) {
  const rig = makeRig({ startMs: NOW, ...options });
  installReads(rig.daemon, options.account ?? accountWith("account_trading"));
  const { container } = mountTrade(rig, { panels: "order", clobMarket: facts, tokenChoices: CHOICES });
  await until(() => container.querySelector("[data-testid=clob-order]") !== null);
  return { rig, container };
}

function field(container: HTMLElement, label: RegExp): HTMLInputElement {
  const found = [...container.querySelectorAll("label")].find((candidate) => label.test(candidate.textContent ?? ""));
  if (found === undefined) throw new Error(`no field ${String(label)}`);
  const id = found.getAttribute("for");
  return must<HTMLInputElement>(container, `#${id ?? ""}`);
}

function button(container: HTMLElement, label: RegExp): HTMLButtonElement {
  const found = [...container.querySelectorAll("button")].find((candidate) => label.test(candidate.textContent ?? ""));
  if (found === undefined) throw new Error(`no button ${String(label)}`);
  return found;
}

describe("the venue ticket, unproven and switched off", () => {
  it("shows the maker panel instead of the XO account, the unproven caution, and a disabled Prepare with the reasons", async () => {
    const { container } = await open(PM);
    expect(container.querySelector("[data-testid=account]")).toBeNull();
    const maker = must(container, "[data-testid=maker]");
    expect(allText(maker)).toContain(OWNER);
    expect(allText(maker)).toContain("ENABLE_CLOB_POLYMARKET");
    expect(allText(maker)).toContain("off");
    const panel = must(container, "[data-testid=clob-order]");
    expect(panel.getAttribute("data-venue")).toBe("polymarket");
    expect(allText(must(panel, "[data-kind=unproven]"))).toContain("No live test has recorded an order on Polymarket");
    expect(button(container, /Prepare this Polymarket order/).disabled).toBe(true);
    expect(allText(panel)).toContain("ENABLE_CLOB_POLYMARKET is off");
    expect(allText(panel)).toContain("Polymarket accepted the wallet's login (PM1): unproven");
    expect(panel.querySelectorAll(".ui-badge[data-tone='ok']")).toHaveLength(0);
    const labels = [...container.querySelectorAll("button, a")].map((element) => (element.textContent ?? "").toLowerCase());
    for (const label of labels) expect(label, label).not.toMatch(/\bsign\b|send|submit|withdraw/);
  });

  it("shows the worst case with the policy fee ceiling, the tick and minimum as read, the provenance line and the signed fields", async () => {
    const { container } = await open(PM);
    typeInto(field(container, /^Limit price/), "0.52");
    typeInto(field(container, /^Size/), "10");
    const panel = must(container, "[data-testid=clob-order]");
    const cost = must(panel, "[data-kind=ticket]");
    expect(allText(cost)).toContain("Buy 10 shares at 0.52");
    expect(allText(cost)).toContain("5.72 USD");
    expect(allText(cost)).toContain("1,000 bps policy fee ceiling");
    expect(allText(cost)).toContain("0.01; 5 shares");
    expect(allText(must(panel, "[data-provenance=ticket]"))).toContain("read from Polymarket");
    const signed = must(panel, "[data-kind=what-you-sign]");
    expect(allText(signed)).toContain("makerAmount");
    expect(allText(signed)).toContain("5200000");
    expect(allText(signed)).toContain("Polymarket CTF Exchange, version 3, chain 137");
    expect(allText(signed)).toContain("set by the relay");
    // The compact strip in the bar: the decoded domain, side and type, the two signed amounts and the fee ceiling,
    // worked out from the ticket (nothing marked as an example, because nothing is one).
    const strip = must(panel, "[role=group][aria-label='What you sign']");
    expect(allText(strip)).toContain("Polymarket CTF Exchange v3 · 137");
    expect(allText(strip)).toContain("BUY · type 3 or 0, read at prepare");
    expect(allText(strip)).toContain("5.2 USD → 10 shares");
    expect(allText(strip)).toContain("1,000 bps");
    expect(allText(strip)).not.toMatch(/example/i);
  });

  it("shows the side as words over the wire values, and the segmented toggle picks the outcome token", async () => {
    const { container } = await open(PM);
    const panel = must(container, "[data-testid=clob-order]");
    const toggle = must(panel, "[role=group][aria-label='Side and outcome']");
    const buttons = [...toggle.querySelectorAll("button")];
    expect(buttons.map((entry) => entry.textContent)).toEqual(["Buy Yes", "Buy No"]);
    expect(buttons.map((entry) => entry.getAttribute("aria-pressed"))).toEqual(["true", "false"]);
    const sides = [...panel.querySelectorAll("option")].filter((option) => option.value === "BUY" || option.value === "SELL");
    expect(sides.map((option) => `${option.value}=${option.textContent}`)).toEqual(["BUY=Buy", "SELL=Sell"]);
    expect([...panel.querySelectorAll("option")].map((option) => option.textContent)).toContain("Good till cancelled (GTC)");
    click(buttons[1] as HTMLButtonElement);
    expect(buttons.map((entry) => entry.getAttribute("aria-pressed"))).toEqual(["false", "true"]);
    // Before the ticket is complete the amounts say why they are missing instead of showing a number.
    expect(allText(must(panel, "[role=group][aria-label='What you sign']"))).toContain("complete the ticket first");
  });

  it("offers only the venue's order types: no GTD and no lifetime on Limitless", async () => {
    const { container } = await open(LM);
    const types = [...must(container, "[data-testid=clob-order]").querySelectorAll("option")].map((option) => option.value);
    expect(types).not.toContain("GTD");
    expect(types).toContain("FAK");
    expect([...container.querySelectorAll("label")].some((label) => /Life in seconds/.test(label.textContent ?? ""))).toBe(false);
  });
});

describe("a prepare through the clob_order tool", () => {
  const PROVEN = factsWith(["polymarket_login_accepted", "polymarket_first_order_accepted", "paybox_signs_typed_data_137"]);

  it("calls the tool with step prepare and the ticket's canonical values, vets the item and shows the hand-off", async () => {
    const { container, rig } = await open(PM, { facts: PROVEN, account: accountWith("account_trading", ["ENABLE_CLOB_POLYMARKET"]) });
    const built = buildClobTicket({ tokenId: TOKEN, side: "BUY", price: "0.52", shares: "10", tif: "GTC", ttlS: "", postOnly: false }, PM);
    if (!built.ok) throw new Error("ticket");
    const item = clobItemFor(built.ticket, OWNER as `0x${string}`, { nowMs: NOW });
    const calls: Record<string, unknown>[] = [];
    rig.daemon.tools.set("clob_order", (args) => {
      calls.push(args);
      return prepareEnvelope("clob_order", clobPreparedAnswer(item));
    });
    typeInto(field(container, /^Limit price/), "0.52");
    typeInto(field(container, /^Size/), "10");
    const prepare = button(container, /Prepare this Polymarket order/);
    await until(() => !prepare.disabled);
    await act(async () => {
      click(prepare);
    });
    await until(() => container.querySelector("[data-kind=prepared]") !== null);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toEqual({ step: "prepare", venue: "polymarket", owner: OWNER, market_id: PM.marketId, token_id: TOKEN, side: "BUY", price: "0.52", shares: "10", tif: "GTC" });
    const preview = must(container, "[data-kind=prepared]");
    const text = allText(preview);
    expect(text).toContain("Prepared, not signed");
    expect(text).toContain("Maker (the owner wallet itself; no derived account)");
    expect(text).toContain("no expiry is signed");
    expect(text).toContain("polymarket 0xe3333700cA9d93003F00f0F71f8515005F6c00Aa");
    expect(text).toContain('clob_order with step "submit"');
    expect(text).not.toMatch(/xo_submit_order/);
  });

  it("shows nothing from an item that does not match the ticket (another token), with a fixed sentence", async () => {
    const { container, rig } = await open(PM, { facts: PROVEN, account: accountWith("account_trading", ["ENABLE_CLOB_POLYMARKET"]) });
    const built = buildClobTicket({ tokenId: TOKEN, side: "BUY", price: "0.52", shares: "10", tif: "GTC", ttlS: "", postOnly: false }, PM);
    if (!built.ok) throw new Error("ticket");
    const item = clobItemFor(built.ticket, OWNER as `0x${string}`, { nowMs: NOW, tokenIdOverride: NO_TOKEN });
    rig.daemon.tools.set("clob_order", () => prepareEnvelope("clob_order", clobPreparedAnswer(item)));
    typeInto(field(container, /^Limit price/), "0.52");
    typeInto(field(container, /^Size/), "10");
    const prepare = button(container, /Prepare this Polymarket order/);
    await until(() => !prepare.disabled);
    await act(async () => {
      click(prepare);
    });
    await until(() => /different outcome token/.test(allText(container)));
    expect(container.querySelector("[data-kind=prepared]")).toBeNull();
    expect(allText(container)).not.toContain(item.digest.slice(2, 18));
  });

  it("shows the refusal words when the daemon's tool answers flag_off, and prepares nothing", async () => {
    const { container, rig } = await open(PM, { facts: PROVEN, account: accountWith("account_trading", ["ENABLE_CLOB_POLYMARKET"]) });
    // The plugin carries a refusal in its structured answer (outcome "refused"); the daemon's envelope stays well formed.
    rig.daemon.tools.set("clob_order", () => prepareEnvelope("clob_order", { outcome: "refused", code: "flag_off", message: "ENABLE_CLOB_POLYMARKET is off.", next_action: "Ask the operator.", flag: "ENABLE_CLOB_POLYMARKET" }));
    typeInto(field(container, /^Limit price/), "0.52");
    typeInto(field(container, /^Size/), "10");
    const prepare = button(container, /Prepare this Polymarket order/);
    await until(() => !prepare.disabled);
    await act(async () => {
      click(prepare);
    });
    await until(() => container.querySelector("[data-kind=refused]") !== null);
    expect(allText(container)).toContain("This write path is switched off");
    expect(container.querySelector("[data-kind=prepared]")).toBeNull();
  });
});
