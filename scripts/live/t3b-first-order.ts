import { extraBool, extraString } from "./lib/args.js";
import { accountStatus, describeStatus, parseUsdMicro, usd } from "./lib/flows.js";
import { isEntryPoint, main } from "./lib/harness.js";
import { cancelOrder, followOrder, listHas, maxBuyOutlayUsd, prepareOrder, signAndSubmitOrder, tokenIdFor } from "./lib/orderflow.js";
import { FLOOR_PROBES, MAX_PROBE_OUTLAY_USD, repostDuplicate, sendFloorProbe, type ProbeResult } from "./lib/probes.js";
import { cleanLine } from "./lib/redact.js";
import { PRECONDITION_DEDICATED, PRECONDITION_NO_RELAY_RUNNING, PRECONDITION_PAYBOX_APPROVAL, PRECONDITION_T1, PRECONDITION_T2 } from "./lib/text.js";
import type { FactProposal, Options, RunContext, TestResult, TestSpec } from "./lib/types.js";

// T3b  First order                                                          docs/phase1-gap-closing.md section 6
//
// Settles: OR3, OR4, OR6, OR11 to OR14, OR17, gate 2. Cost: $0.50 locked while the order rests (principal),
// $0.55 at most counting the 1000 bps cap multiplier the relay reserves; released when it is cancelled. A post-only
// order never takes, so no fill is expected.
//
// What happens: a post-only GTD BUY of 100 shares at 0.005 on a market you name, living 300 seconds. The
// relay prepares it (floors, cap rule, XO's clock for the expiry), you sign the Kernel-wrapped digest once,
// the relay submits it ONCE (wire prefix 0x01; 0x00 only after an explicit signature rejection), the kit
// follows it by order hash, finds it in the open-orders list, cancels it by hash, and confirms it is gone.
// What the gateway accepted (prefix, digest form, cancel body) is recorded by the relay as capability facts
// and shown here.
//
// Optional (--probes): the sub-floor probes of the table, which the relay's conservative floors cannot send:
// 10 shares at 0.03 ($0.30), 1 share at 0.01, and the same $0.30 order living 60, 30 and 15 seconds, each
// signed by you and sent by the kit straight to the gateway (outside the relay's records and ledger, at most
// $0.33 each, cancelled at once if taken), then the first probe's bytes sent again as a deliberate duplicate
// (OR13). A rejection costs nothing and its text is the finding. See lib/probes.ts.
//
// Stop rule: any ambiguous result is reconciled by order hash, never resent. The transport refuses a second
// POST /order and a second submit (apart from the one deliberate duplicate probe).

const SLUG = "t3b-first-order";
const DEFAULT_PRICE = "0.005";
const DEFAULT_SHARES = "100";
const DEFAULT_TTL_S = 300;
const CEILING_USD = "0.55";
const PROBE_CEILING_USD = "0.66";

export const spec: TestSpec = {
  id: "T3b",
  slug: SLUG,
  title: "First order",
  settles: ["OR3", "OR4", "OR6", "OR11", "OR12", "OR13", "OR14", "OR17", "gate 2"],
  worstCaseUsd: PROBE_CEILING_USD,
  costNote: "$0.50 locked while a post-only order rests, $0.55 counting the cap multiplier; released when it is cancelled; no fill expected. --probes adds orders of at most $0.33 each, two at once for the duplicate probe ($0.66)",
  stopRule: "any ambiguous result: reconcile by order hash, no resend",
  preconditions: [
    PRECONDITION_DEDICATED,
    PRECONDITION_PAYBOX_APPROVAL,
    PRECONDITION_T1,
    PRECONDITION_T2,
    "T3a passed: the account has at least $1 credited on the orderbook (the order needs $0.55 of it).",
    "You name a liquid, active market with --token-id (the decimal token id of its Yes or No side). The market's title is never shown here: it is text from strangers.",
    PRECONDITION_NO_RELAY_RUNNING,
  ],
  flagsToArm: ["ENABLE_TRADING"],
  steps: [
    {
      id: "status",
      title: "Read the account: registered, trading enabled, credentials validated, balance covers the order",
      calls: [
        { via: "relay", method: "POST", target: "/v1/account/status" }, { via: "xo", method: "POST", target: "https://rpc-mainnet-2.xo.market/ (eth_getCode, allowance reads)", note: "reads only; the relay falls back to explorer logs" },
        { via: "xo", method: "GET", target: "https://orderbooks.xo.market/balance-allowance" },
      ],
    },
    { id: "market", title: "Look at the book of the market (numbers only)", calls: [{ via: "xo", method: "GET", target: "https://orderbooks.xo.market/book?token_id=..." }] },
    {
      id: "prepare",
      title: "Prepare the order (floors, the cap rule, XO's clock for the expiry); nothing is signed or sent",
      exposureUsd: CEILING_USD,
      calls: [
        { via: "relay", method: "POST", target: "/v1/order/prepare", note: "post-only GTD BUY, 300 s" },
        { via: "xo", method: "GET", target: "https://orderbooks.xo.market/time", note: "XO's clock" },
        { via: "xo", method: "GET", target: "https://explorer-mainnet.xo.market/api (the maker's nonce)", note: "read" },
      ],
    },
    { id: "sign", title: "Sign the Kernel-wrapped order digest once with PayBox", calls: [{ via: "operator", method: "-", target: "PayBox request_wallet_sign, intent op typedData (or raw once PB2 says so)" }] },
    {
      id: "submit",
      title: "Submit once (never retried; a swap of the 0x01 prefix happens only after an explicit signature rejection)",
      write: true,
      calls: [
        { via: "relay", method: "POST", target: "/v1/order/submit" },
        { via: "xo", method: "POST", target: "https://orderbooks.xo.market/order", note: "L2 signed; the one write (two if the prefix has to be swapped)" },
      ],
    },
    {
      id: "check",
      title: "Follow the order by hash and find it in the open-orders list",
      calls: [
        { via: "relay", method: "GET", target: "/v1/order/:hash", note: "repeated" },
        { via: "relay", method: "POST", target: "/v1/orders/list" },
        { via: "xo", method: "GET", target: "https://orderbooks.xo.market/orders", note: "L2 signed, no query string" },
      ],
    },
    {
      id: "cancel",
      title: "Cancel it by hash and confirm it is gone",
      write: true,
      calls: [
        { via: "relay", method: "POST", target: "/v1/order/cancel" },
        { via: "xo", method: "DELETE", target: "https://orderbooks.xo.market/order", note: "L2 signed; one cancel (the relay may try the other documented body forms)" },
      ],
    },
    {
      id: "probes",
      title: "Probes: the sub-floor and lifetime orders, then a deliberate duplicate (each probe is one more signature from you)",
      write: true,
      exposureUsd: MAX_PROBE_OUTLAY_USD,
      when: "only with --probes",
      calls: [
        { via: "xo", method: "GET", target: "https://orderbooks.xo.market/time" },
        { via: "operator", method: "-", target: "PayBox request_wallet_sign, op typedData, once per probe (5)" },
        { via: "xo", method: "POST", target: "https://orderbooks.xo.market/order", note: "straight to the gateway, outside the relay's ledger; the 6th POST repeats the first on purpose" },
        { via: "xo", method: "DELETE", target: "https://orderbooks.xo.market/order", note: "at once for any probe the gateway takes" },
      ],
    },
  ],
  flags: [
    { name: "probes", kind: "bool", help: "Also send the sub-floor and duplicate probes (each probe is one more signature from you; see lib/probes.ts)." },
    { name: "token-id", kind: "decimal", help: "The decimal token id of the market side to rest the order on (required on the live target)." },
    { name: "price", kind: "decimal", help: "Price per share, such as 0.005 (default 0.005). Far from the market on purpose.", defaultValue: DEFAULT_PRICE },
    { name: "shares", kind: "decimal", help: "Shares (default 100).", defaultValue: DEFAULT_SHARES },
  ],
  needs: { relay: true, credentialStore: true, xoChain: true, baseChain: false, arrange: ["trading_enabled", "funded", "credentials", "market"] },
  writes: [],
  writesFor: (opts: Options) =>
    extraBool(opts, "probes")
      ? [
          { label: "relay POST /v1/order/submit", max: 1 },
          { label: "orderbook POST /order", max: 8, allowDuplicate: true },
          { label: "relay POST /v1/order/cancel", max: 1 },
          { label: "orderbook DELETE /order", max: 10, allowDuplicate: true },
        ]
      : [
          { label: "relay POST /v1/order/submit", max: 1 },
          { label: "orderbook POST /order", max: 2 },
          { label: "relay POST /v1/order/cancel", max: 1 },
          { label: "orderbook DELETE /order", max: 3 },
        ],
  exposureUsd: (opts: Options) => {
    const main = maxBuyOutlayUsd(extraString(opts, "price") ?? DEFAULT_PRICE, extraString(opts, "shares") ?? DEFAULT_SHARES);
    return extraBool(opts, "probes") && (parseUsdMicro(main) ?? 0n) < (parseUsdMicro(PROBE_CEILING_USD) as bigint) ? PROBE_CEILING_USD : main;
  },
  checkOptions: (opts, target) => {
    if (target === "live" && extraString(opts, "token-id") === undefined) return "--token-id is required on the live target: the decimal token id of an active, liquid market.";
    const price = extraString(opts, "price") ?? DEFAULT_PRICE;
    if (!/^0\.[0-9]{1,3}$/.test(price) || !/[1-9]/.test(price)) return "--price must look like 0.005 (a price between 0.001 and 0.999).";
    const shares = extraString(opts, "shares") ?? DEFAULT_SHARES;
    if (!/^[0-9]{1,9}(\.[0-9]{1,3})?$/.test(shares) || !/[1-9]/.test(shares)) return "--shares must be a plain number such as 100.";
    return undefined;
  },
  run,
};

function learned(ctx: RunContext, id: string): string {
  const fact = ctx.services?.services.capabilities.fact(id);
  return fact === undefined ? "unknown" : `${fact.state}${fact.value === undefined ? "" : ` (${fact.value})`}`;
}

async function run(ctx: RunContext): Promise<TestResult> {
  const withObservations = (result: Omit<TestResult, "observations">): TestResult => ({ ...result, observations: ctx.observations() });
  const price = extraString(ctx.opts, "price") ?? DEFAULT_PRICE;
  const shares = extraString(ctx.opts, "shares") ?? DEFAULT_SHARES;
  const tokenId = tokenIdFor(ctx, extraString(ctx.opts, "token-id"));
  const cap = maxBuyOutlayUsd(price, shares);

  ctx.step("status");
  const before = await accountStatus(ctx);
  ctx.observe("account", `${ctx.account} (derived from ${ctx.owner})`);
  ctx.observe("before", describeStatus(before));
  if (!before.flags.ENABLE_TRADING) ctx.stop("flag_off", "ENABLE_TRADING is not effective in this relay (check KILL and the tripwires); an order would be refused.");
  const notReady = [
    before.state === "registered" ? undefined : `the orderbook does not know the account (${before.state}): door (b) is closed`,
    before.trading_enabled === "yes" ? undefined : `trading is not enabled (${before.trading_enabled})`,
    before.credentials.state === "validated" ? undefined : `credentials are ${before.credentials.state}: run T2`,
    before.balance_usd !== null && (parseUsdMicro(before.balance_usd) ?? 0n) >= (parseUsdMicro(cap) ?? 0n) ? undefined : `the credited balance (${before.balance_usd ?? "unread"} USD) does not cover $${cap}: run T3a`,
  ].filter((entry): entry is string => entry !== undefined);
  if (notReady.length > 0) {
    return withObservations({ verdict: "inconclusive", summary: `Not ready for a first order: ${notReady.join("; ")}. Nothing was signed or sent.`, facts: [] });
  }

  ctx.step("market");
  await showBook(ctx, tokenId);

  ctx.step("prepare");
  const prepared = await prepareOrder(ctx, { tokenId, side: "BUY", price, shares, tif: "GTD", ttlS: DEFAULT_TTL_S, postOnly: true });
  if (!prepared.ok) {
    ctx.observe("prepare refused", `${prepared.error.code}: ${cleanLine(prepared.error.message, 240)}`);
    return withObservations({ verdict: "inconclusive", summary: `The relay would not prepare the order: ${cleanLine(prepared.error.message, 240)} Nothing was signed or sent.`, facts: [] });
  }

  const placed = await signAndSubmitOrder(ctx, prepared.item, `Rest a post-only BUY of ${shares} at ${price} for 300 seconds (Kernel-wrapped order digest)`, { sign: () => ctx.step("sign"), submit: () => ctx.step("submit") });
  if ("refused" in placed) {
    ctx.observe("submit refused", `${placed.refused.code}: ${cleanLine(placed.refused.message, 240)}`);
    return withObservations({ verdict: "fail", summary: `The relay would not submit: ${cleanLine(placed.refused.message, 240)} Nothing is sent again.`, facts: [{ id: "T3b", state: "no", note: `submit refused (${placed.refused.code}): ${cleanLine(placed.refused.message, 140)}` }] });
  }
  ctx.observe("submit", `${placed.state}${placed.detail === undefined ? "" : `: ${cleanLine(placed.detail, 200)}`} (order ${placed.orderHash})`);
  if (placed.state === "rejected") {
    return withObservations({
      verdict: "fail",
      summary: `The gateway rejected the order: ${cleanLine(placed.detail ?? "no reason given", 240)} Nothing rests. The text is the finding: it names a floor or a rule.`,
      facts: [{ id: "T3b", state: "no", note: `rejected: ${cleanLine(placed.detail ?? "", 150)}` }],
    });
  }

  ctx.step("check");
  // accepted, pending or ambiguous: look by hash; never send again.
  const followed = await followOrder(ctx, placed.orderHash, (state) => state === "open" || state === "partially_filled" || state === "filled" || state === "rejected" || state === "cancelled" || state === "expired", 60_000, 5_000);
  ctx.observe("order", `${followed.state}${followed.remaining === undefined ? "" : `, remaining ${followed.remaining}`}${followed.detail === undefined ? "" : ` (${cleanLine(followed.detail, 120)})`}`);
  if (followed.state === "rejected") {
    return withObservations({ verdict: "fail", summary: `The order was rejected after it was sent: ${cleanLine(followed.detail ?? "", 240)}`, facts: [{ id: "T3b", state: "no", note: `rejected after submit: ${cleanLine(followed.detail ?? "", 140)}` }] });
  }
  if (followed.state !== "open" && followed.state !== "partially_filled") {
    return withObservations({
      verdict: "inconclusive",
      summary: `The order is ${followed.state}${followed.timedOut ? " after a minute" : ""}. It is NOT sent again. Reconcile by order hash ${placed.orderHash}: the open-orders list and GET /orders/{hash}.`,
      facts: [],
    });
  }
  const listed = await listHas(ctx, placed.orderHash);
  ctx.observe("open-orders list", `${listed.has ? "contains the order" : "does NOT contain the order"} (${String(listed.count)} open)`);

  ctx.step("cancel");
  const cancelled = await cancelOrder(ctx, placed.orderHash);
  ctx.observe("cancel", `${cancelled.state}${cancelled.detail === undefined ? "" : `: ${cleanLine(cancelled.detail, 160)}`}`);
  const gone = await followOrder(ctx, placed.orderHash, (state) => state === "cancelled" || state === "expired" || state === "filled", 60_000, 5_000);
  ctx.observe("after the cancel", `${gone.state}${gone.timedOut ? " (still not final after a minute)" : ""}`);
  const after = await accountStatus(ctx);
  ctx.observe("after", describeStatus(after));
  ctx.observe("OR3 wire prefix", learned(ctx, "OR3"));
  ctx.observe("OR4 digest form", learned(ctx, "OR4"));
  ctx.observe("OR11 cancel body", learned(ctx, "OR11"));
  ctx.observe("OR6 size/notional floor", learned(ctx, "OR6"));
  ctx.observe("OR17 lifetime floor", learned(ctx, "OR17"));

  const facts: FactProposal[] = [];
  if (listed.has && cancelled.state === "cancelled" && gone.state === "cancelled") {
    facts.push({ id: "T3b", state: "yes", note: `a post-only order was accepted, listed, cancelled by hash and gone; prefix ${learned(ctx, "OR3")}, digest form ${learned(ctx, "OR4")}, cancel ${learned(ctx, "OR11")}`.slice(0, 190) });
    if (extraBool(ctx.opts, "probes")) {
      ctx.step("probes");
      facts.push(...(await runProbes(ctx, tokenId)));
    }
    return withObservations({ verdict: "pass", summary: `The first order works end to end: accepted, listed, cancelled by hash. Reserved ${usd(parseUsdMicro(cap) ?? 0n)} USD at most, released after the order's expiry.`, facts });
  }
  return withObservations({
    verdict: "fail",
    summary: `The order was accepted but the lifecycle did not complete (listed ${String(listed.has)}, cancel ${cancelled.state}, final ${gone.state}). It expires by itself within 300 seconds of its preparation. Nothing is sent again.`,
    facts: [{ id: "T3b", state: "no", note: `listed ${String(listed.has)}, cancel ${cancelled.state}, final ${gone.state}` }],
  });
}

// ---- the optional probes ---------------------------------------------------------------------------------------------

async function runProbes(ctx: RunContext, tokenId: string): Promise<FactProposal[]> {
  const results = new Map<string, ProbeResult>();
  for (const probe of FLOOR_PROBES) {
    const result = await sendFloorProbe(ctx, tokenId, probe);
    results.set(probe.id, result);
    ctx.observe(`probe ${probe.id} answer`, `${result.accepted ? "ACCEPTED" : "refused"} (HTTP ${result.status === undefined ? "none" : String(result.status)}): ${result.text}${result.accepted ? `; cancelled ${result.cancelled === undefined ? "?" : String(result.cancelled)}` : ""}`);
  }
  const facts: FactProposal[] = [];
  const took = (id: string): boolean => results.get(id)?.accepted === true;
  const refusedText = (id: string): string => cleanLine(results.get(id)?.text ?? "", 100);
  // OR6: what the gateway took of the sizes.
  if (took("tiny_001")) facts.push({ id: "OR6", state: "yes", value: "no_floor_at_0.01usd", note: "the gateway took 1 share at 0.01 ($0.01): no practical size floor" });
  else if (took("notional_030")) facts.push({ id: "OR6", state: "yes", value: "floor_in_0.01_to_0.30usd", note: `taken at $0.30, refused at $0.01: ${refusedText("tiny_001")}` });
  else facts.push({ id: "OR6", state: "yes", value: "floor_above_0.30usd", note: `refused even at $0.30: ${refusedText("notional_030")}` });
  // OR17: the shortest life it took, drawn from the time the order really had left when it arrived. A signature
  // that came too late (a human approving a 15 second order) proves nothing about the floor.
  const lives = ["life_15", "life_30", "life_60"].map((id) => results.get(id)).filter((entry): entry is ProbeResult => entry !== undefined);
  const effective = (entry: ProbeResult): number => Math.min(entry.probe.ttlS, entry.remainingS);
  const taken = lives.filter((entry) => entry.accepted).map(effective);
  if (taken.length > 0) {
    const shortest = Math.min(...taken);
    facts.push({ id: "OR17", state: "yes", value: `gtd_min_le_${String(shortest)}s`, note: `the gateway took a GTD order with ${String(shortest)} seconds left` });
  } else {
    const sixty = results.get("life_60");
    if (sixty !== undefined && sixty.remainingS >= sixty.probe.ttlS) facts.push({ id: "OR17", state: "yes", value: "gtd_min_gt_60s", note: `refused at 60, 30 and 15 seconds: ${refusedText("life_60")}` });
    else ctx.observe("OR17", "not concluded: the 60 second probe arrived with less than 60 seconds left (the signature took too long), so its refusal says nothing about the floor. Read the refusal text above.");
  }
  // OR13: the deliberate duplicate, on the first probe the gateway took.
  const first = FLOOR_PROBES.map((probe) => results.get(probe.id)).find((result) => result?.accepted === true && result.body !== undefined);
  if (first !== undefined) {
    const again = await repostDuplicate(ctx, first);
    ctx.observe("duplicate probe answer", `${again.accepted ? "ACCEPTED again" : "refused"} (HTTP ${again.status === undefined ? "none" : String(again.status)}): ${again.text}`);
    facts.push({ id: "OR13", state: "yes", value: again.accepted ? "duplicate_accepted" : "duplicate_refused", note: `the same signed bytes sent twice: ${again.accepted ? "accepted again" : "refused"} (${again.text})`.slice(0, 190) });
  } else {
    ctx.observe("duplicate probe", "skipped: the gateway took none of the probes");
  }
  return facts;
}

// The best bid and ask as numbers. Market text is never shown.
async function showBook(ctx: RunContext, tokenId: string): Promise<void> {
  const upstream = ctx.services?.services.upstream;
  if (upstream === undefined) return;
  try {
    const response = await upstream.request({ method: "GET", url: `https://orderbooks.xo.market/book?token_id=${tokenId}`, purpose: "kit_book" });
    const json = upstream.json(response) as { bids?: Array<{ price?: unknown }>; asks?: Array<{ price?: unknown }> };
    const best = (side: Array<{ price?: unknown }> | undefined): string => (Array.isArray(side) && side.length > 0 && (typeof side[0]?.price === "string" || typeof side[0]?.price === "number") ? String(side[0]?.price).slice(0, 12) : "none");
    ctx.observe("book", `best bid ${best(json.bids)}, best ask ${best(json.asks)}`);
  } catch {
    ctx.observe("book", "could not be read (the relay reads it itself when it prepares)");
  }
}

if (isEntryPoint(import.meta.url)) await main(spec, process.argv.slice(2));
