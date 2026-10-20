import { describe, expect, it } from "vitest";

import { FakeRaw, FakeTimers } from "../../core/fakes";
import { PAIR_CODE, TOKEN, errorReply, jsonReply, memoryStorage } from "./test-support";
import { PAIR_REASON_TEXT, PageSession, SESSION_STORAGE_KEY, setTerminalTokenSource, type StorageLike } from "./session";

function sessionWith(raw: FakeRaw, options: { storage?: StorageLike | null; code?: string | undefined; external?: () => string | null } = {}): PageSession {
  let code = "code" in options ? options.code : PAIR_CODE;
  return new PageSession({
    rawFetch: raw.fetch,
    timers: new FakeTimers(0),
    consumeCode: () => {
      const once = code;
      code = undefined;
      return once;
    },
    storage: options.storage === undefined ? memoryStorage() : options.storage,
    ...(options.external === undefined ? {} : { external: options.external }),
  });
}

const paired = (): FakeRaw => new FakeRaw(() => jsonReply(200, { token: TOKEN, kind: "ui", scopes: ["read", "prepare"] }));

describe("pairing", () => {
  it("exchanges the one-time code for a ui token and posts nothing else", async () => {
    const raw = paired();
    const storage = memoryStorage();
    const session = sessionWith(raw, { storage });
    expect(session.token()).toBeNull();
    expect(await session.pair()).toEqual({ ok: true });
    expect(session.token()).toBe(TOKEN);
    expect(raw.calls).toHaveLength(1);
    const call = raw.calls[0];
    expect(call?.url).toBe("/ui/pair");
    expect(JSON.parse(call?.init.body ?? "null")).toEqual({ code: PAIR_CODE });
    // No credential is sent with a pairing request, and nothing identifies the user.
    expect(Object.keys(call?.init.headers ?? {}).sort()).toEqual(["accept", "content-type"]);
    expect(call?.init.credentials).toBe("omit");
    expect(storage.data.get(SESSION_STORAGE_KEY)).toBe(TOKEN);
  });

  it("uses a code once", async () => {
    const raw = paired();
    const session = sessionWith(raw);
    await session.pair();
    const second = await session.pair();
    expect(second).toEqual({ ok: false, reason: "no_code" });
    expect(raw.calls).toHaveLength(1);
  });

  it("shares one exchange between concurrent callers", async () => {
    const raw = paired();
    const session = sessionWith(raw);
    const [a, b] = await Promise.all([session.pair(), session.pair()]);
    expect(a).toEqual(b);
    expect(raw.calls).toHaveLength(1);
  });

  it("says why it failed, in fixed words", async () => {
    expect(await sessionWith(new FakeRaw(() => errorReply(401, "pairing_invalid"))).pair()).toEqual({ ok: false, reason: "pairing_invalid" });
    expect(await sessionWith(new FakeRaw(() => errorReply(410, "pairing_expired"))).pair()).toEqual({ ok: false, reason: "pairing_expired" });
    expect(await sessionWith(new FakeRaw(() => jsonReply(200, { token: "not a token", kind: "ui", scopes: [] }))).pair()).toEqual({ ok: false, reason: "bad_response" });
    expect(await sessionWith(new FakeRaw(() => jsonReply(200, { token: TOKEN, kind: "ui", scopes: ["read", "prepare", "submit"] }))).pair()).toEqual({ ok: false, reason: "bad_response" });
    expect(
      await sessionWith(
        new FakeRaw(() => {
          throw new TypeError("failed");
        }),
      ).pair(),
    ).toEqual({ ok: false, reason: "unreachable" });
    expect(await sessionWith(paired(), { code: undefined }).pair()).toEqual({ ok: false, reason: "no_code" });
    for (const text of Object.values(PAIR_REASON_TEXT)) expect(text).not.toMatch(/cku_|[0-9a-f]{32}/);
  });

  it("never holds a token it did not get", async () => {
    const session = sessionWith(new FakeRaw(() => errorReply(401, "pairing_invalid")));
    await session.pair();
    expect(session.token()).toBeNull();
  });
});

describe("the token", () => {
  it("is restored from session storage when it is a well-formed ui token", () => {
    const raw = paired();
    expect(sessionWith(raw, { storage: memoryStorage({ [SESSION_STORAGE_KEY]: TOKEN }) }).token()).toBe(TOKEN);
    const bad = memoryStorage({ [SESSION_STORAGE_KEY]: "cka_not-a-ui-token" });
    expect(sessionWith(raw, { storage: bad }).token()).toBeNull();
    expect(bad.data.has(SESSION_STORAGE_KEY)).toBe(false);
  });

  it("works without storage, and with storage that throws", async () => {
    const raw = paired();
    const none = sessionWith(raw, { storage: null });
    await none.pair();
    expect(none.token()).toBe(TOKEN);
    const throwing: StorageLike = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
      removeItem: () => {
        throw new Error("blocked");
      },
    };
    const blocked = sessionWith(paired(), { storage: throwing });
    expect(blocked.token()).toBeNull();
    expect(await blocked.pair()).toEqual({ ok: true });
    expect(blocked.token()).toBe(TOKEN);
    blocked.forget();
    expect(blocked.token()).toBeNull();
  });

  it("is forgotten everywhere when the daemon refuses it", async () => {
    const storage = memoryStorage({ [SESSION_STORAGE_KEY]: TOKEN });
    const session = sessionWith(paired(), { storage });
    session.forget();
    expect(session.token()).toBeNull();
    expect(storage.data.has(SESSION_STORAGE_KEY)).toBe(false);
  });

  it("defers to a token held elsewhere in the page", () => {
    const outside = `cku_${"C".repeat(43)}`;
    const session = sessionWith(paired(), { external: () => outside });
    expect(session.token()).toBe(outside);
    expect(session.tokenSource()()).toBe(outside);
    setTerminalTokenSource(() => outside);
    expect(sessionWith(paired()).token()).toBe(outside);
    setTerminalTokenSource(null);
    expect(sessionWith(paired()).token()).toBeNull();
  });
});
