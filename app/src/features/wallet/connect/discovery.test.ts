import { describe, expect, it } from "vitest";

import { UserRejectedRequestError } from "viem";

import { WalletError } from "../../../core/signer";
import { FALLBACK_WALLET_ID, FALLBACK_WALLET_NAME, discoverWallets, mergeWallet, safeWalletIcon, walletFromAnnouncement, type DiscoveredWallet } from "./eip6963";
import { rpcCodeOf, walletErrorOf } from "./errors";
import { announcement, fakeTarget, fakeWallet, RpcFailure } from "./testkit";

function collect(target: ReturnType<typeof fakeTarget>, delay = 0) {
  const seen: Array<{ wallets: readonly DiscoveredWallet[]; done: boolean }> = [];
  const timer: { fire: (() => void) | null } = { fire: null };
  const stop = discoverWallets(target, (wallets, done) => seen.push({ wallets, done }), { fallbackDelayMs: delay, setTimer: (callback) => (timer.fire = callback), clearTimer: () => undefined });
  return { seen, stop, finish: () => timer.fire?.() };
}

describe("EIP-6963 discovery", () => {
  it("asks the wallets to announce themselves and lists each one once, with its name as text and a safe icon", () => {
    const a = fakeWallet();
    const b = fakeWallet();
    const target = fakeTarget([announcement(a, { uuid: "u-1", name: "Alpha", rdns: "io.alpha" }), announcement(b, { uuid: "u-2", name: "Beta", rdns: "io.beta", icon: "javascript:alert(1)" })]);
    const run = collect(target);
    const last = run.seen.at(-1)?.wallets ?? [];
    expect(last.map((wallet) => [wallet.id, wallet.nameText, wallet.rdns, wallet.icon === null])).toEqual([
      ["io.alpha", "Alpha", "io.alpha", false],
      ["io.beta", "Beta", "io.beta", true],
    ]);
    expect(last[0]?.name).toEqual({ untrusted: true, value: "Alpha" });
    run.finish();
    expect(run.seen.at(-1)?.done).toBe(true);
    run.stop();
  });

  it("dedupes a wallet that announces twice (same rdns, or the same provider under another uuid)", () => {
    const a = fakeWallet();
    const target = fakeTarget([announcement(a, { uuid: "u-1", rdns: "io.alpha" }), announcement(a, { uuid: "u-2", rdns: "io.other" }), announcement(fakeWallet(), { uuid: "u-3", rdns: "io.alpha" })]);
    const run = collect(target);
    expect(run.seen.at(-1)?.wallets.map((wallet) => wallet.id)).toEqual(["io.alpha"]);
    // A later answer to another request round adds nothing new either.
    target.dispatchEvent(new Event("eip6963:requestProvider"));
    expect(run.seen.at(-1)?.wallets.map((wallet) => wallet.id)).toEqual(["io.alpha"]);
    run.stop();
  });

  it("ignores malformed announcements: no provider, a bad uuid, no info", () => {
    expect(walletFromAnnouncement(null)).toBeNull();
    expect(walletFromAnnouncement({ info: { uuid: "u", name: "x" }, provider: {} })).toBeNull();
    expect(walletFromAnnouncement({ info: { uuid: "<script>", name: "x" }, provider: fakeWallet() })).toBeNull();
    expect(walletFromAnnouncement({ provider: fakeWallet() })).toBeNull();
    // An rdns that is not a reverse domain is not used as the id; the uuid is.
    expect(walletFromAnnouncement({ info: { uuid: "u-9", name: "x", rdns: "not a domain" }, provider: fakeWallet() })?.id).toBe("u-9");
  });

  it("cleans and caps a hostile name, and names an empty one in words", () => {
    const hostile = walletFromAnnouncement({ info: { uuid: "u-1", name: `‮evil​ ${"x".repeat(100)}` }, provider: fakeWallet() });
    expect(hostile?.nameText).not.toMatch(/[‮​]/);
    expect(hostile?.nameText.length).toBeLessThanOrEqual(40);
    expect(walletFromAnnouncement({ info: { uuid: "u-2", name: "   " }, provider: fakeWallet() })?.nameText).toBe("Unnamed wallet");
  });

  it("falls back to window.ethereum only when nothing announced itself, labelled Browser wallet, and drops it when a real announcement comes", () => {
    const legacy = fakeWallet();
    const target = fakeTarget();
    target.ethereum = legacy;
    const run = collect(target);
    expect(run.seen).toEqual([]);
    run.finish();
    const fallback = run.seen.at(-1)?.wallets ?? [];
    expect(fallback.map((wallet) => [wallet.id, wallet.nameText, wallet.via])).toEqual([[FALLBACK_WALLET_ID, FALLBACK_WALLET_NAME, "window.ethereum"]]);
    target.announce(announcement(fakeWallet(), { rdns: "io.late" }));
    expect(run.seen.at(-1)?.wallets.map((wallet) => wallet.id)).toEqual(["io.late"]);
    run.stop();

    const announced = fakeTarget([announcement(legacy)]);
    announced.ethereum = legacy;
    const second = collect(announced);
    second.finish();
    expect(second.seen.at(-1)?.wallets.map((wallet) => wallet.via)).toEqual(["eip6963"]);
    second.stop();
  });

  it("stops listening when stopped", () => {
    const target = fakeTarget();
    const run = collect(target);
    run.stop();
    target.announce(announcement(fakeWallet()));
    run.finish();
    expect(run.seen).toEqual([]);
  });

  it("merges by id and by provider identity", () => {
    const provider = fakeWallet();
    const one = walletFromAnnouncement(announcement(provider, { uuid: "u-1", rdns: "io.one" }));
    const same = walletFromAnnouncement(announcement(provider, { uuid: "u-2", rdns: "io.two" }));
    if (one === null || same === null) throw new Error("fixture");
    expect(mergeWallet(mergeWallet([], one), same)).toHaveLength(1);
  });
});

describe("wallet icons", () => {
  it("keeps only data: images of the four allowed types, base64 or percent-encoded", () => {
    expect(safeWalletIcon("data:image/png;base64,iVBORw0KGgo=")).not.toBeNull();
    expect(safeWalletIcon("data:image/svg+xml;base64,PHN2Zy8+")).not.toBeNull();
    expect(safeWalletIcon("data:image/svg+xml,%3Csvg%20xmlns%3D%22a%22%2F%3E")).not.toBeNull();
    expect(safeWalletIcon("data:image/webp;base64,UklGRg==")).not.toBeNull();
    expect(safeWalletIcon("data:image/jpeg;base64,/9j/4AAQ")).not.toBeNull();
    for (const bad of [
      "https://wallet.invalid/icon.png",
      "javascript:alert(1)",
      "data:text/html;base64,PHNjcmlwdD4=",
      "data:image/gif;base64,R0lGODlh",
      'data:image/svg+xml,<svg onload="alert(1)"/>',
      "data:image/png;base64,iVBOR w0KGgo=",
      `data:image/png;base64,${"A".repeat(200_000)}`,
      42,
    ]) {
      expect(safeWalletIcon(bad), String(bad).slice(0, 40)).toBeNull();
    }
  });
});

describe("wallet errors", () => {
  it("maps EIP-1193 and WalletConnect codes to the shared codes", () => {
    const cases: Array<[number, string]> = [
      [4001, "rejected"],
      [5000, "rejected"],
      [4100, "unsupported"],
      [4200, "unsupported"],
      [5101, "unsupported"],
      [4901, "unsupported_chain"],
      [4902, "unsupported_chain"],
      [5100, "unsupported_chain"],
      [4900, "disconnected"],
      [6000, "disconnected"],
      [-32603, "failed"],
      [1234, "failed"],
    ];
    for (const [code, expected] of cases) expect(walletErrorOf(new RpcFailure(code, "x")).code, String(code)).toBe(expected);
  });

  it("finds the code under viem's wrapper and under a mobile wallet's originalError", () => {
    expect(walletErrorOf(new UserRejectedRequestError(new Error("User denied"))).code).toBe("rejected");
    expect(rpcCodeOf({ code: -32603, data: { originalError: { code: 4902 } } })).toBe(4902);
    expect(rpcCodeOf({ code: -32603, cause: { code: 4001 } })).toBe(4001);
    expect(rpcCodeOf("nope")).toBeNull();
  });

  it("keeps a WalletError as it is, and puts the wallet's own words after fixed text, cleaned", () => {
    const original = new WalletError("unsupported", "kept");
    expect(walletErrorOf(original)).toBe(original);
    const mapped = walletErrorOf(new RpcFailure(-32000, "insufficient funds‮ for gas"));
    expect(mapped.code).toBe("failed");
    expect(mapped.message).toMatch(/^Your wallet could not complete the request\. It said: insufficient funds/);
    expect(mapped.message).not.toContain("‮");
    expect(walletErrorOf(new RpcFailure(4001, "anything")).message).toBe("You declined the request in your wallet.");
  });
});
