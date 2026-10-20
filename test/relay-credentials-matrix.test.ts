import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { Hex } from "viem";

import { POST_ROUTES } from "../src/relay/contract.js";
import { routes as healthRoutes } from "../relay/health.js";
import { createAccountDirectory, l2Request } from "../relay/credentials.js";
import { MOCK_SWITCHES, MOCK_SWITCH_NAMES, OPTIMISTIC_PROFILE, PESSIMISTIC_PROFILE, type MockProfileName, type MockSwitchName } from "./mock-xo/switches.js";
import type { MockXo } from "./mock-xo/server.js";
import { createCredentials, traderFor } from "./mock-xo/traders.js";
import { useMock } from "./mock-xo/testing.js";
import { readAll } from "./relay-core-helpers.js";
import {
  connect,
  createWorld,
  deployed,
  expectRelayError,
  factOf,
  l2Requests,
  leaksIn,
  mintedKeys,
  prepareLogin,
  requestsTo,
  signDigest,
  statusRecord,
  storedTriplet,
  submitLogin,
  type Owner,
  type World,
} from "./relay-credentials-helpers.js";

// The profile matrix for the credential flow (docs/phase1-gap-closing.md 5.6, D9): the whole flow in the
// pessimistic profile, in the optimistic profile, and with each switch that touches it flipped alone, from
// either profile. The acceptance for every cell is the same: at most one key is ever created, the triplet is
// on disk before it is used, at most six probe requests, nothing deleted, the recorded facts are exactly
// what this server does, and no secret is left anywhere.

// Switches that touch the credential path, and one line on how. Everything else in the mock's table has no
// effect on login, key creation or the HMAC probes; the test below pins that classification, so a switch
// added to the table has to be put on one side or the other on purpose.
const RELEVANT: Readonly<Partial<Record<MockSwitchName, string>>> = {
  "l1.undeployed": "L1 for an account without code (the relay never asks for one)",
  "auth.derive_returns_secret": "whether derive shows the secret again (AU2)",
  "auth.max_keys": "the key cap (AU4)",
  "auth.delete_level": "DELETE /auth/api-key (the relay never deletes)",
  "hmac.target": "the signed target (OR10)",
  "hmac.decode": "key decoding and padding (OR10)",
  "l2.required_on_post": "L2 on POST /order (a later stream)",
  "l2.xo_address": "XO_ADDRESS on L2 (OR9)",
  "registry.trigger": "when the account becomes registered (AD4)",
  "rpc.access": "the optional XO node (UO9)",
};

const DECODE_TOKEN: Readonly<Record<string, string>> = { stripped: "b64url-stripped", raw: "raw-padded", "b64url-decoded-padded": "b64url-padded" };

interface Cell {
  readonly base: MockProfileName;
  readonly flip?: { readonly name: MockSwitchName; readonly value: string };
}

function label(cell: Cell): string {
  return cell.flip === undefined ? `${cell.base} profile` : `${cell.base} profile with ${cell.flip.name} = ${cell.flip.value}`;
}

function cells(): Cell[] {
  const out: Cell[] = [{ base: "pessimistic" }, { base: "optimistic" }];
  for (const base of ["pessimistic", "optimistic"] as const) {
    const profile = base === "pessimistic" ? PESSIMISTIC_PROFILE : OPTIMISTIC_PROFILE;
    for (const name of Object.keys(RELEVANT) as MockSwitchName[]) {
      const definition = MOCK_SWITCHES.find((entry) => entry.name === name)!;
      for (const value of definition.values) if (value !== profile[name]) out.push({ base, flip: { name, value } });
    }
  }
  return out;
}

function apply(mock: MockXo, cell: Cell): void {
  mock.setProfile(cell.base);
  if (cell.flip !== undefined) (mock.setSwitch as (name: string, value: string) => void)(cell.flip.name, cell.flip.value);
}

async function accountStatus(world: World, owner: Owner, rpcUrl?: string): Promise<{ state: string; registered: boolean; trading_enabled: string; credentials: { state: string; key_tag: string | null } }> {
  (world.services as { accounts?: unknown }).accounts = createAccountDirectory({ upstream: world.upstream, ...(rpcUrl === undefined ? {} : { rpcUrl }) });
  const body = POST_ROUTES["/v1/account/status"].request.parse({ owner: owner.address });
  return POST_ROUTES["/v1/account/status"].response.parse(await healthRoutes["POST /v1/account/status"]!(body, world.context()));
}

describe("the switch classification", () => {
  it("every switch of the mock is classified: relevant to the credential path, or listed here as not", () => {
    const IRRELEVANT: readonly MockSwitchName[] = [
      "bundler.foreign_account", "bundler.paymasterless", "bundler.estimate", "bundler.shape", "paymaster.state",
      "order.min_size", "order.min_notional", "order.gtd_min", "order.sig_forms", "order.prefix", "order.dup_key_includes_sig",
      "cancel.body", "cancel.batch_hmac_only", "engine.taker_delay", "engine.balance_drop",
      "funding.credit", "withdraw.paymasterless", "meta.foreign_uri", "seed.on_pending", "faults",
    ];
    const classified = new Set<string>([...Object.keys(RELEVANT), ...IRRELEVANT]);
    assert.deepEqual(MOCK_SWITCH_NAMES.filter((name) => !classified.has(name)), [], "a new switch needs a place");
    for (const name of classified) assert.ok(MOCK_SWITCH_NAMES.includes(name as MockSwitchName), `${name} is not a switch of the mock`);
    assert.equal(Object.keys(RELEVANT).length + IRRELEVANT.length, MOCK_SWITCH_NAMES.length);
  });
});

describe("the credential flow across the profile matrix", () => {
  const harness = useMock({ chains: { xo: true, base: false } });

  for (const cell of cells()) {
    harness.it(`connects and validates: ${label(cell)}`, async (mock, t) => {
      apply(mock, cell);
      const world = await createWorld(mock, t);
      const owner = await deployed(mock, 0);
      const effective = { decode: mock.switches.get("hmac.decode"), target: mock.switches.get("hmac.target"), derive: mock.switches.get("auth.derive_returns_secret"), trigger: mock.switches.get("registry.trigger") };

      const { prepared, signature, result } = await connect(world, owner);

      // At most one create, ever; nothing deleted; the key is the one the mock minted.
      assert.equal(requestsTo(world, "POST", "/auth/api-key").length, 1);
      assert.equal(mintedKeys(mock), 1);
      assert.deepEqual(world.sent.filter((entry) => entry.method === "DELETE"), []);
      const minted = mock.write.credentials[0]!;
      assert.deepEqual(await storedTriplet(world, owner), { apiKey: minted.apiKey, secret: minted.secret, passphrase: minted.passphrase });

      // Persist before use: no signed request left before the triplet was on disk; every probe used the stored one.
      const probes = l2Requests(world);
      assert.ok(probes.length >= 1 && probes.length <= 6, `${String(probes.length)} probe requests`);
      assert.ok(probes.every((entry) => entry.tripletOnDisk === true));
      assert.ok(world.sent.filter((entry) => entry.method === "POST").every((entry) => entry.tripletOnDisk === false), "the create left before any triplet existed, as it must");
      assert.ok(probes.every((entry) => entry.path === "/auth/api-keys" || entry.path === "/orders"));

      // The facts are exactly what this server does.
      assert.deepEqual(factOf(world, "OR10"), { state: "yes", value: `${DECODE_TOKEN[effective.decode]!}:${effective.target}:addr-yes`, source: "probe" });
      assert.deepEqual(factOf(world, "AU2"), { state: effective.derive === "yes" ? "yes" : "no", value: undefined, source: "probe" });
      assert.deepEqual(factOf(world, "AU6"), { state: "yes", value: "kernel-on:sig-86:addr-yes", source: "probe" });
      assert.deepEqual(statusRecord(world, owner), { state: "validated", key_tag: result.key_tag });

      // The relay can now make signed calls in whatever form this server wants.
      assert.equal((await l2Request(world.context(), { account: owner.smart, method: "GET", path: "/orders", query: "limit=2", purpose: "orders_list" })).status, 200);
      assert.equal((await l2Request(world.context(), { account: owner.smart, method: "GET", path: "/auth/api-keys", purpose: "keys_list" })).status, 200);

      // The account status: registered exactly when this server's rule says so (deployed, trading enabled, a key created).
      const status = await accountStatus(world, owner);
      assert.equal(status.registered, effective.trigger !== "never");
      assert.equal(status.state, effective.trigger === "never" ? "deployed_unregistered" : "registered");
      assert.equal(status.trading_enabled, "yes");
      assert.deepEqual(status.credentials, { state: "validated", key_tag: result.key_tag });

      // Nothing secret is anywhere: not in any response, any log line, any alert, any file in the data directory.
      const secrets = {
        apiKey: minted.apiKey,
        secret: minted.secret,
        passphrase: minted.passphrase,
        ownerSignature: signature as string,
        ...Object.fromEntries(probes.map((entry, index) => [`hmac${String(index)}`, entry.headers["xo_signature"] as string])),
        ...Object.fromEntries(requestsTo(world, "GET", "/auth/derive-api-key").map((entry, index) => [`l1wire${String(index)}`, entry.headers["xo_signature"] as string])),
      };
      const text = [JSON.stringify(prepared), JSON.stringify(result), JSON.stringify(status), ...world.audit.lines, JSON.stringify(world.alerts.raised), JSON.stringify(world.capabilities.all())].join("\n");
      assert.deepEqual(leaksIn("responses and logs", text, secrets), []);
      const leaks = (await readAll(world.dir.dir)).flatMap((file) => leaksIn(file.path.slice(world.dir.dir.length + 1), file.bytes, secrets));
      assert.deepEqual(leaks, []);
    });
  }

  for (const rpc of ["open", "requires-key", "down"] as const) {
    harness.it(`the account status with the XO node ${rpc} says the same thing as without it`, async (mock, t) => {
      mock.setSwitch("rpc.access", rpc);
      const world = await createWorld(mock, t);
      const owner = await deployed(mock, 0);
      const without = await accountStatus(world, owner);
      const withNode = await accountStatus(world, owner, "https://rpc-mainnet-2.xo.market/");
      assert.deepEqual({ ...withNode, upstream: undefined }, { ...without, upstream: undefined });
    });
  }

  // derive x cap, with a key that already exists (the app's, or an earlier run's).
  const EXPECTED = {
    "yes/1": "adopted",
    "yes/5": "adopted",
    "no/1": "limit",
    "no/5": "second key",
  } as const;
  for (const derive of ["yes", "no"] as const) {
    for (const cap of ["1", "5"] as const) {
      harness.it(`an account that already has a key: derive shows the secret = ${derive}, key cap = ${cap}`, async (mock, t) => {
        mock.setSwitch("auth.derive_returns_secret", derive);
        mock.setSwitch("auth.max_keys", cap);
        const world = await createWorld(mock, t);
        const owner = await deployed(mock, 0);
        const existing = await createCredentials(mock, traderFor(mock, owner.index));
        const prepared = await prepareLogin(world, owner);
        const submit = submitLogin(world, prepared.prepared_id, await signDigest(owner, prepared.sign.expected_digest as Hex, "raw"));
        const outcome = EXPECTED[`${derive}/${cap}`];
        if (outcome === "limit") {
          await expectRelayError(submit, "precondition_failed", { reason: "key_limit_reached" });
          assert.equal(mintedKeys(mock), 1);
          assert.equal(await storedTriplet(world, owner), undefined);
        } else {
          await submit;
          assert.equal(mintedKeys(mock), outcome === "adopted" ? 1 : 2);
          assert.equal(requestsTo(world, "POST", "/auth/api-key").length, outcome === "adopted" ? 0 : 1);
          const stored = await storedTriplet(world, owner);
          assert.equal(stored?.apiKey, outcome === "adopted" ? existing.apiKey : mock.write.credentials[1]!.apiKey);
          assert.equal(statusRecord(world, owner)?.state, "validated");
        }
        assert.ok(requestsTo(world, "POST", "/auth/api-key").length <= 1);
      });
    }
  }
});
