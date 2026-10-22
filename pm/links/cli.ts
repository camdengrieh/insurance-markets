// Human-approval CLI for the link dataset.
//
//   tsx pm/links/cli.ts <command> [flags]
//
//   init                       create an empty working registry
//   propose                    add a CANDIDATE from a JSON file (any source; never approves)
//   list | show <id>           inspect records
//   review <id>                print the review sheet and the digest an approval must quote
//   approve <id>               explicit human approval (reviewer, date, evidence, digest, ack)
//   suspend | revoke | veto    take a link out of service
//   export                     build a hash-pinned bundle (optionally refresh the shipped one)
//   verify-bundle <file>       validate a bundle against its pin
//   lookup                     run the pm_lookup_links logic on a bundle
//   hash                       rules and masked hashes of a raw market record (prints hashes only)
//   goldset validate|eval      gold-set tooling
//
// Approval is never automatic: `approve` is the only command that creates an approved link and it
// refuses without every input listed above. No command touches the network.

import { parseArgs } from "node:util";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { APPROVAL_ACK, approveLink, reviewSheet } from "./approve.js";
import { buildBundle, serializeBundle, validateBundle } from "./bundle.js";
import { entityTableSha256, hashRuleRecord } from "./hash.js";
import { lookupLinks } from "./lookup.js";
import { nodeConfirm, nodeFileEnv, readRegistry, writeRegistry, type FileEnv } from "./registry-file.js";
import { PROPOSER_SOURCES, TIERS, type ProposerSource, type Tier } from "./schema.js";
import { findLink, proposeLink, revokeLink, suspendLink, vetoLink } from "./store.js";
import { evaluate } from "../../sdk/links/goldset/evaluate.js";
import { parseGoldSet, parsePredictions } from "./goldset/format.js";
import { formatReport } from "../../sdk/links/goldset/report.js";

export interface CliEnv {
  readonly files: FileEnv;
  readonly out: (text: string) => void;
  readonly err: (text: string) => void;
  // Calendar date YYYY-MM-DD and instant, injectable for tests.
  readonly today: () => string;
  readonly now: () => Date;
  readonly registryPath: string;
  readonly dataDir: string;
  // Asks the person at the terminal one question and returns what they typed; null when there is
  // no interactive terminal. Approval refuses without it.
  readonly confirm: (question: string) => string | null;
}

const HERE = dirname(fileURLToPath(import.meta.url));

export function defaultCliEnv(): CliEnv {
  return {
    files: nodeFileEnv,
    out: (t) => process.stdout.write(t),
    err: (t) => process.stderr.write(t),
    today: () => new Date().toISOString().slice(0, 10),
    now: () => new Date(),
    registryPath: join(HERE, "data", "registry.json"),
    dataDir: join(HERE, "data"),
    confirm: nodeConfirm,
  };
}

class Usage extends Error {}

function fail(env: CliEnv, errors: readonly string[]): number {
  for (const e of errors) env.err(`error: ${e}\n`);
  return 1;
}

function json(env: CliEnv, value: unknown): void {
  env.out(`${JSON.stringify(value, null, 2)}\n`);
}

function readJson(env: CliEnv, path: string): unknown {
  try {
    return JSON.parse(env.files.readText(path)) as unknown;
  } catch {
    throw new Usage(`cannot read JSON from ${path}`);
  }
}

function need(value: string | undefined, flag: string): string {
  if (value === undefined || value === "") throw new Usage(`missing --${flag}`);
  return value;
}

function isSource(value: string): value is ProposerSource {
  return (PROPOSER_SOURCES as readonly string[]).includes(value);
}
function isTier(value: string): value is Tier {
  return (TIERS as readonly string[]).includes(value);
}

const USAGE = `usage: tsx pm/links/cli.ts <command>
  init | propose | list | show | review | approve | suspend | revoke | veto
  export | verify-bundle | lookup | hash | goldset validate|eval
Run with a command and --help-less flags as documented at the top of pm/links/cli.ts.
`;

export async function runCli(argv: readonly string[], env: CliEnv = defaultCliEnv()): Promise<number> {
  try {
    return await dispatch(argv, env);
  } catch (e) {
    if (e instanceof Usage) {
      env.err(`usage error: ${e.message}\n`);
      return 2;
    }
    if (e instanceof Error && "code" in e && String((e as Error & { code: unknown }).code).startsWith("ERR_PARSE_ARGS")) {
      env.err(`usage error: ${e.message}\n`);
      return 2;
    }
    throw e;
  }
}

async function dispatch(argv: readonly string[], env: CliEnv): Promise<number> {
  const [command, ...rest] = argv;
  if (command === undefined) {
    env.err(USAGE);
    return 2;
  }
  switch (command) {
    case "init":
      return cmdInit(rest, env);
    case "propose":
      return cmdPropose(rest, env);
    case "list":
      return cmdList(rest, env);
    case "show":
      return cmdShow(rest, env);
    case "review":
      return cmdReview(rest, env);
    case "approve":
      return cmdApprove(rest, env);
    case "suspend":
      return cmdSuspend(rest, env);
    case "revoke":
      return cmdRevoke(rest, env);
    case "veto":
      return cmdVeto(rest, env);
    case "export":
      return cmdExport(rest, env);
    case "verify-bundle":
      return cmdVerifyBundle(rest, env);
    case "lookup":
      return cmdLookup(rest, env);
    case "hash":
      return cmdHash(rest, env);
    case "goldset":
      return cmdGoldset(rest, env);
    default:
      env.err(`unknown command "${command}"\n${USAGE}`);
      return 2;
  }
}

function registryPath(env: CliEnv, flag: string | undefined): string {
  return flag === undefined ? env.registryPath : resolve(flag);
}

function cmdInit(args: readonly string[], env: CliEnv): number {
  const { values } = parseArgs({ args: [...args], options: { registry: { type: "string" } }, strict: true });
  const path = registryPath(env, values.registry);
  if (env.files.exists(path)) return fail(env, [`registry already exists at ${path}`]);
  const read = readRegistry(env.files, path);
  if (!read.ok) return fail(env, read.errors);
  writeRegistry(env.files, path, read.value);
  env.out(`created empty registry\n`);
  return 0;
}

function cmdPropose(args: readonly string[], env: CliEnv): number {
  const { values } = parseArgs({
    args: [...args],
    options: {
      registry: { type: "string" },
      file: { type: "string" },
      source: { type: "string" },
      by: { type: "string" },
    },
    strict: true,
  });
  const source = need(values.source, "source");
  if (!isSource(source)) throw new Usage(`--source must be one of ${PROPOSER_SOURCES.join(", ")}`);
  const path = registryPath(env, values.registry);
  const reg = readRegistry(env.files, path);
  if (!reg.ok) return fail(env, reg.errors);
  const input = readJson(env, need(values.file, "file"));
  const result = proposeLink(reg.value, input, { source, id: need(values.by, "by") }, { today: env.today() });
  if (!result.ok) return fail(env, result.errors);
  writeRegistry(env.files, path, result.value.registry);
  json(env, { linkId: result.value.link.linkId, state: result.value.link.state, tierCap: result.value.link.tierCap });
  return 0;
}

function cmdList(args: readonly string[], env: CliEnv): number {
  const { values } = parseArgs({
    args: [...args],
    options: { registry: { type: "string" }, state: { type: "string" } },
    strict: true,
  });
  const reg = readRegistry(env.files, registryPath(env, values.registry));
  if (!reg.ok) return fail(env, reg.errors);
  const rows = reg.value.links
    .filter((l) => values.state === undefined || l.state === values.state)
    .map((l) => ({
      linkId: l.linkId,
      state: l.state,
      relation: l.relation,
      tierCap: l.tierCap,
      proof: l.proof.level,
      synthetic: l.synthetic,
      markets: l.legs.map((leg) => `${leg.venue}:${leg.marketId}`),
    }));
  json(env, rows);
  return 0;
}

function linkIdArg(positionals: readonly string[]): string {
  const id = positionals[0];
  if (id === undefined || positionals.length !== 1) throw new Usage("expected exactly one link id");
  return id;
}

function cmdShow(args: readonly string[], env: CliEnv): number {
  const { values, positionals } = parseArgs({ args: [...args], options: { registry: { type: "string" } }, allowPositionals: true, strict: true });
  const reg = readRegistry(env.files, registryPath(env, values.registry));
  if (!reg.ok) return fail(env, reg.errors);
  const link = findLink(reg.value, linkIdArg(positionals));
  if (link === undefined) return fail(env, ["no such link"]);
  json(env, link);
  return 0;
}

function cmdReview(args: readonly string[], env: CliEnv): number {
  const { values, positionals } = parseArgs({ args: [...args], options: { registry: { type: "string" } }, allowPositionals: true, strict: true });
  const reg = readRegistry(env.files, registryPath(env, values.registry));
  if (!reg.ok) return fail(env, reg.errors);
  const link = findLink(reg.value, linkIdArg(positionals));
  if (link === undefined) return fail(env, ["no such link"]);
  // Review only prints: it changes nothing. Approval is a separate command.
  json(env, { sheet: reviewSheet(link), record: link, approvalAcknowledgement: APPROVAL_ACK });
  return 0;
}

function cmdApprove(args: readonly string[], env: CliEnv): number {
  const { values, positionals } = parseArgs({
    args: [...args],
    options: {
      registry: { type: "string" },
      reviewer: { type: "string" },
      date: { type: "string" },
      evidence: { type: "string", multiple: true },
      digest: { type: "string" },
      ack: { type: "string" },
      "tier-cap": { type: "string" },
    },
    allowPositionals: true,
    strict: true,
  });
  const id = linkIdArg(positionals);
  const tierCapFlag = values["tier-cap"];
  if (tierCapFlag !== undefined && !isTier(tierCapFlag)) throw new Usage(`--tier-cap must be one of ${TIERS.join(", ")}`);
  const path = registryPath(env, values.registry);
  const reg = readRegistry(env.files, path);
  if (!reg.ok) return fail(env, reg.errors);
  // A per-link challenge on an interactive terminal: the reviewer types the first 8 characters of
  // the digest they are approving. Refused before anything is evaluated or written.
  const digestArg = need(values.digest, "digest");
  const code = digestArg.slice(0, 8);
  const typed = env.confirm(`Approving ${id}. To confirm you read both rule texts, type the first 8 characters of the digest (${code}): `);
  if (typed === null) return fail(env, ["approval needs an interactive terminal (stdin is not a TTY); nothing changed"]);
  if (typed !== code) return fail(env, ["typed confirmation does not match the digest; nothing changed"]);
  const result = approveLink(
    reg.value,
    id,
    {
      reviewer: need(values.reviewer, "reviewer"),
      date: need(values.date, "date"),
      evidence: values.evidence ?? [],
      digest: digestArg,
      acknowledgement: need(values.ack, "ack"),
      ...(tierCapFlag === undefined ? {} : { tierCap: tierCapFlag }),
    },
    { today: env.today() },
  );
  if (!result.ok) return fail(env, result.errors);
  writeRegistry(env.files, path, result.value.registry);
  json(env, {
    linkId: id,
    state: result.value.link.state,
    finalised: result.value.finalised,
    approvals: result.value.link.approvals.length,
    tierCap: result.value.link.tierCap,
  });
  return 0;
}

function cmdSuspend(args: readonly string[], env: CliEnv): number {
  const { values, positionals } = parseArgs({
    args: [...args],
    options: { registry: { type: "string" }, by: { type: "string" }, reason: { type: "string" } },
    allowPositionals: true,
    strict: true,
  });
  const path = registryPath(env, values.registry);
  const reg = readRegistry(env.files, path);
  if (!reg.ok) return fail(env, reg.errors);
  const result = suspendLink(reg.value, linkIdArg(positionals), need(values.by, "by"), need(values.reason, "reason"), { today: env.today() });
  if (!result.ok) return fail(env, result.errors);
  writeRegistry(env.files, path, result.value);
  env.out("suspended\n");
  return 0;
}

function cmdRevoke(args: readonly string[], env: CliEnv): number {
  const { values, positionals } = parseArgs({
    args: [...args],
    options: { registry: { type: "string" }, by: { type: "string" }, reason: { type: "string" } },
    allowPositionals: true,
    strict: true,
  });
  const path = registryPath(env, values.registry);
  const reg = readRegistry(env.files, path);
  if (!reg.ok) return fail(env, reg.errors);
  const result = revokeLink(reg.value, linkIdArg(positionals), need(values.by, "by"), need(values.reason, "reason"), { today: env.today() });
  if (!result.ok) return fail(env, result.errors);
  writeRegistry(env.files, path, result.value);
  env.out("revoked\n");
  return 0;
}

function cmdVeto(args: readonly string[], env: CliEnv): number {
  const { values, positionals } = parseArgs({
    args: [...args],
    options: { registry: { type: "string" }, by: { type: "string" }, source: { type: "string" }, reason: { type: "string" } },
    allowPositionals: true,
    strict: true,
  });
  const source = need(values.source, "source");
  if (!isSource(source)) throw new Usage(`--source must be one of ${PROPOSER_SOURCES.join(", ")}`);
  const path = registryPath(env, values.registry);
  const reg = readRegistry(env.files, path);
  if (!reg.ok) return fail(env, reg.errors);
  const result = vetoLink(
    reg.value,
    linkIdArg(positionals),
    { source, id: need(values.by, "by") },
    need(values.reason, "reason"),
    { today: env.today() },
  );
  if (!result.ok) return fail(env, result.errors);
  writeRegistry(env.files, path, result.value);
  env.out("vetoed\n");
  return 0;
}

function cmdExport(args: readonly string[], env: CliEnv): number {
  const { values } = parseArgs({
    args: [...args],
    options: {
      registry: { type: "string" },
      out: { type: "string" },
      "created-at": { type: "string" },
      "include-candidates": { type: "boolean" },
      "entities-file": { type: "string" },
      "write-shipped": { type: "boolean" },
    },
    strict: true,
  });
  const reg = readRegistry(env.files, registryPath(env, values.registry));
  if (!reg.ok) return fail(env, reg.errors);
  const createdAt = values["created-at"] ?? env.now().toISOString().replace(/\.\d{3}Z$/, "Z");
  let entityHash: string | null = null;
  if (values["entities-file"] !== undefined) {
    const entities = readJson(env, values["entities-file"]);
    if (!Array.isArray(entities) || !entities.every((e) => typeof e === "string")) throw new Usage("entities file must be a JSON array of strings");
    entityHash = entityTableSha256(entities as string[]);
  }
  const built = buildBundle(reg.value, {
    createdAt,
    includeCandidates: values["include-candidates"] === true,
    entityTableSha256: entityHash,
  });
  if (!built.ok) return fail(env, built.errors);
  const text = serializeBundle(built.value);
  if (values["write-shipped"] === true) {
    if (built.value.manifest.synthetic) return fail(env, ["synthetic fixtures cannot be shipped"]);
    env.files.writeText(join(env.dataDir, "links.bundle.json"), text);
    env.files.writeText(join(env.dataDir, "links.bundle.pin"), `${built.value.manifestSha256}\n`);
    env.files.writeText(
      join(env.dataDir, "..", "shipped-data.ts"),
      `// Generated by \`tsx pm/links/cli.ts export --write-shipped\`. Do not edit by hand.\n` +
        `// SHIPPED_BUNDLE_PIN pins the manifest of SHIPPED_BUNDLE_JSON; both are checked at load time.\n` +
        `export const SHIPPED_BUNDLE_PIN = ${JSON.stringify(built.value.manifestSha256)};\n` +
        `export const SHIPPED_BUNDLE_JSON = ${JSON.stringify(text)};\n`,
    );
  } else {
    const out = need(values.out, "out");
    env.files.writeText(resolve(out), text);
  }
  json(env, { manifestSha256: built.value.manifestSha256, counts: built.value.manifest.counts });
  return 0;
}

function cmdVerifyBundle(args: readonly string[], env: CliEnv): number {
  const { values, positionals } = parseArgs({
    args: [...args],
    options: { pin: { type: "string" }, unpinned: { type: "boolean" }, "allow-synthetic": { type: "boolean" } },
    allowPositionals: true,
    strict: true,
  });
  const file = positionals[0];
  if (file === undefined) throw new Usage("expected a bundle file");
  const text = env.files.readText(resolve(file));
  const result = validateBundle(text, {
    ...(values.pin === undefined ? {} : { expectedManifestSha256: values.pin }),
    unpinned: values.unpinned === true,
    allowSynthetic: values["allow-synthetic"] === true,
  });
  if (!result.ok) return fail(env, result.errors);
  json(env, { ok: true, manifestSha256: result.value.manifestSha256, counts: result.value.manifest.counts });
  return 0;
}

function cmdLookup(args: readonly string[], env: CliEnv): number {
  const { values } = parseArgs({
    args: [...args],
    options: {
      bundle: { type: "string" },
      pin: { type: "string" },
      venue: { type: "string" },
      "market-id": { type: "string" },
      detail: { type: "boolean" },
      "allow-synthetic": { type: "boolean" },
    },
    strict: true,
  });
  const text = env.files.readText(resolve(need(values.bundle, "bundle")));
  const bundle = validateBundle(text, { expectedManifestSha256: need(values.pin, "pin"), allowSynthetic: values["allow-synthetic"] === true });
  if (!bundle.ok) return fail(env, bundle.errors);
  const result = lookupLinks(
    bundle.value,
    { venue: need(values.venue, "venue"), marketId: need(values["market-id"], "market-id"), detail: values.detail === true },
    { now: env.now() },
  );
  if (!result.ok) return fail(env, [`${result.error}: ${result.detail}`]);
  json(env, result.value);
  return 0;
}

function cmdHash(args: readonly string[], env: CliEnv): number {
  const { values } = parseArgs({
    args: [...args],
    options: { venue: { type: "string" }, record: { type: "string" }, "entities-file": { type: "string" } },
    strict: true,
  });
  const record = readJson(env, need(values.record, "record"));
  if (typeof record !== "object" || record === null || Array.isArray(record)) throw new Usage("record must be a JSON object");
  let entities: string[] = [];
  if (values["entities-file"] !== undefined) {
    const e = readJson(env, values["entities-file"]);
    if (!Array.isArray(e) || !e.every((x) => typeof x === "string")) throw new Usage("entities file must be a JSON array of strings");
    entities = e as string[];
  }
  const hashes = hashRuleRecord(need(values.venue, "venue"), record as Record<string, unknown>, { entities });
  if (!hashes.ok) return fail(env, [`${hashes.error}${hashes.detail === undefined ? "" : `: ${hashes.detail}`}`]);
  // Hashes only: the rule text itself is never printed or stored (Kalshi data is memory-only).
  json(env, {
    rulesSha256: hashes.value.rulesSha256,
    maskedSha256: hashes.value.maskedSha256,
    entityTableSha256: entities.length > 0 ? entityTableSha256(entities) : null,
  });
  return 0;
}

function cmdGoldset(args: readonly string[], env: CliEnv): number {
  const [sub, ...rest] = args;
  if (sub === "validate") {
    const { values } = parseArgs({ args: [...rest], options: { gold: { type: "string" } }, strict: true });
    const parsed = parseGoldSet(readJson(env, need(values.gold, "gold")));
    if (!parsed.ok) return fail(env, parsed.errors);
    json(env, { ok: true, labels: parsed.value.labels.length });
    return 0;
  }
  if (sub === "eval") {
    const { values } = parseArgs({
      args: [...rest],
      options: { gold: { type: "string" }, predictions: { type: "string" }, json: { type: "boolean" } },
      strict: true,
    });
    const gold = parseGoldSet(readJson(env, need(values.gold, "gold")));
    if (!gold.ok) return fail(env, gold.errors);
    const preds = parsePredictions(readJson(env, need(values.predictions, "predictions")));
    if (!preds.ok) return fail(env, preds.errors);
    const report = evaluate(gold.value, preds.value);
    if (values.json === true) json(env, report);
    else env.out(formatReport(report));
    return 0;
  }
  throw new Usage("goldset needs a subcommand: validate or eval");
}

// Run only when executed directly, not when imported by tests.
const entry = process.argv[1];
if (entry !== undefined && import.meta.url === pathToFileURL(resolve(entry)).href) {
  runCli(process.argv.slice(2)).then(
    (code) => {
      process.exitCode = code;
    },
    (e: unknown) => {
      process.stderr.write(`fatal: ${e instanceof Error ? e.message : String(e)}\n`);
      process.exitCode = 1;
    },
  );
}
