// Virtual contracts: addresses whose views the RPC mock answers from JavaScript instead of from bytecode.
//
// Why: the chain harness carries the real account stack and three stubs, but not the Hyperlane router and
// Mailbox, the AccessManager, the config manager or any Base contract. Their VIEWS are all the relay reads, and
// their state lives in the mock (hyperlane.ts). So the RPC listener asks this class first; anything it does not
// know goes to anvil.
//
//   Base   Circle USDC       balanceOf, allowance, decimals, name, symbol           from hyperlane.ts balances
//          warp router        token, routers(3223), mailbox, interchainSecurityModule, localDomain, quoteTransferRemote
//          Mailbox            delivered, defaultHook, requiredHook, defaultIsm
//   XO     warp route         the same router views, paired with Base
//          Mailbox            the same, delivered(id) true once the relayer delivered the message
//          AccessManager      canCall(...) = (true, 0)  [docs/research/23 V1: the creation selector is open today]
//          config manager     collateralConfig(USDC.e) = the 2026 values (fee 1,000,000)  [23 V3.2]
//   both   eth_getStorageAt of an EIP-1967 implementation slot for the contracts XO pins as proxies
//   Base   eth_getTransactionReceipt of the emulated Base transactions (hyperlane.ts)
//
// Every value is the one the research recorded (H), so the pinned preflights and tripwires pass out of the box.
// `implementations` can be overridden to simulate an upgrade; `revertAll` makes every virtual call revert.

import { decodeFunctionData, encodeAbiParameters, getAddress, pad, parseAbi, toHex, type Address, type Hex } from "viem";

import { ACCESS_MANAGER_ABI, CONFIG_MANAGER_ABI, ERC20_ABI, MAILBOX_ABI, WARP_ROUTER_ABI } from "../../src/xo/chain/abi.js";
import {
  ACCESS_MANAGER,
  BASE_CHAIN_ID,
  BASE_ROUTER_IMPLEMENTATION,
  BASE_USDC,
  BASE_WARP_ROUTER,
  CONFIG_MANAGER,
  CREATION_FEE_ATOMIC,
  CTF_EXCHANGE,
  EIP1967_IMPLEMENTATION_SLOT,
  EXCHANGE_IMPLEMENTATION,
  HYPERLANE_DOMAIN_BASE,
  HYPERLANE_DOMAIN_XO,
  HYPERLANE_HOOK,
  HYPERLANE_ISM,
  HYPERLANE_MAILBOX,
  MANAGER_IMPLEMENTATION,
  MARKET_MANAGER,
  USDC_E_ADDRESS,
  XO_CHAIN_ID,
  XO_ROUTE_IMPLEMENTATION,
  XO_WARP_ROUTE,
} from "../../src/xo/chain/constants.js";
import type { ChainName } from "./chains.js";
import type { MockEnv } from "./env.js";

export type VirtualAnswer =
  | { readonly handled: false }
  | { readonly handled: true; readonly result: unknown }
  | { readonly handled: true; readonly error: { readonly code: number; readonly message: string; readonly data?: string } };

const NOT_HANDLED: VirtualAnswer = { handled: false };
const REVERT: VirtualAnswer = { handled: true, error: { code: 3, message: "execution reverted", data: "0x" } };

const ERC20_EXTRA_ABI = parseAbi(["function decimals() view returns (uint8)", "function name() view returns (string)", "function symbol() view returns (string)"]);
const lower = (value: string): string => value.toLowerCase();

const result = (value: unknown): VirtualAnswer => ({ handled: true, result: value });

export class VirtualContracts {
  // Where each proxy's EIP-1967 implementation slot points. A test overrides one to simulate an upgrade.
  readonly implementations = new Map<string, Address>();
  revertAll = false;

  constructor(private readonly env: () => MockEnv) {
    this.resetImplementations();
  }

  resetImplementations(): void {
    this.implementations.clear();
    this.implementations.set(`xo:${lower(XO_WARP_ROUTE)}`, XO_ROUTE_IMPLEMENTATION);
    this.implementations.set(`base:${lower(BASE_WARP_ROUTER)}`, BASE_ROUTER_IMPLEMENTATION);
    this.implementations.set(`xo:${lower(CTF_EXCHANGE)}`, EXCHANGE_IMPLEMENTATION);
    this.implementations.set(`xo:${lower(MARKET_MANAGER)}`, MANAGER_IMPLEMENTATION);
  }

  reset(): void {
    this.resetImplementations();
    this.revertAll = false;
  }

  async handle(which: ChainName, method: string, params: unknown): Promise<VirtualAnswer> {
    const list = Array.isArray(params) ? (params as unknown[]) : [];
    if (method === "eth_call") return this.call(which, list[0]);
    if (method === "eth_getStorageAt") return this.storage(which, list[0], list[1]);
    if (method === "eth_getTransactionReceipt" && which === "base") return this.baseReceipt(list[0]);
    return NOT_HANDLED;
  }

  // ---- eth_call -----------------------------------------------------------------------------------------------------------

  private call(which: ChainName, request: unknown): VirtualAnswer {
    if (typeof request !== "object" || request === null) return NOT_HANDLED;
    const { to, data } = request as { to?: unknown; data?: unknown };
    if (typeof to !== "string" || typeof data !== "string" || !/^0x[0-9a-fA-F]{40}$/.test(to) || !/^0x([0-9a-fA-F]{2})*$/.test(data)) return NOT_HANDLED;
    const target = lower(to);
    const known = which === "base" ? this.baseTargets(target) : this.xoTargets(target);
    if (known === undefined) return NOT_HANDLED;
    if (this.revertAll) return REVERT;
    try {
      const encoded = known(data as Hex);
      return encoded === null ? REVERT : result(encoded);
    } catch {
      return REVERT;
    }
  }

  private baseTargets(target: string): ((data: Hex) => Hex | null) | undefined {
    if (target === lower(BASE_USDC)) return (data) => this.erc20(data, (owner) => this.env().hyperlane.baseBalanceOf(owner), (owner, spender) => this.env().hyperlane.baseAllowance(owner, spender), "USD Coin", "USDC");
    if (target === lower(BASE_WARP_ROUTER)) return (data) => this.router(data, HYPERLANE_DOMAIN_BASE, XO_CHAIN_ID, XO_WARP_ROUTE, BASE_USDC);
    if (target === lower(HYPERLANE_MAILBOX)) return (data) => this.mailbox(data, "base");
    return undefined;
  }

  private xoTargets(target: string): ((data: Hex) => Hex | null) | undefined {
    if (target === lower(XO_WARP_ROUTE)) return (data) => this.router(data, HYPERLANE_DOMAIN_XO, BASE_CHAIN_ID, BASE_WARP_ROUTER, USDC_E_ADDRESS);
    if (target === lower(HYPERLANE_MAILBOX)) return (data) => this.mailbox(data, "xo");
    if (target === lower(ACCESS_MANAGER)) {
      return (data) => {
        const decoded = decodeFunctionData({ abi: ACCESS_MANAGER_ABI, data });
        if (decoded.functionName !== "canCall") return null;
        return encodeAbiParameters([{ type: "bool" }, { type: "uint32" }], [true, 0]);
      };
    }
    if (target === lower(CONFIG_MANAGER)) {
      return (data) => {
        const decoded = decodeFunctionData({ abi: CONFIG_MANAGER_ABI, data });
        if (decoded.functionName !== "collateralConfig") return null;
        return encodeAbiParameters(
          [{ type: "bool" }, { type: "uint256" }, { type: "uint256" }, { type: "uint256" }, { type: "uint256" }, { type: "uint256" }, { type: "uint256" }, { type: "uint256" }],
          [true, 5000n, 200n, 5000n, 200n, 100000n, 5_000_000_000n, CREATION_FEE_ATOMIC],
        );
      };
    }
    return undefined;
  }

  private erc20(data: Hex, balanceOf: (owner: string) => bigint, allowance: (owner: string, spender: string) => bigint, name: string, symbol: string): Hex | null {
    const selector = data.slice(0, 10);
    if (selector === "0x313ce567" || selector === "0x06fdde03" || selector === "0x95d89b41") {
      const decoded = decodeFunctionData({ abi: ERC20_EXTRA_ABI, data });
      if (decoded.functionName === "decimals") return encodeAbiParameters([{ type: "uint8" }], [6]);
      return encodeAbiParameters([{ type: "string" }], [decoded.functionName === "name" ? name : symbol]);
    }
    const decoded = decodeFunctionData({ abi: ERC20_ABI, data });
    if (decoded.functionName === "balanceOf") return encodeAbiParameters([{ type: "uint256" }], [balanceOf((decoded.args as readonly [Address])[0])]);
    if (decoded.functionName === "allowance") {
      const [owner, spender] = decoded.args as readonly [Address, Address];
      return encodeAbiParameters([{ type: "uint256" }], [allowance(owner, spender)]);
    }
    return null;
  }

  // The router's views (TokenRouter / HypERC20Collateral on Base, HypFiatToken on XO).
  private router(data: Hex, localDomain: number, remoteDomain: number, remoteRouter: Address, token: Address): Hex | null {
    const decoded = decodeFunctionData({ abi: WARP_ROUTER_ABI, data });
    switch (decoded.functionName) {
      case "token":
        return encodeAbiParameters([{ type: "address" }], [token]);
      case "routers": {
        const [domain] = decoded.args as readonly [number];
        return encodeAbiParameters([{ type: "bytes32" }], [domain === remoteDomain ? pad(remoteRouter, { size: 32 }) : pad("0x", { size: 32 })]);
      }
      case "mailbox":
        return encodeAbiParameters([{ type: "address" }], [HYPERLANE_MAILBOX]);
      case "interchainSecurityModule":
        return encodeAbiParameters([{ type: "address" }], [HYPERLANE_ISM]);
      case "localDomain":
        return encodeAbiParameters([{ type: "uint32" }], [localDomain]);
      case "quoteTransferRemote": {
        const [, , amount] = decoded.args as readonly [number, Hex, bigint];
        // [(0x0, 0), (token, amount), (token, 0)]: no native gas, the amount, no external fee. docs/research/20 sec 3.1.
        const zero = getAddress(`0x${"00".repeat(20)}`);
        return encodeAbiParameters(
          [{ type: "tuple[]", components: [{ name: "token", type: "address" }, { name: "amount", type: "uint256" }] }],
          [[{ token: zero, amount: 0n }, { token, amount }, { token, amount: 0n }]],
        );
      }
      default:
        // transferRemote is a transaction; simulating it here is not part of the mock.
        return null;
    }
  }

  private mailbox(data: Hex, chain: "xo" | "base"): Hex | null {
    const decoded = decodeFunctionData({ abi: MAILBOX_ABI, data });
    switch (decoded.functionName) {
      case "delivered": {
        const [id] = decoded.args as readonly [Hex];
        return encodeAbiParameters([{ type: "bool" }], [this.env().hyperlane.isDelivered(chain, id)]);
      }
      case "defaultHook":
      case "requiredHook":
        return encodeAbiParameters([{ type: "address" }], [HYPERLANE_HOOK]);
      case "defaultIsm":
        return encodeAbiParameters([{ type: "address" }], [HYPERLANE_ISM]);
      default:
        return null;
    }
  }

  // ---- eth_getStorageAt ----------------------------------------------------------------------------------------------------------

  private storage(which: ChainName, address: unknown, slot: unknown): VirtualAnswer {
    if (typeof address !== "string" || typeof slot !== "string") return NOT_HANDLED;
    if (slot.toLowerCase() !== EIP1967_IMPLEMENTATION_SLOT.toLowerCase()) return NOT_HANDLED;
    const implementation = this.implementations.get(`${which}:${lower(address)}`);
    if (implementation === undefined) return NOT_HANDLED;
    return result(pad(implementation.toLowerCase() as Hex, { size: 32 }));
  }

  // ---- Base receipts ----------------------------------------------------------------------------------------------------------------------

  private baseReceipt(hash: unknown): VirtualAnswer {
    if (typeof hash !== "string") return NOT_HANDLED;
    const tx = this.env().hyperlane.baseTransaction(hash);
    if (tx === undefined) return NOT_HANDLED;
    return result({
      transactionHash: tx.transactionHash,
      transactionIndex: "0x0",
      blockHash: tx.blockHash,
      blockNumber: toHex(tx.blockNumber),
      from: tx.from.toLowerCase(),
      to: tx.to.toLowerCase(),
      cumulativeGasUsed: "0x30d40",
      gasUsed: "0x30d40",
      status: tx.status === "success" ? "0x1" : "0x0",
      type: "0x2",
      contractAddress: null,
      logsBloom: `0x${"00".repeat(256)}`,
      logs: tx.logs.map((log, index) => ({
        address: log.address.toLowerCase(),
        topics: log.topics,
        data: log.data,
        blockNumber: toHex(tx.blockNumber),
        blockHash: tx.blockHash,
        transactionHash: tx.transactionHash,
        transactionIndex: "0x0",
        logIndex: toHex(index),
        removed: false,
      })),
    });
  }
}

