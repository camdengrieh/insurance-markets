// The Hyperlane emulation: the warp route between Base (Circle USDC in escrow) and XO (USDC.e minted), the two
// Mailboxes, and the relayer that moves a message between them. Spec 5.5 category A: "Base escrow to XO mint
// after 10 to 30 s; Mailbox.delivered; bad-recipient reverts" (docs/research/20 sec 6 and V C).
//
// What is real and what is not:
//   - XO side: the USDC.e stub on the local chain really mints (open mint), so a balanceOf read through the XO RPC
//     rises when a message is delivered. The route and the Mailbox are one STOP byte of code (chains.ts); their
//     views are answered by virtual.ts from this class.
//   - Base side: there is no Base contract. The Circle USDC balances and allowances are plain maps here, the
//     router's views are answered by virtual.ts, and the "transactions" are emulated: baseApprove() and
//     baseTransferRemote() stand for the user's wallet executing the two proposals the plugin hands out. They mine
//     a block on the Base chain (so eth_getBlockByNumber answers) and keep a synthetic receipt that
//     eth_getTransactionReceipt returns, with the logs the real route emits (Transfer, Dispatch, DispatchId,
//     SentTransferRemote).
//   - The relayer delivers a message 10 to 30 s of MOCK time after its dispatch (deterministic from the message
//     id; the samples were median 14 s, max 27 s), by minting on XO and marking Mailbox.delivered(id). A message
//     the XO route would revert on is never delivered: a recipient with a non-zero byte in the upper 12 bytes
//     ("bytes32ToAddress overflow"), the zero address, or amount 0. Nothing is retried and nothing is refunded
//     (docs/research/20 sec 4.1).
//   - XO to Base (the H1 withdrawal sketch): a landed paymaster-less UserOp [approve(route, a), transferRemote(8453,
//     recipient, a)] burns a of the account's USDC.e (the route pulls it with the approval) and, when
//     withdraw.paymasterless = accept-and-deliver, credits the Base recipient 12 to 18 s later.
//   - The orderbook's credit of a delivered deposit is funding.credit (not-credited, delayed-5min,
//     credited-after-sweep-only, credited); sweep() is what XO's sweeper would do.
//
// Basis: docs/research/20 for the contracts and timings (H); the credit rules are the open question FU6 (M).

import {
  concat,
  decodeAbiParameters,
  encodeAbiParameters,
  encodeFunctionData,
  getAbiItem,
  getAddress,
  keccak256,
  pad,
  toEventSelector,
  toHex,
  type Address,
  type Hex,
} from "viem";

import { ERC20_ABI, WARP_ROUTER_ABI } from "../../src/xo/chain/abi.js";
import {
  BASE_USDC,
  BASE_WARP_ROUTER,
  DISPATCH_ID_TOPIC,
  HYPERLANE_DOMAIN_BASE,
  HYPERLANE_DOMAIN_XO,
  HYPERLANE_MAILBOX,
  PROCESS_ID_TOPIC,
  TRANSFER_REMOTE_SELECTOR,
  USDC_E_ADDRESS,
  XO_WARP_ROUTE,
} from "../../src/xo/chain/constants.js";
import { USDCE_STUB_ABI } from "../anvil/stubs.js";
import { decodeKernelCalls, selectorOf, type DecodedCall } from "./calls.js";
import type { MockEnv } from "./env.js";
import { isRegistered } from "./registry.js";
import { accountKey, type AccountKey } from "./state.js";

const TRANSFER_TOPIC = toEventSelector(getAbiItem({ abi: ERC20_ABI, name: "Transfer" }));
const APPROVAL_TOPIC = toEventSelector(getAbiItem({ abi: ERC20_ABI, name: "Approval" }));
const SENT_TRANSFER_REMOTE_TOPIC = toEventSelector(getAbiItem({ abi: WARP_ROUTER_ABI, name: "SentTransferRemote" }));
const RECEIVED_TRANSFER_REMOTE_TOPIC = toEventSelector(getAbiItem({ abi: WARP_ROUTER_ABI, name: "ReceivedTransferRemote" }));
const DISPATCH_TOPIC = keccak256(toHex("Dispatch(address,uint32,bytes32,bytes)"));

export interface BaseLog {
  readonly address: Address;
  readonly topics: readonly Hex[];
  readonly data: Hex;
}

export interface BaseTransaction {
  readonly transactionHash: Hex;
  readonly status: "success" | "reverted";
  readonly blockNumber: bigint;
  readonly blockHash: Hex;
  readonly from: Address;
  readonly to: Address;
  readonly logs: readonly BaseLog[];
  // The revert text when status is reverted.
  readonly revert?: string;
}

export type MessageDirection = "base_to_xo" | "xo_to_base";
export type MessageState = "dispatched" | "delivered" | "undeliverable";

export interface HyperlaneMessage {
  readonly id: Hex;
  readonly direction: MessageDirection;
  readonly sender: Address;
  readonly recipientWord: Hex;
  readonly amount: bigint;
  readonly dispatchedAtMs: number;
  readonly dueMs: number;
  state: MessageState;
  // Why the destination refused it, when state is undeliverable.
  failure: string | null;
}

export interface TransferResult {
  readonly transactionHash: Hex;
  readonly status: "success" | "reverted";
  readonly messageId: Hex | null;
  readonly revert?: string;
}

const lower = (value: string): string => value.toLowerCase();
const wordOf = (value: bigint): Hex => pad(toHex(value), { size: 32 });
const topicOfAddress = (address: string): Hex => pad(address.toLowerCase() as Hex, { size: 32 });

export class Hyperlane {
  // Circle USDC on Base, by owner (lower-case, no 0x), and approvals by `${owner}:${spender}`.
  private readonly baseBalances = new Map<AccountKey, bigint>();
  private readonly baseAllowances = new Map<string, bigint>();
  private readonly baseTransactions = new Map<string, BaseTransaction>();
  private readonly deliveredIds = new Set<string>();
  readonly messages: HyperlaneMessage[] = [];
  // Credits waiting for a sweep (funding.credit = credited-after-sweep-only), by account.
  private readonly swept = new Map<AccountKey, bigint>();
  private nonce = 0;
  private txCounter = 0;

  constructor(private readonly env: () => MockEnv) {}

  reset(): void {
    this.baseBalances.clear();
    this.baseAllowances.clear();
    this.baseTransactions.clear();
    this.deliveredIds.clear();
    this.messages.length = 0;
    this.swept.clear();
    this.nonce = 0;
    this.txCounter = 0;
  }

  // ---- reads (virtual.ts answers the RPC with these) ---------------------------------------------------------------------------

  baseBalanceOf(owner: string): bigint {
    return this.baseBalances.get(accountKey(owner)) ?? 0n;
  }

  baseAllowance(owner: string, spender: string): bigint {
    return this.baseAllowances.get(`${accountKey(owner)}:${accountKey(spender)}`) ?? 0n;
  }

  isDelivered(chain: "xo" | "base", id: string): boolean {
    const message = this.messages.find((entry) => lower(entry.id) === lower(id));
    if (message === undefined || message.state !== "delivered") return false;
    return chain === "xo" ? message.direction === "base_to_xo" : message.direction === "xo_to_base";
  }

  baseTransaction(hash: string): BaseTransaction | undefined {
    return this.baseTransactions.get(lower(hash));
  }

  // ---- the user's wallet on Base -------------------------------------------------------------------------------------------------------

  setBaseBalance(owner: string, micro: bigint): void {
    if (micro < 0n) throw new RangeError("a balance cannot be negative");
    this.baseBalances.set(accountKey(owner), micro);
  }

  // approve(spender, amount) on the Circle USDC, executed by `owner`.
  async baseApprove(owner: string, spender: string, amount: bigint): Promise<BaseTransaction> {
    this.baseAllowances.set(`${accountKey(owner)}:${accountKey(spender)}`, amount);
    const log: BaseLog = { address: BASE_USDC, topics: [APPROVAL_TOPIC, topicOfAddress(owner), topicOfAddress(spender)], data: wordOf(amount) };
    return this.mineBase(getAddress(owner), BASE_USDC, [log], "success");
  }

  // transferRemote(destination, recipient, amount) on the Base router, executed by `from` with `value` wei. The
  // contract's own rules: value must be 0 ("MerkleTreeHook: no value expected"), the allowance and the balance
  // must cover the amount, the destination must be enrolled. A revert leaves no message and moves nothing.
  async baseTransferRemote(input: { readonly from: string; readonly recipient: Hex; readonly amount: bigint; readonly destination?: number; readonly value?: bigint }): Promise<TransferResult> {
    const destination = input.destination ?? HYPERLANE_DOMAIN_XO;
    const from = getAddress(input.from);
    const revert = (text: string): Promise<TransferResult> => this.revertedBase(from, text);
    if ((input.value ?? 0n) !== 0n) return revert("MerkleTreeHook: no value expected");
    if (destination !== HYPERLANE_DOMAIN_XO) return revert("No router enrolled for domain");
    if (!/^0x[0-9a-fA-F]{64}$/.test(input.recipient)) return revert("invalid recipient");
    if (this.baseAllowance(from, BASE_WARP_ROUTER) < input.amount) return revert("ERC20: insufficient allowance");
    if (this.baseBalanceOf(from) < input.amount) return revert("ERC20: transfer amount exceeds balance");

    this.baseBalances.set(accountKey(from), this.baseBalanceOf(from) - input.amount);
    this.baseAllowances.set(`${accountKey(from)}:${accountKey(BASE_WARP_ROUTER)}`, this.baseAllowance(from, BASE_WARP_ROUTER) - input.amount);

    const { clock } = this.env();
    const body = concat([input.recipient, wordOf(input.amount)]);
    const nonce = this.nonce;
    this.nonce += 1;
    const message = concat([toHex(3, { size: 1 }), toHex(nonce, { size: 4 }), toHex(HYPERLANE_DOMAIN_BASE, { size: 4 }), pad(BASE_WARP_ROUTER, { size: 32 }), toHex(destination, { size: 4 }), pad(XO_WARP_ROUTE, { size: 32 }), body]);
    const id = keccak256(message);
    const delaySeconds = 10 + Number(BigInt(id) % 21n);
    const logs: BaseLog[] = [
      { address: BASE_USDC, topics: [TRANSFER_TOPIC, topicOfAddress(from), topicOfAddress(BASE_WARP_ROUTER)], data: wordOf(input.amount) },
      {
        address: HYPERLANE_MAILBOX,
        topics: [DISPATCH_TOPIC, topicOfAddress(BASE_WARP_ROUTER), wordOf(BigInt(destination)), pad(XO_WARP_ROUTE, { size: 32 })],
        data: encodeAbiParameters([{ type: "bytes" }], [message]),
      },
      { address: HYPERLANE_MAILBOX, topics: [DISPATCH_ID_TOPIC, id], data: "0x" },
      { address: BASE_WARP_ROUTER, topics: [SENT_TRANSFER_REMOTE_TOPIC, wordOf(BigInt(destination)), input.recipient], data: wordOf(input.amount) },
    ];
    const tx = await this.mineBase(from, BASE_WARP_ROUTER, logs, "success");
    const entry: HyperlaneMessage = {
      id,
      direction: "base_to_xo",
      sender: from,
      recipientWord: input.recipient,
      amount: input.amount,
      dispatchedAtMs: clock.nowMs(),
      dueMs: clock.nowMs() + delaySeconds * 1000,
      state: "dispatched",
      failure: null,
    };
    this.messages.push(entry);
    this.env().scheduler.at(entry.dueMs, `deliver ${id.slice(0, 10)} to XO`, () => this.deliverToXo(entry));
    return { transactionHash: tx.transactionHash, status: "success", messageId: id };
  }

  private async revertedBase(from: Address, revert: string): Promise<TransferResult> {
    const tx = await this.mineBase(from, BASE_WARP_ROUTER, [], "reverted", revert);
    return { transactionHash: tx.transactionHash, status: "reverted", messageId: null, revert };
  }

  // Mines one block on the Base chain at the mock clock's time and keeps a receipt for the "transaction".
  private async mineBase(from: Address, to: Address, logs: readonly BaseLog[], status: "success" | "reverted", revert?: string): Promise<BaseTransaction> {
    const { chains, clock } = this.env();
    this.txCounter += 1;
    const transactionHash = keccak256(toHex(`mock-base-tx:${String(this.txCounter)}:${from}:${to}:${String(clock.nowMs())}`));
    let blockNumber = 0n;
    let blockHash: Hex = `0x${"00".repeat(32)}`;
    if (chains.base !== undefined) {
      const latest = await chains.call<{ timestamp: Hex }>("base", "eth_getBlockByNumber", ["latest", false]);
      if (clock.nowSeconds() > Number(BigInt(latest.timestamp))) await chains.call("base", "evm_setNextBlockTimestamp", [clock.nowSeconds()]);
      await chains.call("base", "evm_mine", []);
      const block = await chains.call<{ number: Hex; hash: Hex }>("base", "eth_getBlockByNumber", ["latest", false]);
      blockNumber = BigInt(block.number);
      blockHash = block.hash;
    }
    const tx: BaseTransaction = { transactionHash, status, blockNumber, blockHash, from, to, logs, ...(revert === undefined ? {} : { revert }) };
    this.baseTransactions.set(lower(transactionHash), tx);
    return tx;
  }

  // ---- the relayer: Base to XO --------------------------------------------------------------------------------------------------------------------------

  private async deliverToXo(message: HyperlaneMessage): Promise<void> {
    const env = this.env();
    // XO's route.handle: left-padded recipient only, non-zero, amount above zero.
    const word = BigInt(message.recipientWord);
    if (word >> 160n !== 0n) {
      message.state = "undeliverable";
      message.failure = "TypeCasts: bytes32ToAddress overflow";
      return;
    }
    if (word === 0n) {
      message.state = "undeliverable";
      message.failure = "FiatToken: mint to the zero address";
      return;
    }
    if (message.amount === 0n) {
      message.state = "undeliverable";
      message.failure = "FiatToken: mint amount not greater than 0";
      return;
    }
    const recipient = getAddress(`0x${word.toString(16).padStart(40, "0")}`);
    const chain = env.chains.xo;
    if (chain !== undefined && chain.stubs) {
      await env.chains.syncToClock(env.clock);
      await chain.sendFrom(chain.bundler.address, USDC_E_ADDRESS, encodeFunctionData({ abi: USDCE_STUB_ABI, functionName: "mint", args: [recipient, message.amount] }));
    }
    message.state = "delivered";
    this.deliveredIds.add(lower(message.id));
    const at = env.clock.nowSeconds();
    const blockNumber = Number(await this.xoBlockNumber());
    const transactionHash = keccak256(toHex(`mock-process:${message.id}`));
    env.explorer.syntheticLogs.push(
      { address: HYPERLANE_MAILBOX, topics: [PROCESS_ID_TOPIC, message.id], data: "0x", blockNumber, logIndex: 0, transactionHash, timestamp: at },
      { address: XO_WARP_ROUTE, topics: [RECEIVED_TRANSFER_REMOTE_TOPIC, wordOf(BigInt(HYPERLANE_DOMAIN_BASE)), message.recipientWord], data: wordOf(message.amount), blockNumber, logIndex: 1, transactionHash, timestamp: at },
    );
    await this.credit(accountKey(recipient), message.amount);
  }

  private async xoBlockNumber(): Promise<bigint> {
    const { chains } = this.env();
    return chains.xo === undefined ? 0n : BigInt(await chains.call<Hex>("xo", "eth_blockNumber"));
  }

  // The orderbook's side (FU6): does XO credit USDC.e minted straight to the account?
  private async credit(account: AccountKey, amount: bigint): Promise<void> {
    const env = this.env();
    const rule = env.switches.get("funding.credit");
    if (rule === "not-credited") return;
    if (rule === "credited-after-sweep-only") {
      this.swept.set(account, (this.swept.get(account) ?? 0n) + amount);
      return;
    }
    if (rule === "delayed-5min") {
      env.scheduler.after(300_000, `credit ${account.slice(0, 8)}`, () => this.creditNow(account, amount));
      return;
    }
    await this.creditNow(account, amount);
  }

  private async creditNow(account: AccountKey, amount: bigint): Promise<void> {
    const env = this.env();
    // The orderbook only credits an account it knows (the registry); an unknown one stays uncredited.
    if (!(await isRegistered(env, `0x${account}`))) return;
    env.state.creditCollateral(`0x${account}`, amount);
  }

  // XO's sweeper: credits what is waiting under funding.credit = credited-after-sweep-only.
  async sweep(account?: string): Promise<bigint> {
    let total = 0n;
    for (const [key, amount] of [...this.swept]) {
      if (account !== undefined && key !== accountKey(account)) continue;
      this.swept.delete(key);
      total += amount;
      await this.creditNow(key, amount);
    }
    return total;
  }

  // ---- XO to Base: the withdrawal sketch (H1) ------------------------------------------------------------------------------------------------------

  // Called after a UserOp landed with its execution successful. Only the paymaster-less transferRemote matters
  // here; with a paymaster the real contract refuses it, so such an operation never lands.
  async onUserOpLanded(sender: Address, calls: readonly DecodedCall[]): Promise<void> {
    const env = this.env();
    for (const call of calls) {
      if (call.target !== XO_WARP_ROUTE || selectorOf(call.data) !== TRANSFER_REMOTE_SELECTOR) continue;
      const mode = env.switches.get("withdraw.paymasterless");
      const [destination, recipient, amount] = decodeAbiParameters([{ type: "uint32" }, { type: "bytes32" }, { type: "uint256" }], `0x${call.data.slice(10)}`);
      if (destination !== HYPERLANE_DOMAIN_BASE) continue;
      const chain = env.chains.xo;
      if (chain === undefined || !chain.stubs) continue;
      // The route pulls the funds with the approval the same operation granted. impersonate it, as the route would.
      await chain.anvil.rpc("anvil_impersonateAccount", [XO_WARP_ROUTE]);
      try {
        const burnAddress = getAddress(`0x${"00".repeat(19)}de`);
        const data = encodeFunctionData({ abi: [...USDCE_STUB_ABI], functionName: "transferFrom", args: [sender, burnAddress, amount] });
        const receipt = await chain.sendFrom(XO_WARP_ROUTE, USDC_E_ADDRESS, data);
        if (receipt.status !== "success") continue;
      } finally {
        await chain.anvil.rpc("anvil_stopImpersonatingAccount", [XO_WARP_ROUTE]);
      }
      const nonce = this.nonce;
      this.nonce += 1;
      const id = keccak256(concat([toHex(3, { size: 1 }), toHex(nonce, { size: 4 }), toHex(HYPERLANE_DOMAIN_XO, { size: 4 }), pad(XO_WARP_ROUTE, { size: 32 }), recipient, wordOf(amount)]));
      const delaySeconds = 12 + Number(BigInt(id) % 7n);
      const entry: HyperlaneMessage = {
        id,
        direction: "xo_to_base",
        sender,
        recipientWord: recipient,
        amount,
        dispatchedAtMs: env.clock.nowMs(),
        dueMs: env.clock.nowMs() + delaySeconds * 1000,
        state: "dispatched",
        failure: null,
      };
      this.messages.push(entry);
      if (mode === "accept-and-deliver") {
        env.scheduler.at(entry.dueMs, `deliver ${id.slice(0, 10)} to Base`, () => this.deliverToBase(entry));
      }
      // accept-no-deliver: the funds are burned on XO and the message is never relayed (FU9's open question).
    }
  }

  private async deliverToBase(message: HyperlaneMessage): Promise<void> {
    const word = BigInt(message.recipientWord);
    if (word >> 160n !== 0n || word === 0n || message.amount === 0n) {
      message.state = "undeliverable";
      message.failure = "invalid recipient or amount";
      return;
    }
    const recipient = getAddress(`0x${word.toString(16).padStart(40, "0")}`);
    this.baseBalances.set(accountKey(recipient), this.baseBalanceOf(recipient) + message.amount);
    message.state = "delivered";
    this.deliveredIds.add(lower(message.id));
  }

  // Decodes a landed UserOp's callData and processes it, for a test that landed an operation by hand.
  async processCallData(sender: Address, callData: Hex): Promise<void> {
    const calls = decodeKernelCalls(callData);
    if (calls !== null) await this.onUserOpLanded(sender, calls);
  }
}
