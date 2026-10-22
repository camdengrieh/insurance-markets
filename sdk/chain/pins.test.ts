import { getAddress, keccak256, padHex } from "viem";
import { describe, expect, it } from "vitest";

import { LIMITLESS_CTF_EXCHANGE, LIMITLESS_PINS, BASE_RPC_URL } from "./limitless/constants.js";
import { MULTICALL3_ADDRESS, MULTICALL3_PINS } from "./multicall.js";
import { checkPin, createPinGuard, EIP1967_IMPLEMENTATION_SLOT, type ContractPin } from "./pins.js";
import { POLYGON_RPC_URL, POLYMARKET_CTF_EXCHANGE, POLYMARKET_EXCHANGE_V3, POLYMARKET_NEG_RISK_EXCHANGE, POLYMARKET_PINS } from "./polymarket/constants.js";
import { createRpcPort, type Hex, type RpcHttpResponse } from "./rpc.js";
import { BROWSER_DIRECT_ORIGINS } from "../venues/origins.js";
import * as XO from "./xo/constants.js";
import { XO_PINS, XO_RPC_URL } from "./xo/pins.js";

// The pinned contracts of the chain readers. The code hashes themselves are re-checked against the recorded runtime
// code by test/chain-pins.test.ts; this file checks the pins' shape, that the copies elsewhere agree, and what a
// reader does when the chain no longer matches a pin.

const ALL: readonly ContractPin[] = [...Object.values(POLYMARKET_PINS), ...Object.values(LIMITLESS_PINS), ...Object.values(XO_PINS), ...Object.values(MULTICALL3_PINS)];

function withImplementations(pins: readonly ContractPin[]): ContractPin[] {
  return pins.flatMap((pin) => (pin.implementation === null ? [pin] : [pin, pin.implementation]));
}

describe("the pins", () => {
  it("hold strict EIP-55 addresses, 32-byte code hashes, sizes, a source and a date", () => {
    for (const pin of withImplementations(ALL)) {
      expect(getAddress(pin.address), pin.name).toBe(pin.address);
      expect(pin.codeHash, pin.name).toMatch(/^0x[0-9a-f]{64}$/);
      expect(pin.codeSize, pin.name).toBeGreaterThan(0);
      expect(pin.source.length, pin.name).toBeGreaterThan(10);
      expect(pin.readOn).toBe("2026-10-22");
    }
  });

  it("agree with the exchange addresses the order builders use (src/clob/venues.ts imports them from the XO constants)", () => {
    expect(XO.POLYMARKET_CTF_EXCHANGE).toBe(POLYMARKET_CTF_EXCHANGE);
    expect(XO.POLYMARKET_NEG_RISK_EXCHANGE).toBe(POLYMARKET_NEG_RISK_EXCHANGE);
    expect(XO.POLYMARKET_EXCHANGE_V3).toBe(POLYMARKET_EXCHANGE_V3);
    expect(XO.LIMITLESS_CTF_EXCHANGE).toBe(LIMITLESS_CTF_EXCHANGE);
    expect(XO_PINS.conditionalTokens.address).toBe(XO.CONDITIONAL_TOKENS);
    expect(XO_PINS.ctfExchange.implementation?.address).toBe(XO.EXCHANGE_IMPLEMENTATION);
    expect(MULTICALL3_PINS[137].address).toBe(MULTICALL3_ADDRESS);
  });

  it("name RPC origins the dApp's host registry lists", () => {
    const origin = (service: string) => BROWSER_DIRECT_ORIGINS.find((entry) => entry.service === service)?.origin;
    expect(new URL(POLYGON_RPC_URL).origin).toBe(origin("rpc_polygon"));
    expect(new URL(BASE_RPC_URL).origin).toBe(origin("rpc_base"));
    expect(new URL(XO_RPC_URL).origin).toBe(origin("xo_rpc"));
  });
});

describe("checking a pin against the chain", () => {
  const code = "0x6001600055" as Hex;
  const implCode = "0x60026000" as Hex;
  const impl: ContractPin = { chainId: 1, name: "impl", address: "0x2222222222222222222222222222222222222222", codeHash: keccak256(implCode), codeSize: 4, implementation: null, source: "test", verified: "test", readOn: "2026-10-22" };
  const proxy: ContractPin = { ...impl, name: "proxy", address: "0x1111111111111111111111111111111111111111", codeHash: keccak256(code), codeSize: 5, implementation: impl };

  function chain(codes: Record<string, Hex>, slot: Hex) {
    let calls = 0;
    const post = async (_url: string, body: unknown): Promise<RpcHttpResponse> => {
      calls += 1;
      const request = body as { id: number; method: string; params: [string, ...unknown[]] };
      const result = request.method === "eth_getCode" ? (codes[request.params[0].toLowerCase()] ?? "0x") : slot;
      return { status: 200, body: { jsonrpc: "2.0", id: request.id, result } };
    };
    return { port: createRpcPort({ url: "https://rpc.example.test/", post, methods: ["eth_getCode", "eth_getStorageAt"] }), calls: () => calls };
  }

  const slotOf = (address: string): Hex => padHex(address.toLowerCase() as Hex, { size: 32 });

  it("passes when the code and the implementation the slot names are the pinned ones", async () => {
    const { port } = chain({ [proxy.address]: code, [impl.address]: implCode }, slotOf(impl.address));
    expect(await checkPin(port, proxy)).toEqual({ ok: true });
  });

  it("fails closed on changed code, no code, a moved implementation or a changed implementation", async () => {
    expect(await checkPin(chain({ [proxy.address]: "0x6001600056" }, slotOf(impl.address)).port, proxy)).toMatchObject({ ok: false, reason: "code_changed" });
    expect(await checkPin(chain({}, slotOf(impl.address)).port, proxy)).toMatchObject({ ok: false, reason: "no_code" });
    expect(await checkPin(chain({ [proxy.address]: code }, slotOf("0x3333333333333333333333333333333333333333")).port, proxy)).toMatchObject({ ok: false, reason: "implementation_changed" });
    expect(await checkPin(chain({ [proxy.address]: code, [impl.address]: "0x60036000" }, slotOf(impl.address)).port, proxy)).toMatchObject({ ok: false, reason: "code_changed", contract: "impl" });
    expect(EIP1967_IMPLEMENTATION_SLOT).toMatch(/^0x[0-9a-f]{64}$/);
  });

  it("checks each pin once per guard", async () => {
    const live = chain({ [proxy.address]: code, [impl.address]: implCode }, slotOf(impl.address));
    const guard = createPinGuard(live.port);
    await guard.check(proxy);
    const after = live.calls();
    await guard.check(proxy);
    expect(live.calls()).toBe(after);
  });
});
