import type { Hex } from "viem";

import { ECDSA_VALIDATOR } from "../../src/xo/chain/constants.js";
import { extraString } from "./lib/args.js";
import { accountStatus, connectCredentials, describeStatus, restoreDrill, StepFailed } from "./lib/flows.js";
import { isEntryPoint, main } from "./lib/harness.js";
import { cleanLine } from "./lib/redact.js";
import { PRECONDITION_DEDICATED, PRECONDITION_NO_RELAY_RUNNING, PRECONDITION_PAYBOX_APPROVAL, PRECONDITION_T1 } from "./lib/text.js";
import type { FactProposal, RunContext, TestResult, TestSpec } from "./lib/types.js";

// T2  Credentials and gateway probes                                        docs/phase1-gap-closing.md section 6
//
// Settles: AU1 to AU4, OR9, OR10, doors (b) and (c). Cost: $0; it uses the account's one key slot (the cap
// is unknown). Gated on a verified restore: the credential store is drilled first, because a lost HMAC
// triplet is unrecoverable (AU3) and the kit never deletes or rotates keys.
//
// What happens: the relay prepares the ClobAuth login for the account (XO's own clock, a 90 s life), you
// sign it ONCE with PayBox within that time, and the relay runs XO's key flow by itself: derive first (a 404
// is expected), at most ONE key creation, the triplet persisted (encrypted, backup first) before anything
// else, then at most 4 + 2 signed GET probes that settle how XO decodes the secret and whether it signs the
// query (OR10), and one more derive to learn whether derive hands the secret back (AU2). The accepted L1
// form (Kernel wrap on or off, 86, 66 or 65 signature bytes, XO_ADDRESS present or absent) is the explicit
// outcome of this test (amendment A7).
//
// Stop rule: stop after 6 failed probes; never create a second key. The kit enforces both on the wire,
// whatever the relay does: a second POST /auth/api-key and a seventh probe are not sent.

const SLUG = "t2-credentials";
const PROBE_CAP = 6;

export const spec: TestSpec = {
  id: "T2",
  slug: SLUG,
  title: "Credentials and gateway probes",
  settles: ["AU1", "AU2", "AU3", "AU4", "OR9", "OR10", "door (b)", "door (c)"],
  worstCaseUsd: "0",
  costNote: "nothing is spent; it uses the account's one key slot (the cap is unknown) and never makes a second key",
  stopRule: "stop after 6 failed probes; never create a second key",
  preconditions: [
    PRECONDITION_DEDICATED,
    PRECONDITION_PAYBOX_APPROVAL,
    PRECONDITION_T1,
    "You can sign within about 90 seconds of the prepare step: XO accepts a login for about 120 seconds, and the relay keeps a login item for 90.",
    "The relay's master secret is in RELAY_MASTER_KEY (or you are asked for it when this runs on a terminal). Keep a copy somewhere safe: without it the stored XO credentials cannot be opened.",
    PRECONDITION_NO_RELAY_RUNNING,
  ],
  flagsToArm: ["ENABLE_TRADING"],
  steps: [
    {
      id: "status",
      title: "Read the account: it must be deployed, with no credentials yet",
      calls: [
        { via: "relay", method: "POST", target: "/v1/account/status" }, { via: "xo", method: "POST", target: "https://rpc-mainnet-2.xo.market/ (eth_getCode, allowance reads)", note: "reads only; the relay falls back to explorer logs" },
        { via: "xo", method: "GET", target: "https://explorer-mainnet.xo.market/api (deployment logs)" },
        { via: "xo", method: "GET", target: "https://orderbooks.xo.market/balance-allowance (the registry check)" },
      ],
    },
    { id: "drill", title: "Restore drill: seal a secret, lose its file, restore it from the encrypted backup", calls: [{ via: "operator", method: "-", target: "local files only: the relay's credential store" }] },
    {
      id: "prepare",
      title: "Prepare the login (ClobAuth, wrapped for your account), timestamp from XO's own clock",
      calls: [
        { via: "relay", method: "POST", target: "/v1/auth/prepare" },
        { via: "xo", method: "GET", target: "https://orderbooks.xo.market/time" },
      ],
    },
    { id: "sign", title: "Sign the login once with PayBox within 90 seconds", calls: [{ via: "operator", method: "-", target: "PayBox request_wallet_sign, typedData (or raw once PB2 says so)" }] },
    {
      id: "submit",
      title: "Submit once: the relay derives, creates at most one key, stores it, probes, derives again",
      write: true,
      calls: [
        { via: "relay", method: "POST", target: "/v1/auth/submit" },
        { via: "xo", method: "GET", target: "https://orderbooks.xo.market/auth/derive-api-key", note: "L1; a 404 is expected" },
        { via: "xo", method: "POST", target: "https://orderbooks.xo.market/auth/api-key", note: "L1; AT MOST ONE, ever" },
        { via: "xo", method: "GET", target: "https://orderbooks.xo.market/auth/api-keys", note: "L2 probe A, at most 4" },
        { via: "xo", method: "GET", target: "https://orderbooks.xo.market/orders", note: "L2 probe B, at most 2; no query string" },
      ],
    },
    {
      id: "facts",
      title: "Read what the relay learned: derive returns the secret (AU2), the accepted L1 form (AU6), the HMAC form (OR10)",
      calls: [{ via: "relay", method: "POST", target: "/v1/account/status", note: "credentials, capability facts, registry" }, { via: "xo", method: "POST", target: "https://rpc-mainnet-2.xo.market/ (eth_getCode, allowance reads)", note: "reads only; the relay falls back to explorer logs" }],
    },
    {
      id: "l2-on-post",
      title: "POST /order with a deliberately invalid signature and NO L2 headers: is L2 required on order intake (OR9)?",
      write: true,
      when: "only with --probe-l2-on-post (your call; it cannot place an order)",
      calls: [{ via: "xo", method: "POST", target: "https://orderbooks.xo.market/order", note: "invalid signature, no L2 headers, never accepted" }],
    },
  ],
  flags: [
    { name: "probe-l2-on-post", kind: "bool", help: "Also send one POST /order with an invalid signature and no L2 headers, to learn whether L2 is required on order intake (OR9). It cannot place an order." },
    { name: "token-id", kind: "decimal", help: "For --probe-l2-on-post: the decimal token id of any active market (the mock fills one in)." },
  ],
  needs: { relay: true, credentialStore: true, xoChain: true, baseChain: false, arrange: ["trading_enabled", "market"] },
  writes: [
    { label: "relay POST /v1/auth/submit", max: 1 },
    { label: "orderbook POST /auth/api-key", max: 1 },
    { label: "orderbook POST /order", max: 1 },
  ],
  readLimits: [
    { name: `signed probes (at most ${String(PROBE_CAP)}, then stop)`, labels: ["orderbook GET /auth/api-keys", "orderbook GET /orders"], max: PROBE_CAP },
    { name: "login (L1) requests (at most 8)", labels: ["orderbook GET /auth/derive-api-key"], max: 8 },
  ],
  exposureUsd: () => "0",
  checkOptions: (opts, target) => {
    if (opts.extra["probe-l2-on-post"] === true && target === "live" && extraString(opts, "token-id") === undefined) return "--probe-l2-on-post needs --token-id on the live target (any active market's decimal token id).";
    return undefined;
  },
  run,
};

function describeFacts(ctx: RunContext): { au2: string; au6: string; or10: string } {
  const registry = ctx.services?.services.capabilities;
  const show = (id: string): string => {
    const fact = registry?.fact(id);
    return fact === undefined ? "unknown" : `${fact.state}${fact.value === undefined ? "" : ` (${fact.value})`}`;
  };
  return { au2: show("AU2"), au6: show("AU6"), or10: show("OR10") };
}

async function run(ctx: RunContext): Promise<TestResult> {
  const withObservations = (result: Omit<TestResult, "observations">): TestResult => ({ ...result, observations: ctx.observations() });

  ctx.step("status");
  const before = await accountStatus(ctx);
  ctx.observe("account", `${ctx.account} (derived from ${ctx.owner})`);
  ctx.observe("before", describeStatus(before));
  if (before.state === "undeployed") {
    return withObservations({ verdict: "inconclusive", summary: "The account is not deployed, so there is nothing to log in with. Run T1 first. Nothing was signed or sent.", facts: [] });
  }
  if (before.credentials.state === "validated" || before.credentials.state === "stored") {
    return withObservations({
      verdict: "inconclusive",
      summary: `Credentials already exist for this account (state ${before.credentials.state}, key ${before.credentials.key_tag ?? "?"}). T2 makes at most one key, ever, and will not make another. Nothing was signed or sent.`,
      facts: [],
    });
  }

  ctx.step("drill");
  const drill = await restoreDrill(ctx);
  ctx.observe("restore drill", drill.detail);
  if (!drill.ok) {
    return withObservations({
      verdict: "stopped",
      summary: `STOP RULE: the restore drill failed (${drill.detail}). T2 is gated on a verified restore, so no key is made. Nothing was signed or sent.`,
      facts: [{ id: "T2", state: "no", note: `restore drill failed: ${drill.detail}`.slice(0, 190) }],
    });
  }

  let keyTag: string;
  try {
    const connected = await connectCredentials(ctx, { prepare: () => ctx.step("prepare"), sign: () => ctx.step("sign"), submit: () => ctx.step("submit") });
    keyTag = connected.keyTag;
  } catch (error) {
    if (error instanceof StepFailed) {
      ctx.observe("connect refused", `${error.failure.code}: ${cleanLine(error.failure.message, 240)}`);
      const rule = error.failure.code === "precondition_failed" || error.failure.code === "upstream_rejected" || error.failure.code === "capability_unknown";
      if (rule) return withObservations({ verdict: "fail", summary: `The relay could not complete the login: ${cleanLine(error.failure.message, 240)}`, facts: [{ id: "T2", state: "no", note: `connect refused (${error.failure.code}): ${cleanLine(error.failure.message, 140)}` }] });
    }
    throw error;
  }
  ctx.observe("key", `stored (tag ${keyTag}); the triplet is encrypted in the data directory and is never printed`);

  ctx.step("facts");
  const after = await accountStatus(ctx);
  ctx.observe("after", describeStatus(after));
  const learned = describeFacts(ctx);
  ctx.observe("AU2 derive returns the secret", learned.au2);
  ctx.observe("AU6 accepted L1 form", learned.au6);
  ctx.observe("OR10 accepted HMAC form", learned.or10);
  ctx.observe("door (b)", after.registered ? "the orderbook knows the account" : "the account is still not registered with the orderbook");

  const facts: FactProposal[] = [];
  const probes = ctx.net.calls.filter((call) => call.phase === "run" && call.status !== undefined && (call.label === "orderbook GET /auth/api-keys" || call.label === "orderbook GET /orders"));
  ctx.observe("signed probes made", String(probes.length));

  if (ctx.opts.extra["probe-l2-on-post"] === true) {
    ctx.step("l2-on-post");
    facts.push(...(await probeL2OnPost(ctx)));
  }

  if (after.credentials.state === "validated") {
    facts.unshift({ id: "T2", state: "yes", note: `credentials stored and validated; L1 form ${learned.au6}; HMAC form ${learned.or10}; derive returns the secret: ${learned.au2}`.slice(0, 190) });
    return withObservations({ verdict: "pass", summary: `Credentials are stored and validated (key ${keyTag}). L1 form: ${learned.au6}. HMAC form: ${learned.or10}.`, facts });
  }
  if (after.credentials.state === "failed") {
    facts.unshift({ id: "T2", state: "no", note: "XO refused every HMAC form the relay tried; the credential is parked as failed" });
    return withObservations({ verdict: "fail", summary: "A key was stored but XO refused every HMAC form the relay tried (state failed). The key is not replaced: look at it by hand.", facts });
  }
  return withObservations({
    verdict: "inconclusive",
    summary: `A key was stored (tag ${keyTag}) but its validation is not finished (state ${after.credentials.state}). Nothing is made again; the relay resumes the probes without a new signature.`,
    facts,
  });
}

// ---- OR9: is L2 required on POST /order? --------------------------------------------------------------------------------------

async function probeL2OnPost(ctx: RunContext): Promise<FactProposal[]> {
  const upstream = ctx.services?.services.upstream;
  const tokenId = extraString(ctx.opts, "token-id") ?? ctx.world.state.tokenId;
  if (upstream === undefined || tokenId === undefined) {
    ctx.observe("OR9", "not probed: no relay or no token id");
    return [];
  }
  const nowS = Math.floor(ctx.clock.nowMs() / 1000);
  // A syntactically complete order whose signature can never verify.
  const order = {
    salt: BigInt(`0x${Buffer.from(ctx.random(8)).toString("hex")}`).toString(),
    maker: ctx.account,
    signer: ctx.account,
    beneficiary: `0x${"00".repeat(20)}`,
    tokenId,
    makerAmount: "50000",
    takerAmount: "5000000",
    expiration: String(nowS + 600),
    nonce: "0",
    identifier: `0x${"00".repeat(16)}`,
    metadata: `0x${"00".repeat(32)}`,
    side: 0,
    signatureType: 3,
    signature: `0x01${ECDSA_VALIDATOR.slice(2).toLowerCase()}${"11".repeat(65)}` as Hex,
  };
  const response = await upstream.request({ method: "POST", url: "https://orderbooks.xo.market/order", body: JSON.stringify({ order, orderType: "GTD" }), purpose: "probe_l2_on_post" }).catch((error: unknown) => error);
  if (response instanceof Error) {
    ctx.observe("OR9", `no usable answer (${response.name})`);
    return [];
  }
  const status = (response as { status: number }).status;
  const text = cleanLine((response as { body?: string }).body ?? "", 160);
  ctx.observe("OR9 answer", `HTTP ${String(status)}: ${text}`);
  if (status === 401 || status === 403) return [{ id: "OR9", state: "yes", note: `an order without L2 headers was refused for authentication (HTTP ${String(status)}): L2 is required on order intake` }];
  if (status === 400 || status === 422) return [{ id: "OR9", state: "no", note: `an order without L2 headers got as far as signature validation (HTTP ${String(status)}): L2 is not required on order intake` }];
  return [];
}

if (isEntryPoint(import.meta.url)) await main(spec, process.argv.slice(2));
