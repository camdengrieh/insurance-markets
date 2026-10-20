import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, stat, writeFile, chmod, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";

import {
  AGENT_TOKEN_FILE,
  AgentTokenStore,
  Auth,
  MAX_PAIR_ATTEMPTS,
  MAX_UI_TOKENS,
  ScopeListError,
  UI_TOKEN_TTL_MS,
  constantTimeEqual,
  effectiveScopes,
  mintAgentToken,
  mintPairCode,
  mintUiToken,
  parseBearer,
  parseScopeList,
  tokenId,
  type InstanceRole,
} from "../../auth.js";
import { AGENT_TOKEN_PATTERN, PAIR_CODE_TTL_S, TOKEN_SCAN_PATTERN, UI_TOKEN_PATTERN, pairCodeSchema } from "../../contract.js";
import { fakeClock, seededRandom } from "./helpers.js";

function makeAuth(role: { value: InstanceRole } = { value: "writer" }, extra: Partial<ConstructorParameters<typeof Auth>[0]> = {}) {
  const clock = fakeClock();
  const auth = new Auth({ clock, random: seededRandom("auth"), instance: () => role.value, ...extra });
  return { auth, clock, role };
}

describe("token shapes", () => {
  const random = seededRandom("shapes");
  it("mints tokens and codes that match the frozen contract patterns", () => {
    assert.match(mintUiToken(random), UI_TOKEN_PATTERN);
    assert.match(mintAgentToken(random), AGENT_TOKEN_PATTERN);
    assert.equal(pairCodeSchema.safeParse(mintPairCode(random)).success, true);
  });
  it("never repeats and the scanner pattern finds a minted token", () => {
    const seen = new Set<string>();
    for (let index = 0; index < 50; index += 1) seen.add(mintUiToken(random));
    assert.equal(seen.size, 50);
    assert.match(`leak: ${mintAgentToken(random)} end`, TOKEN_SCAN_PATTERN);
  });
  it("gives an 8-hex id that is not a prefix of the token", () => {
    const token = mintUiToken(random);
    assert.match(tokenId(token), /^[0-9a-f]{8}$/);
    assert.equal(token.includes(tokenId(token)), false);
  });
});

describe("constantTimeEqual", () => {
  it("is true only for identical strings, whatever their lengths", () => {
    assert.equal(constantTimeEqual("abc", "abc"), true);
    assert.equal(constantTimeEqual("abc", "abd"), false);
    assert.equal(constantTimeEqual("abc", "abcd"), false);
    assert.equal(constantTimeEqual("", ""), true);
    assert.equal(constantTimeEqual("", "a"), false);
  });
});

describe("bearer parsing", () => {
  it("reads one Bearer token and nothing else", () => {
    assert.equal(parseBearer("Bearer abc_DEF-123"), "abc_DEF-123");
    assert.equal(parseBearer("bearer abc"), "abc");
    for (const bad of [undefined, "", "Bearer", "Bearer ", "Basic abc", "Bearer a b", "Bearer abc,def", `Bearer ${"a".repeat(200)}`, "abc"]) {
      assert.equal(parseBearer(bad), undefined, `rejects ${String(bad).slice(0, 20)}`);
    }
  });
});

describe("scope lists", () => {
  it("always includes read and keeps the canonical order", () => {
    assert.deepEqual(parseScopeList("prepare"), ["read", "prepare"]);
    assert.deepEqual(parseScopeList("submit, prepare ,read"), ["read", "prepare", "submit"]);
    assert.deepEqual(parseScopeList("read"), ["read"]);
  });
  it("refuses an unknown or empty list instead of guessing", () => {
    for (const bad of ["", " , ", "admin", "read,write", "READ"]) {
      assert.throws(() => parseScopeList(bad), ScopeListError, `refuses ${JSON.stringify(bad)}`);
    }
  });
  it("turns every ceiling down to read on a read-only instance", () => {
    assert.deepEqual(effectiveScopes(["read", "prepare", "submit"], "read_only"), ["read"]);
    assert.deepEqual(effectiveScopes(["read", "prepare"], "writer"), ["read", "prepare"]);
  });
});

describe("pairing", () => {
  it("exchanges a code once for a ui token that holds read and prepare, never submit", () => {
    const { auth } = makeAuth();
    const grant = auth.issuePairing();
    const result = auth.redeemPairing(grant.code);
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.match(result.token, UI_TOKEN_PATTERN);
    const principal = auth.authenticate(`Bearer ${result.token}`);
    assert.equal(principal?.kind, "ui");
    assert.deepEqual(principal?.scopes, ["read", "prepare"]);
    assert.equal(principal?.requestedBy, "ui");
    // single use
    assert.deepEqual(auth.redeemPairing(grant.code), { ok: false, reason: "invalid" });
  });
  it("expires after PAIR_CODE_TTL_S", () => {
    const { auth, clock } = makeAuth();
    const grant = auth.issuePairing();
    assert.equal(grant.expiresAtMs - clock.now, PAIR_CODE_TTL_S * 1000);
    clock.now += PAIR_CODE_TTL_S * 1000 - 1;
    assert.equal(auth.pairingOpen(), true);
    clock.now += 1;
    assert.equal(auth.pairingOpen(), false);
    assert.deepEqual(auth.redeemPairing(grant.code), { ok: false, reason: "expired" });
    // gone afterwards
    assert.deepEqual(auth.redeemPairing(grant.code), { ok: false, reason: "invalid" });
  });
  it("burns the code after MAX_PAIR_ATTEMPTS wrong tries, even if the right one follows", () => {
    const { auth } = makeAuth();
    const grant = auth.issuePairing();
    for (let index = 0; index < MAX_PAIR_ATTEMPTS; index += 1) {
      assert.deepEqual(auth.redeemPairing("0".repeat(32)), { ok: false, reason: "invalid" });
    }
    assert.deepEqual(auth.redeemPairing(grant.code), { ok: false, reason: "invalid" });
  });
  it("rejects a malformed code without spending the right one", () => {
    const { auth } = makeAuth();
    const grant = auth.issuePairing();
    assert.deepEqual(auth.redeemPairing("not-a-code"), { ok: false, reason: "invalid" });
    assert.equal(auth.redeemPairing(grant.code).ok, true);
  });
  it("replaces an unused code when a new one is issued", () => {
    const { auth } = makeAuth();
    const first = auth.issuePairing();
    const second = auth.issuePairing();
    assert.notEqual(first.code, second.code);
    assert.equal(auth.redeemPairing(first.code).ok, false);
    assert.equal(auth.redeemPairing(second.code).ok, true);
  });
  it("keeps the code only as a hash: nothing on the object holds it", () => {
    const { auth } = makeAuth();
    const grant = auth.issuePairing();
    const dump = JSON.stringify(Object.getOwnPropertyNames(auth)) + String(Object.values(auth));
    assert.equal(dump.includes(grant.code), false);
  });
});

describe("ui token table", () => {
  it("rejects unknown, truncated and wrong-prefix tokens", () => {
    const { auth } = makeAuth();
    const grant = auth.issuePairing();
    const result = auth.redeemPairing(grant.code);
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(auth.authenticate(`Bearer ${result.token.slice(0, -1)}`), undefined);
    assert.equal(auth.authenticate(`Bearer ${result.token}x`), undefined);
    assert.equal(auth.authenticate(`Bearer ${mintUiToken(seededRandom("other"))}`), undefined);
    assert.equal(auth.authenticate(`Bearer ${result.token.replace("cku_", "cka_")}`), undefined);
    assert.equal(auth.authenticate(undefined), undefined);
  });
  it("expires a token after UI_TOKEN_TTL_MS", () => {
    const { auth, clock } = makeAuth();
    const result = auth.redeemPairing(auth.issuePairing().code);
    assert.equal(result.ok, true);
    if (!result.ok) return;
    clock.now += UI_TOKEN_TTL_MS - 1;
    assert.notEqual(auth.authenticate(`Bearer ${result.token}`), undefined);
    clock.now += 1;
    assert.equal(auth.authenticate(`Bearer ${result.token}`), undefined);
  });
  it("keeps at most MAX_UI_TOKENS, dropping the oldest", () => {
    const { auth } = makeAuth();
    const tokens: string[] = [];
    for (let index = 0; index < MAX_UI_TOKENS + 2; index += 1) {
      const result = auth.redeemPairing(auth.issuePairing().code);
      assert.equal(result.ok, true);
      if (result.ok) tokens.push(result.token);
    }
    assert.equal(auth.authenticate(`Bearer ${tokens[0]}`), undefined);
    assert.equal(auth.authenticate(`Bearer ${tokens[1]}`), undefined);
    assert.notEqual(auth.authenticate(`Bearer ${tokens[2]}`), undefined);
    assert.notEqual(auth.authenticate(`Bearer ${tokens.at(-1)}`), undefined);
  });
  it("turns a ui token's scopes down to read on a read-only instance, at once", () => {
    const { auth, role } = makeAuth();
    const result = auth.redeemPairing(auth.issuePairing().code);
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.deepEqual(auth.authenticate(`Bearer ${result.token}`)?.scopes, ["read", "prepare"]);
    role.value = "read_only";
    assert.deepEqual(auth.authenticate(`Bearer ${result.token}`)?.scopes, ["read"]);
  });
  it("wipe drops every token and the pairing code", () => {
    const { auth } = makeAuth();
    const grant = auth.issuePairing();
    const result = auth.redeemPairing(auth.issuePairing().code);
    assert.equal(result.ok, true);
    auth.wipe();
    assert.equal(auth.pairingOpen(), false);
    assert.deepEqual(auth.redeemPairing(grant.code), { ok: false, reason: "invalid" });
    if (result.ok) assert.equal(auth.authenticate(`Bearer ${result.token}`), undefined);
  });
});

describe("agent token", () => {
  it("authenticates by hash with the configured ceiling, default read + prepare", () => {
    const token = mintAgentToken(seededRandom("agent"));
    const sha256 = createHash("sha256").update(token).digest("hex");
    const { auth } = makeAuth(undefined, { agentHash: { id: tokenId(token), sha256 } });
    const principal = auth.authenticate(`Bearer ${token}`);
    assert.equal(principal?.kind, "agent");
    assert.deepEqual(principal?.scopes, ["read", "prepare"]);
    assert.equal(principal?.requestedBy, `agent:${tokenId(token)}`);
    assert.equal(auth.authenticate(`Bearer ${mintAgentToken(seededRandom("other"))}`), undefined);
  });
  it("honours a submit ceiling and still caps a read-only instance to read", () => {
    const token = mintAgentToken(seededRandom("agent2"));
    const sha256 = createHash("sha256").update(token).digest("hex");
    const role = { value: "writer" as InstanceRole };
    const { auth } = makeAuth(role, { agentHash: { id: tokenId(token), sha256 }, agentScopes: ["read", "prepare", "submit"] });
    assert.deepEqual(auth.authenticate(`Bearer ${token}`)?.scopes, ["read", "prepare", "submit"]);
    role.value = "read_only";
    assert.deepEqual(auth.authenticate(`Bearer ${token}`)?.scopes, ["read"]);
  });
  it("does not accept a ui token where an agent token is expected, or the reverse", () => {
    const { auth } = makeAuth();
    const result = auth.redeemPairing(auth.issuePairing().code);
    assert.equal(result.ok, true);
    if (result.ok) assert.equal(auth.authenticate(`Bearer ${result.token}`)?.kind, "ui");
    assert.equal(auth.hasAgentToken(), false);
  });
});

describe("agent token file", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "cockpit-auth-"));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });
  const store = (cockpit: string) => new AgentTokenStore({ dir: cockpit, random: seededRandom("store"), clock: fakeClock() });

  it("creates a token once, stores only its hash with mode 0600, and keeps it on the next start", async () => {
    const cockpit = join(dir, "cockpit");
    const first = await store(cockpit).ensure(false);
    assert.equal(first.outcome, "created");
    assert.ok(first.token !== undefined);
    assert.match(first.token ?? "", AGENT_TOKEN_PATTERN);
    const text = await readFile(join(cockpit, AGENT_TOKEN_FILE), "utf8");
    assert.equal(text.includes(first.token ?? "x"), false, "the plaintext is never written");
    assert.equal(text.includes(createHash("sha256").update(first.token ?? "").digest("hex")), true);
    if (process.platform !== "win32") {
      assert.equal((await stat(join(cockpit, AGENT_TOKEN_FILE))).mode & 0o777, 0o600);
      assert.equal((await stat(cockpit)).mode & 0o777, 0o700);
    }
    const second = await store(cockpit).ensure(false);
    assert.equal(second.outcome, "loaded");
    assert.equal(second.token, undefined, "a stored token is not shown again");
    assert.deepEqual(second.hash, first.hash);
    assert.deepEqual((await readdir(cockpit)).filter((name) => name.includes(".tmp")), []);
  });
  it("rotation replaces the token and the old one stops working", async () => {
    const cockpit = join(dir, "cockpit");
    const shared = store(cockpit);
    const first = await shared.ensure(false);
    const rotated = await shared.ensure(true);
    assert.equal(rotated.outcome, "rotated");
    assert.notEqual(rotated.hash.sha256, first.hash.sha256);
    const { auth } = makeAuth(undefined, { agentHash: rotated.hash });
    assert.equal(auth.authenticate(`Bearer ${first.token}`), undefined);
    assert.notEqual(auth.authenticate(`Bearer ${rotated.token}`), undefined);
  });
  it("replaces an unreadable file with a new token instead of trusting it", async () => {
    const cockpit = join(dir, "cockpit");
    await store(cockpit).ensure(false);
    await writeFile(join(cockpit, AGENT_TOKEN_FILE), "{not json", { mode: 0o600 });
    const again = await store(cockpit).ensure(false);
    assert.equal(again.outcome, "created");
    assert.ok(again.token !== undefined);
  });
  it("rejects a file with extra fields (strict schema)", async () => {
    const cockpit = join(dir, "cockpit");
    const first = await store(cockpit).ensure(false);
    await writeFile(join(cockpit, AGENT_TOKEN_FILE), JSON.stringify({ version: 1, id: first.hash.id, sha256: first.hash.sha256, created_at: "x", extra: 1 }), { mode: 0o600 });
    assert.equal(await store(cockpit).peek(), undefined);
  });
  it("tightens a file that other users can read, and says so", { skip: process.platform === "win32" }, async () => {
    const cockpit = join(dir, "cockpit");
    await store(cockpit).ensure(false);
    await chmod(join(cockpit, AGENT_TOKEN_FILE), 0o644);
    const loaded = await store(cockpit).ensure(false);
    assert.equal(loaded.outcome, "loaded");
    assert.equal(loaded.tightened, true);
    assert.equal((await stat(join(cockpit, AGENT_TOKEN_FILE))).mode & 0o777, 0o600);
  });
  it("peek reads the hash and never writes (a read-only instance)", async () => {
    const cockpit = join(dir, "cockpit");
    assert.equal(await store(cockpit).peek(), undefined);
    await assert.rejects(stat(cockpit), "peek does not create the directory");
    const made = await store(cockpit).ensure(false);
    assert.deepEqual(await store(cockpit).peek(), made.hash);
  });
});
