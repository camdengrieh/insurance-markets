import { randomBytes } from "node:crypto";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { pathToFileURL } from "node:url";

import { Secret } from "../../../src/config.js";
import { parseDecimalAtomic } from "../../../src/guardrails/amount.js";
import { RELAY_USER_AGENT, type GetPath, type GetResponse, type PostPath, type PostRequest, type PostResponse, type RelayCallOptions, type RelayClient, type RelayResult } from "../../../src/relay/contract.js";
import { parseFlags } from "../../../src/relay/flags.js";
import { deriveAccount } from "../../../src/xo/account/derive.js";
import { createTtyPrompt, resolveMasterSecret, type MasterSecretPrompt } from "../../../relay/config.js";
import type { CreateRelayOptions } from "../../../relay/main.js";
import { XO_UPSTREAM_HOSTS } from "../../../relay/upstream.js";
import type { RelayServices } from "../../../relay/types.js";
import { arrange } from "./arrange.js";
import { parseArgs, usageText } from "./args.js";
import { recordable, recordFacts, recordPhrase, withStandaloneRegistry } from "./facts.js";
import { Net, NetBlocked, type RecordedCall } from "./net.js";
import { Printer, SecretRegistry, cleanLine } from "./redact.js";
import { SAMPLE_SELF_HOST } from "./sample-metadata.js";
import { startRunRelay, type RunRelay } from "./relay.js";
import { buildWorld, type World, type WorldDeps } from "./world.js";
import {
  Refusal,
  StopRule,
  type Env,
  type FactProposal,
  type Io,
  type Observation,
  type Options,
  type RunContext,
  type TargetName,
  type TestResult,
  type TestSpec,
  type Verdict,
} from "./types.js";

// What every live-kit script does the same way (docs/phase1-gap-closing.md section 6 and 9 A4, A10, A11):
//
//   * defaults to a DRY RUN: prints the plan (every call, the cost, the stop rule) and sends nothing;
//   * refuses to run without --confirm, without an explicit --budget-usd, with a budget above the table's
//     worst case or below what the plan puts at risk, on the live target without the environment
//     acknowledgement for that test, and whenever the kill switch is on;
//   * prints every call (method, URL, body with secrets masked) BEFORE it is made, on both targets;
//   * never retries a write, and ends at the test's stop rule;
//   * records its outcome as capability facts only after the operator types the confirmation phrase.
//
// Exit codes: 0 = ran and passed, or a dry run that was asked for; 1 = ran and did not pass (a stop rule, a
// failure, an inconclusive result); 2 = refused before anything ran; 3 = internal error; 4 = the environment
// cannot run this (a rehearsal needs anvil).

export const EXIT = Object.freeze({ ok: 0, notPassed: 1, refused: 2, internal: 3, unavailable: 4 });

export interface HarnessDeps {
  readonly env?: Env;
  readonly io?: Io;
  readonly world?: WorldDeps;
  readonly createOptions?: Partial<CreateRelayOptions>;
  readonly extraServices?: Partial<RelayServices>;
  readonly masterSecret?: Secret;
  readonly masterPrompt?: MasterSecretPrompt;
  readonly tmpRoot?: string;
  readonly keepDataDir?: boolean;
  // Random bytes for the places that need them (T0's probe digest). Tests fix them.
  readonly random?: (bytes: number) => Uint8Array;
  // Test seam: called with the context just before the test runs.
  readonly onContext?: (ctx: RunContext) => void;
}

export interface RunReport {
  readonly exitCode: number;
  readonly status: "dry_run" | "refused" | "unavailable" | "error" | Verdict;
  readonly lines: readonly string[];
  readonly calls: readonly RecordedCall[];
  readonly steps: readonly string[];
  readonly result: TestResult | undefined;
  readonly recorded: readonly string[];
  readonly refusal: string | undefined;
  readonly dataDir: string | undefined;
}

// ---- the process's input and output ------------------------------------------------------------------------------

export function processIo(): Io {
  const queue: string[] = [];
  const waiting: Array<(line: string | undefined) => void> = [];
  let closed = false;
  let reader: ReturnType<typeof createInterface> | undefined;
  const open = (): void => {
    if (reader !== undefined) return;
    reader = createInterface({ input: process.stdin, terminal: false });
    reader.on("line", (line) => {
      const next = waiting.shift();
      if (next !== undefined) next(line);
      else queue.push(line);
    });
    reader.on("close", () => {
      closed = true;
      for (const next of waiting.splice(0)) next(undefined);
    });
  };
  return {
    out: (text) => {
      process.stdout.write(`${text}\n`);
    },
    err: (text) => {
      process.stderr.write(`${text}\n`);
    },
    ask: (prompt) => {
      open();
      process.stdout.write(prompt);
      const ready = queue.shift();
      if (ready !== undefined) return Promise.resolve(ready);
      if (closed) return Promise.resolve(undefined);
      return new Promise((resolve) => waiting.push(resolve));
    },
  };
}

// ---- refusals (pure; tested on their own) ---------------------------------------------------------------------------

function usdToMicro(text: string): bigint | undefined {
  const parsed = parseDecimalAtomic(text, 6);
  return parsed.ok ? parsed.value : undefined;
}

// Everything that must hold before a run may touch anything. Returns the reasons, in order; empty means go.
export function checkRefusals(spec: TestSpec, opts: Options, env: Env): readonly string[] {
  const problems: string[] = [];
  if (!opts.confirm) problems.push("--confirm was not given. This run is a dry run: nothing was sent.");
  const budget = opts.budgetUsd === undefined ? undefined : usdToMicro(opts.budgetUsd);
  if (opts.budgetUsd === undefined) {
    problems.push(`--budget-usd is required (explicit, even for a $0 test). The most this test can put at risk is $${spec.worstCaseUsd}.`);
  } else if (budget === undefined) {
    problems.push("--budget-usd is not a usable amount.");
  } else {
    const worst = usdToMicro(spec.worstCaseUsd) as bigint;
    if (budget > worst) problems.push(`--budget-usd $${opts.budgetUsd} is above the worst case for ${spec.id} ($${spec.worstCaseUsd}). Lower it.`);
    const planned = usdToMicro(spec.exposureUsd(opts));
    if (planned !== undefined && planned > budget) {
      problems.push(`this run would put $${spec.exposureUsd(opts)} at risk, which is above --budget-usd $${opts.budgetUsd}. Raise the budget (up to $${spec.worstCaseUsd}) or change the options.`);
    }
  }
  const option = spec.checkOptions?.(opts, opts.target);
  if (option !== undefined) problems.push(option);
  if (parseFlags(env).flags.KILL) problems.push("the kill switch is on (KILL or XO_KILL_SWITCH). Nothing runs while it is.");
  if (opts.target === "live") {
    const ack = (env["XO_LIVE_ACK"] ?? "")
      .split(",")
      .map((entry) => entry.trim().toLowerCase())
      .filter((entry) => entry !== "");
    if (!ack.includes(spec.id.toLowerCase())) {
      problems.push(`the live target needs the acknowledgement XO_LIVE_ACK=${spec.id} in the environment (a comma list of test ids; one test's acknowledgement does not cover another).`);
    }
    if (opts.owner === undefined) problems.push("--owner is required on the live target: the EVM address of the PayBox credential that owns the XO account.");
    if (opts.dataDir === undefined) problems.push("--data-dir is required on the live target: the relay's data directory, where the capability facts are kept.");
    if (opts.credentialId === undefined) problems.push("--credential-id is required on the live target: the PayBox credential_id, printed in the request_wallet_sign arguments.");
  }
  return problems;
}

// ---- printing the plan ---------------------------------------------------------------------------------------------------

function targetBanner(target: TargetName): string {
  return target === "mock"
    ? "MOCK: a local rehearsal on the mock XO. Nothing leaves this machine. The signer is a stand-in with a PUBLIC test key."
    : "LIVE: the real XO and Base services. PayBox is driven by you. Real accounts, real keys, real money.";
}

export function printPlan(printer: Printer, spec: TestSpec, opts: Options): void {
  printer.heading(`${spec.id}  ${spec.title}`);
  printer.line(`target:        ${targetBanner(opts.target)}`);
  printer.line(`settles:       ${spec.settles.join(", ")}`);
  printer.line(`worst case:    $${spec.worstCaseUsd}  (${spec.costNote})`);
  printer.line(`this run:      $${spec.exposureUsd(opts)} at risk at most${opts.budgetUsd === undefined ? "" : `; budget $${opts.budgetUsd}`}`);
  printer.line(`stop rule:     ${spec.stopRule}`);
  printer.line(`flags armed:   ${spec.flagsToArm.length === 0 ? "none (this test writes nothing that needs a flag)" : spec.flagsToArm.join(", ")} for this run only`);
  printer.line("preconditions:");
  for (const item of spec.preconditions) printer.line(`  - ${item}`);
  printer.line("plan (each call is printed again, with its body, just before it is made):");
  spec.steps.forEach((step, index) => {
    const tags = [step.write === true ? "WRITE" : undefined, step.exposureUsd === undefined ? undefined : `up to $${step.exposureUsd} at risk`, step.when].filter((tag): tag is string => tag !== undefined);
    printer.line(`  ${String(index + 1)}. ${step.title}${tags.length === 0 ? "" : `  [${tags.join("; ")}]`}`);
    for (const call of step.calls) printer.line(`       ${call.via.padEnd(8)} ${call.method.padEnd(6)} ${call.target}${call.note === undefined ? "" : `   (${call.note})`}`);
  });
}

// A stack trace names the directories it ran from; the repository and the home directory are replaced so that the text
// can be pasted into a report without naming a person.
export function scrubPaths(text: string): string {
  let out = text;
  for (const [path, label] of [[process.cwd(), "<repo>"], [homedir(), "~"]] as const) {
    if (path.length > 1) out = out.split(path).join(label);
  }
  return out;
}

function hostOf(value: string | undefined): string | undefined {
  if (value === undefined || value === "") return undefined;
  try {
    return new URL(value).hostname.toLowerCase();
  } catch {
    return undefined;
  }
}

// ---- running ------------------------------------------------------------------------------------------------------------------

async function pathExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

function guardedClient(raw: RelayClient, world: World, net: Net): RelayClient {
  const after = <T>(result: RelayResult<T>): RelayResult<T> => {
    if (net.tripped !== undefined) throw new StopRule(net.tripped.rule, net.tripped.message);
    if (!result.ok && result.error.code === "upstream_requires_key") {
      throw new StopRule("requires_key", "A host now asks for a key. Recorded as \"requires key\"; the kit does not look for one. Stop.");
    }
    return result;
  };
  return {
    async post<P extends PostPath>(path: P, body: PostRequest<P>, options?: RelayCallOptions): Promise<RelayResult<PostResponse<P>>> {
      return after(await world.pump(raw.post(path, body, options)));
    },
    async get<P extends GetPath>(path: P, options?: RelayCallOptions): Promise<RelayResult<GetResponse<P>>> {
      return after(await world.pump(raw.get(path, options)));
    },
  };
}

const NO_RELAY: RelayClient = {
  post: async () => {
    throw new Error("this test runs without a relay");
  },
  get: async () => {
    throw new Error("this test runs without a relay");
  },
};

export async function runLiveTest(spec: TestSpec, argv: readonly string[], deps: HarnessDeps = {}): Promise<RunReport> {
  const env = deps.env ?? process.env;
  const io = deps.io ?? processIo();
  const secrets = new SecretRegistry();
  const printer = new Printer(io, secrets);
  const steps: string[] = [];
  let net: Net | undefined;
  let dataDir: string | undefined;

  const report = (status: RunReport["status"], exitCode: number, extra: Partial<Pick<RunReport, "result" | "recorded" | "refusal">> = {}): RunReport => ({
    exitCode,
    status,
    lines: [...printer.lines],
    calls: net === undefined ? [] : [...net.calls],
    steps: [...steps],
    result: extra.result,
    recorded: extra.recorded ?? [],
    refusal: extra.refusal,
    dataDir,
  });

  const parsed = parseArgs(argv, spec.flags);
  if (!parsed.ok) {
    printer.error(`refused: ${parsed.error}`);
    printer.error(usageText(spec.slug, `${spec.id}  ${spec.title}`, spec.flags));
    return report("refused", EXIT.refused, { refusal: parsed.error });
  }
  const opts = parsed.opts;
  if (opts.help) {
    printer.line(usageText(spec.slug, `${spec.id}  ${spec.title}`, spec.flags));
    return report("dry_run", EXIT.ok);
  }

  printPlan(printer, spec, opts);

  if (opts.dryRun) {
    printer.line("");
    printer.line("DRY RUN: nothing was sent, signed or recorded.");
    return report("dry_run", EXIT.ok);
  }
  const problems = checkRefusals(spec, opts, env);
  if (problems.length > 0) {
    printer.line("");
    for (const problem of problems) printer.error(`REFUSED: ${problem}`);
    printer.error("Nothing was sent. Pass --dry-run to print the plan only, or --confirm with --budget-usd to run.");
    return report("refused", EXIT.refused, { refusal: problems.join(" ") });
  }

  // ---- from here on the run is real (on the mock target: a rehearsal) ------------------------------------------------
  let world: World | undefined;
  let relay: RunRelay | undefined;
  let tmp: string | undefined;
  let result: TestResult | undefined;
  let recorded: string[] = [];
  try {
    const built = await buildWorld({
      opts,
      printer,
      hide: (value) => secrets.add(value),
      needsXoChain: spec.needs.xoChain,
      needsBaseChain: spec.needs.baseChain,
      deps: deps.world ?? {},
    });
    if (!built.ok) {
      printer.error(`UNAVAILABLE: ${cleanLine(built.reason, 300)}`);
      return report("unavailable", EXIT.unavailable, { refusal: built.reason });
    }
    world = built.world;
    printer.line("");
    printer.line(world.banner);

    dataDir = opts.dataDir;
    if (dataDir === undefined) {
      tmp = await mkdtemp(join(deps.tmpRoot ?? tmpdir(), "live-kit-"));
      dataDir = tmp;
    }

    // The relay reads Base through RELAY_BASE_RPC_URL and the plugin's funding tool through XO_BASE_RPC_URL; both hosts are
    // on the list (and nothing else is), the public Base node when neither is set.
    const baseHosts = [...new Set(["RELAY_BASE_RPC_URL", "XO_BASE_RPC_URL"].map((name) => hostOf(env[name]) ?? "mainnet.base.org"))];
    const clock = world.clock;
    // A creation test reads the metadata file the person hosts: that one host, declared as RELAY_SELF_HOST, is on the list
    // too (the rehearsal declares its own pretend host).
    const selfHost = env["RELAY_SELF_HOST"] !== undefined && env["RELAY_SELF_HOST"] !== "" ? env["RELAY_SELF_HOST"] : opts.target === "mock" && spec.needs.creation === true ? SAMPLE_SELF_HOST : undefined;
    const selfHostName = hostOf(selfHost);
    net = new Net({
      baseFetch: world.baseFetch,
      printer,
      nowMs: () => clock.nowMs(),
      allowedHosts: [...XO_UPSTREAM_HOSTS.map((entry) => entry.host), ...world.extraHosts, ...baseHosts, ...(selfHostName === undefined ? [] : [selfHostName])],
      keylessHosts: XO_UPSTREAM_HOSTS.filter((entry) => entry.keyless === true).map((entry) => entry.host),
      writes: spec.writesFor?.(opts) ?? spec.writes,
      ...(spec.readLimits === undefined ? {} : { readLimits: spec.readLimits }),
      userAgent: RELAY_USER_AGENT,
    });
    const owner = world.owner;
    const account = deriveAccount(owner);

    let services: RunRelay | undefined;
    if (spec.needs.relay) {
      let masterSecret: Secret | undefined;
      if (spec.needs.credentialStore) {
        if (deps.masterSecret !== undefined) masterSecret = deps.masterSecret;
        else if (opts.target === "mock" && (env["RELAY_MASTER_KEY"] ?? "") === "") masterSecret = new Secret(randomBytes(24).toString("base64url"));
        else {
          const resolved = await resolveMasterSecret(env, [], deps.masterPrompt ?? createTtyPrompt(), !(await pathExists(join(dataDir, "secrets", "keyring.json"))));
          if (!resolved.ok) {
            printer.error(`REFUSED: RELAY_MASTER_KEY: ${resolved.message}`);
            return report("refused", EXIT.refused, { refusal: resolved.message });
          }
          masterSecret = resolved.secret;
        }
        secrets.add(masterSecret.reveal());
      }
      try {
        services = await startRunRelay({
          env: selfHost === undefined ? env : { ...env, RELAY_SELF_HOST: selfHost },
          dataDir,
          flagsToArm: spec.flagsToArm,
          credentialStore: spec.needs.credentialStore,
          ...(masterSecret === undefined ? {} : { masterSecret }),
          net,
          clock: { nowMs: () => clock.nowMs(), sleep: (ms) => (clock.pace ?? clock.sleep)(ms) },
          // createRelay adds the host of RELAY_BASE_RPC_URL itself; without one the public Base node is the default.
          extraUpstreamHosts: (env["RELAY_BASE_RPC_URL"] === undefined || env["RELAY_BASE_RPC_URL"] === "" ? [...new Set([...baseHosts, ...world.extraHosts])] : []).map((host) => ({ host, methods: ["GET", "POST"] as const })),
          ...(deps.extraServices === undefined ? {} : { extraServices: deps.extraServices }),
          ...(deps.createOptions === undefined ? {} : { createOptions: deps.createOptions }),
          generousBudgets: opts.target === "mock",
        });
      } catch (error) {
        const code = error instanceof Error ? (error as { code?: string }).code ?? error.name : "unknown";
        if (env["LIVE_KIT_DEBUG"] === "1" && error instanceof Error) printer.error(cleanLine(scrubPaths(error.stack ?? error.message), 1500));
        printer.error(`REFUSED: the relay could not start (${cleanLine(code, 60)}). If \`pnpm relay\` is running on this data directory, stop it first: a data directory has one owner at a time.`);
        return report("refused", EXIT.refused, { refusal: `relay start: ${code}` });
      }
      relay = services;
      secrets.add(services.key.reveal());
      for (const issue of services.issues) printer.line(`note: ${issue}`);
      printer.line(`relay: this process, ${services.url}, data directory ${dataDir === tmp ? "(temporary, removed at the end)" : dataDir}`);
    }

    const observations: Observation[] = [];
    const ctx: RunContext = {
      spec,
      opts,
      target: opts.target,
      clock,
      owner,
      account,
      env,
      client: relay === undefined ? NO_RELAY : guardedClient(relay.client, world, net),
      signer: world.signer,
      baseWallet: world.baseWallet,
      services: relay,
      world,
      net,
      say: (text) => printer.line(text),
      step: (id) => {
        const index = spec.steps.findIndex((step) => step.id === id);
        if (index === -1) throw new Error(`step ${id} is not in the plan of ${spec.id}`);
        steps.push(id);
        printer.line("");
        printer.line(`--- step ${String(index + 1)} of ${String(spec.steps.length)}: ${(spec.steps[index] as { title: string }).title}`);
      },
      observe: (label, value) => {
        const clean = cleanLine(value, 400);
        observations.push({ label, value: clean });
        printer.line(`observed: ${label} = ${clean}`);
      },
      observations: () => [...observations],
      stop: (rule, message) => {
        throw new StopRule(rule, message);
      },
      async poll(label, check, options) {
        const started = clock.nowMs();
        let printedAt = Number.NEGATIVE_INFINITY;
        for (;;) {
          const last = await check();
          if (last.done) return { timedOut: false, value: last.value };
          if (net?.tripped !== undefined) throw new StopRule(net.tripped.rule, net.tripped.message);
          const elapsed = clock.nowMs() - started;
          if (elapsed >= options.timeoutMs) return { timedOut: true, value: last.value };
          // One line a minute is enough to see that it is alive.
          if (elapsed - printedAt >= 60_000) {
            printer.line(`   waiting for ${label} ... ${String(Math.round(elapsed / 1000))} s of ${String(Math.round(options.timeoutMs / 1000))} s`);
            printedAt = elapsed;
          }
          await clock.sleep(options.everyMs);
        }
      },
      ask: (prompt) => printer.ask(prompt),
      hide: (value) => secrets.add(value),
      random: (bytes) => (deps.random ?? ((n) => randomBytes(n)))(bytes),
    };

    // The mock stands in for what the earlier tests (and the people running them) would have left behind.
    if (world.target === "mock" && world.mock !== undefined && spec.needs.arrange.length > 0) {
      try {
        await printer.quietly(() => (net as Net).arranging(() => arrange(ctx, spec.needs.arrange)));
      } catch (error) {
        if (!(error instanceof Refusal)) throw error;
        // Not a finding of the test: the rehearsal could not stand in for the earlier tests under these mock switches.
        printer.error(`UNAVAILABLE: ${cleanLine(error.message, 300)} (the rehearsal's own set-up, not a result of ${spec.id}; try --mock-profile optimistic or other --mock-set values)`);
        return report("unavailable", EXIT.unavailable, { refusal: error.message });
      }
      // What the set-up observed is not this test's finding.
      observations.length = 0;
    }

    if (opts.target === "live") {
      const phrase = `RUN ${spec.id}`;
      printer.line("");
      printer.line(`This run acts on the REAL services. Type exactly   ${phrase}   to start (anything else cancels).`);
      const answer = await printer.ask("> ");
      if (answer === undefined || answer.trim() !== phrase) {
        printer.error("Cancelled: the confirmation text did not match. Nothing was sent.");
        return report("refused", EXIT.refused, { refusal: "operator did not confirm" });
      }
    }

    deps.onContext?.(ctx);
    try {
      result = await spec.run(ctx);
      if (net.tripped !== undefined && result.verdict !== "stopped") {
        result = { ...result, verdict: "stopped", summary: `${net.tripped.message} (${result.summary})` };
      }
    } catch (error) {
      if (error instanceof StopRule) {
        result = { verdict: "stopped", summary: `STOP RULE ${error.rule}: ${error.message}`, facts: stopFacts(spec, error), observations: ctx.observations() };
      } else if (error instanceof NetBlocked) {
        result = { verdict: "stopped", summary: `STOP RULE ${error.rule}: ${error.message}`, facts: stopFacts(spec, new StopRule(error.rule, error.message)), observations: ctx.observations() };
      } else if (error instanceof Refusal) {
        result = { verdict: "inconclusive", summary: `${error.code}: ${error.message}`, facts: [], observations: ctx.observations() };
      } else {
        throw error;
      }
    }
    if (net.tripped !== undefined && result.verdict === "stopped" && result.facts.length === 0) {
      result = { ...result, facts: stopFacts(spec, new StopRule(net.tripped.rule, net.tripped.message)) };
    }

    // ---- the result ----------------------------------------------------------------------------------------------------
    printer.heading(`RESULT ${spec.id}: ${result.verdict.toUpperCase()}`);
    printer.line(result.summary);
    for (const entry of result.observations) printer.line(`  ${entry.label}: ${entry.value}`);
    const items = recordable(result.facts);
    if (result.facts.length > 0) {
      printer.line("capability facts this run proposes:");
      for (const fact of result.facts) printer.line(`  ${fact.id} = ${fact.state}${fact.value === undefined ? "" : ` (${fact.value})`}${fact.state === "unknown" ? "  [not recorded: unknown is not a result]" : ""}: ${cleanLine(fact.note, 240)}`);
    }

    if (opts.noRecord) {
      printer.line("Not recording (--no-record).");
    } else if (items.length > 0) {
      const phrase = recordPhrase(spec, result.facts) as string;
      printer.line("");
      printer.line(`To record these in the relay's capability register, type exactly   ${phrase}   (anything else records nothing).`);
      const answer = opts.recordText ?? (await printer.ask("> "));
      if (answer !== undefined && answer.trim() === phrase) {
        const outcome =
          relay !== undefined
            ? await recordFacts(relay.services.capabilities, result.facts)
            : await withStandaloneRegistry(dataDir, () => clock.nowMs(), (registry) => recordFacts(registry, result?.facts ?? []));
        recorded = [...outcome.recorded];
        printer.line(`Recorded: ${outcome.recorded.length === 0 ? "nothing" : outcome.recorded.join(", ")}.`);
        for (const failure of outcome.failed) printer.error(`Not recorded: ${failure.id}: ${failure.reason}`);
      } else {
        printer.line("The text did not match. Nothing was recorded.");
      }
    }

    const status: RunReport["status"] = result.verdict;
    return report(status, result.verdict === "pass" ? EXIT.ok : EXIT.notPassed, { result, recorded });
  } catch (error) {
    printer.error(`INTERNAL ERROR: ${cleanLine(error instanceof Error ? `${error.name}: ${error.message}` : String(error), 400)}`);
    return report("error", EXIT.internal, { refusal: error instanceof Error ? error.name : "error" });
  } finally {
    await relay?.close().catch(() => undefined);
    await world?.close().catch(() => undefined);
    if (tmp !== undefined && deps.keepDataDir !== true) await rm(tmp, { recursive: true, force: true }).catch(() => undefined);
  }
}

// What a stop rule leaves behind as a proposed fact: the test itself did not pass.
function stopFacts(spec: TestSpec, stop: StopRule): TestResult["facts"] {
  const note = cleanLine(`stopped by ${stop.rule}: ${stop.message}`, 200);
  const facts: FactProposal[] = [{ id: spec.id, state: "no", note }];
  if (stop.rule === "requires_key") facts.push({ id: "UO9", state: "no" as const, note: "A host that XO documents as needing a key answered 401 or 403. Recorded as requires key; nobody looks for a key." });
  return facts;
}

// For scripts: the entry point.
export async function main(spec: TestSpec, argv: readonly string[]): Promise<void> {
  const reportOut = await runLiveTest(spec, argv);
  process.exitCode = reportOut.exitCode;
}

export function isEntryPoint(metaUrl: string): boolean {
  const entry = process.argv[1];
  return entry !== undefined && metaUrl === pathToFileURL(entry).href;
}

