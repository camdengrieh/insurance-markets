import type { Address, Hex } from "viem";

import type { PreparedSign, RelayClient } from "../../../src/relay/contract.js";
import type { WriteFlagName } from "../../../src/relay/flags.js";

// Shared types of the live kit (docs/phase1-gap-closing.md section 6, amendments A4, A10, A11).
//
// The kit runs ONE test per script. Every script is a TestSpec plus a run() function; the harness
// (harness.ts) does everything that is the same for all of them: the refusals, the dry run, the
// printing of every call before it is made, the stop rules, the budget, the operator confirmation
// and the recording of capability facts.

export const TEST_IDS = ["T0", "T1", "T2", "T3a", "T4", "T3b", "T3c", "T5", "T8", "T6", "T6b"] as const;
export type TestId = (typeof TEST_IDS)[number];

export type Env = Readonly<Record<string, string | undefined>>;
export type TargetName = "mock" | "live";

export interface Clock {
  nowMs(): number;
  // Real time on the live target. On the mock it moves the mock's clock (and runs what the mock
  // scheduled inside the window: an inclusion, a delivery, an oracle review).
  sleep(ms: number): Promise<void>;
  // The short waits the relay makes to pace its requests. Same as sleep on the live target; on the mock it only
  // moves the clock, without running what the mock scheduled.
  pace?(ms: number): Promise<void>;
}

export interface Io {
  // One line of output (a newline is added). The harness scrubs secrets before it gets here.
  out(text: string): void;
  err(text: string): void;
  // Reads one line from the operator. Returns undefined when the input has ended.
  ask(prompt: string): Promise<string | undefined>;
}

// ---- the plan: what a run will do, printed before anything is sent ------------------------------------------

export interface PlannedCall {
  // relay: this machine's relay (loopback); xo: an XO host; base: the Base node; operator: a thing done by hand.
  readonly via: "relay" | "xo" | "base" | "operator";
  readonly method: string;
  // A route, a URL or a JSON-RPC method. Real host names, also on the mock target.
  readonly target: string;
  readonly note?: string;
}

export interface PlannedStep {
  readonly id: string;
  readonly title: string;
  readonly calls: readonly PlannedCall[];
  // Changes something on a third party or on chain (as opposed to reading).
  readonly write?: boolean;
  // Most USD this step can put at risk at once (decimal string).
  readonly exposureUsd?: string;
  // A condition in words, when the step does not always run ("only with --probes", "only if raw cannot sign").
  readonly when?: string;
}

// ---- command line --------------------------------------------------------------------------------------------

export type FlagKind = "string" | "bool" | "usd" | "address" | "hex32" | "int" | "decimal" | "url" | "list";

export interface FlagDef {
  readonly name: string;
  readonly kind: FlagKind;
  readonly help: string;
  readonly required?: boolean;
  readonly defaultValue?: string | boolean;
}

export interface Options {
  readonly target: TargetName;
  readonly confirm: boolean;
  readonly dryRun: boolean;
  readonly budgetUsd: string | undefined;
  readonly owner: Address | undefined;
  readonly credentialId: string | undefined;
  readonly dataDir: string | undefined;
  readonly mockProfile: "optimistic" | "pessimistic";
  readonly mockSet: readonly string[];
  readonly mockOwnerIndex: number;
  readonly recordText: string | undefined;
  readonly noRecord: boolean;
  readonly help: boolean;
  // The test's own flags, by name without the leading dashes.
  readonly extra: Readonly<Record<string, string | boolean | readonly string[]>>;
}

// ---- facts and results --------------------------------------------------------------------------------------

export interface FactProposal {
  readonly id: string;
  readonly state: "yes" | "no" | "unknown";
  // A short selected variant (see relay/capabilities.ts: letters, digits and . _ : -).
  readonly value?: string;
  readonly note: string;
}

export type Verdict = "pass" | "fail" | "stopped" | "inconclusive";

export interface TestResult {
  readonly verdict: Verdict;
  readonly summary: string;
  readonly facts: readonly FactProposal[];
  // What was observed, as label and value, in the order it was learned. Already free of secrets.
  readonly observations: readonly { readonly label: string; readonly value: string }[];
}

export class StopRule extends Error {
  readonly rule: string;
  constructor(rule: string, message: string) {
    super(message);
    this.name = "StopRule";
    this.rule = rule;
  }
}

export class Refusal extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "Refusal";
    this.code = code;
  }
}

// ---- guards on what a run may write --------------------------------------------------------------------------

export interface WriteAllowance {
  // What the write is called in the transcript ("bundler eth_sendUserOperation", "relay POST /v1/userop/submit").
  readonly label: string;
  readonly max: number;
  // A deliberate duplicate probe (T3b) may repeat a body; nothing else may.
  readonly allowDuplicate?: boolean;
}

// A cap on a group of reads (T2: at most 6 signed probes, whatever happens). Reaching it ends the run.
export interface ReadLimit {
  readonly name: string;
  readonly labels: readonly string[];
  readonly max: number;
}

export interface Needs {
  // The relay (in this process, on a free loopback port).
  readonly relay: boolean;
  // The relay's credential store (the XO HMAC triplet). Needs a master secret.
  readonly credentialStore: boolean;
  // Which mock chains the rehearsal needs.
  readonly xoChain: boolean;
  readonly baseChain: boolean;
  // The test uses market creation: the relay reads the metadata file from RELAY_SELF_HOST (the rehearsal declares its own).
  readonly creation?: boolean;
  // What the mock must look like before the script starts (on the mock target only). On live these are
  // the earlier tests' results, and the script checks them.
  readonly arrange: readonly ArrangeStep[];
}

export type ArrangeStep = "deployed" | "trading_enabled" | "funded" | "credentials" | "base_funded" | "funded_seed" | "market" | "fee_market" | "resolved_condition" | "created_market";

export interface TestSpec {
  readonly id: TestId;
  readonly slug: string;
  readonly title: string;
  readonly settles: readonly string[];
  // The table's worst-case cost in USD (decimal string); a budget above it is refused.
  readonly worstCaseUsd: string;
  readonly costNote: string;
  readonly stopRule: string;
  readonly preconditions: readonly string[];
  readonly flagsToArm: readonly WriteFlagName[];
  readonly steps: readonly PlannedStep[];
  readonly flags: readonly FlagDef[];
  readonly needs: Needs;
  readonly writes: readonly WriteAllowance[];
  // The writes this run may make when they depend on the options (T3b's --probes); replaces `writes`.
  writesFor?(opts: Options): readonly WriteAllowance[];
  readonly readLimits?: readonly ReadLimit[];
  // Most USD at risk at once for this run, from the options (decimal string).
  exposureUsd(opts: Options): string;
  // Checks the options the test needs beyond the common ones; returns a refusal text or undefined.
  checkOptions?(opts: Options, target: TargetName): string | undefined;
  run(ctx: RunContext): Promise<TestResult>;
}

// ---- the signer: PayBox, or a stand-in on the mock ---------------------------------------------------------------

export interface SignAsk {
  readonly label: string;
  // The relay's own signing block: the intent is passed to PayBox unchanged.
  readonly sign: PreparedSign;
  // T0's message-fallback probe only: sign this text with op message instead of the intent in `sign`.
  readonly message?: string;
  readonly digestTag: string;
  // Decoded lines from the relay, shown beside the request. Already cleaned.
  readonly summaryLines: readonly string[];
  // Seconds the signature stays useful (an auth item lives 90 s).
  readonly validForS?: number;
  // Which request_wallet_sign hex-prefix variant to use for a raw intent.
  readonly rawHexPrefix?: "0x" | "none";
}

export interface SignAnswer {
  // What PayBox returned, exactly as parsed from the operator's paste or produced by the stand-in.
  readonly raw: unknown;
  // Free text the operator added (what the signing window showed, for example).
  readonly operatorNote?: string;
}

// What only a person looking at PayBox can say. The stand-in answers from its options.
export type ProbeQuestion = "readiness_raw" | "readiness_typed_data" | "credential_mode" | "approval_state" | "window_shows";

export interface Signer {
  readonly kind: "simulated" | "operator";
  readonly owner: Address;
  sign(ask: SignAsk): Promise<SignAnswer>;
  // Asks about PayBox itself (T0). Free text, cleaned; "unknown" when nobody can say.
  probe(question: ProbeQuestion): Promise<string>;
}

// A Base transaction the operator (live) or the stand-in (mock) sends from the owner's wallet.
export interface BaseCall {
  readonly label: string;
  readonly chain: "eip155:8453";
  readonly to: Address;
  readonly value: "0";
  readonly data: Hex;
}

export interface BaseWallet {
  readonly kind: "simulated" | "operator";
  // Sends the call from the owner's address and returns the Base transaction hash once it is mined
  // (undefined when the operator says an approve was already mined and has no hash to give).
  send(call: BaseCall): Promise<Hex | undefined>;
}

// ---- what a running test sees --------------------------------------------------------------------------------------

export interface Observation {
  readonly label: string;
  readonly value: string;
}

export interface RunContext {
  readonly spec: TestSpec;
  readonly opts: Options;
  readonly target: TargetName;
  readonly clock: Clock;
  readonly owner: Address;
  readonly account: Address;
  // The operator's environment as the harness was given it (the run reads only the variables it documents).
  readonly env: Env;
  readonly client: RelayClient;
  readonly signer: Signer;
  readonly baseWallet: BaseWallet;
  readonly services: import("./relay.js").RunRelay | undefined;
  // Random bytes (a seam: tests fix them).
  random(bytes: number): Uint8Array;
  readonly world: import("./world.js").World;
  readonly net: import("./net.js").Net;
  // Printed lines; secrets are scrubbed on the way out.
  say(text: string): void;
  // Announces a plan step (must be one of spec.steps; a step that does not exist is a bug).
  step(id: string): void;
  observe(label: string, value: string): void;
  observations(): readonly Observation[];
  // Ends the run at a stop rule. Never returns.
  stop(rule: string, message: string): never;
  // Waits for something to become true, moving the clock. Returns the last value of the check.
  poll<T>(label: string, check: () => Promise<{ done: boolean; value: T }>, options: { timeoutMs: number; everyMs: number }): Promise<{ timedOut: boolean; value: T }>;
  ask(prompt: string): Promise<string | undefined>;
  // Registers a string that must never be printed (a signature, a triplet).
  hide(value: string | undefined): void;
}
