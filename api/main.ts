import { join } from "node:path";

import { createApi } from "./app.js";
import { assertStartable, describeConfig, loadApiConfig, API_VERSION, type ApiConfig } from "./config.js";
import { runKeysCli } from "./keys-cli.js";
import { serviceManifest } from "./listing.js";
import { SqliteMeteringStore } from "./metering-store.js";
import { createMeter, paymentParts } from "./metering.js";
import { startApiServer } from "./server.js";
import { SqliteIndexStore } from "./store.js";
import { createHonestFetch } from "./upstream.js";

// The markets API: the free read endpoints and the chain indexer (docs/sdk-and-api-design.md section 9, step 8), and the
// paid quote and route prepare endpoints with their metering (step 9), in one process. The only file that reads
// process.env, the global fetch and the wall clock; everything else takes them.
//
//   node api.mjs            serve (the default)
//   node api.mjs keys ...   issue, list or revoke subscription keys (keys-cli.ts) in API_DATA_DIR
//   node api.mjs listing    print the x402 listing manifest of the paid endpoints from the configuration (listing.ts)
//   node api.mjs --help

const USAGE = `insurance-markets-api ${API_VERSION}

  serve     answer GET /v1/health, /v1/venues, /v1/markets, /v1/markets/:venue/:id, /v1/groups, the paid GET /v1/quote and
            POST /v1/route/prepare, and run the chain indexer
  keys      keys issue --label <text> --tier quote|full [--per-minute N] [--burst N] [--days N] | keys list | keys revoke <id>
  listing   print the x402 listing manifest (paid endpoints, prices, rail) as JSON
  --help    this text

Configuration is the environment; see api/README.md. API_DATA_DIR is required. No secret is needed: the API holds no key,
and the payment address and prices are public values.`;

const HOUR_MS = 3_600_000;

function stamp(line: string): void {
  process.stdout.write(`${new Date().toISOString()} ${line}\n`);
}

async function serve(config: ApiConfig): Promise<void> {
  const dataDir = config.dataDir as string;
  let store: SqliteIndexStore;
  try {
    store = SqliteIndexStore.open(join(dataDir, "api.sqlite"));
  } catch (error) {
    process.stderr.write(`insurance-markets-api: the index database could not be opened (${error instanceof Error ? error.name : "error"}).\n`);
    process.exit(2);
  }
  let metering: SqliteMeteringStore;
  try {
    metering = SqliteMeteringStore.open(join(dataDir, "api.sqlite"));
  } catch (error) {
    process.stderr.write(`insurance-markets-api: the metering tables could not be opened (${error instanceof Error ? error.name : "error"}).\n`);
    process.exit(2);
  }
  const honest = createHonestFetch({ fetchImpl: globalThis.fetch });
  const facilitatorFetch = createHonestFetch({ fetchImpl: globalThis.fetch, timeoutMs: config.limits.facilitatorTimeoutMs, maxBytes: 64 * 1024 });
  const api = createApi({ config, store, fetchFor: () => honest, rpcFetch: honest, nowMs: Date.now, log: stamp });
  const meter = createMeter({ config, store: metering, ...paymentParts(config, facilitatorFetch, honest, Date.now), nowMs: Date.now, log: stamp });
  const server = await startApiServer({ api, config, meter, log: stamp });
  stamp(`listening on ${config.host}:${server.port}`);

  let stopping = false;
  const timers = new Set<NodeJS.Timeout>();
  for (const indexer of api.indexers) {
    const loop = async (): Promise<void> => {
      if (stopping) return;
      await indexer.pass();
      if (stopping) return;
      const timer = setTimeout(() => {
        timers.delete(timer);
        void loop();
      }, indexer.spec.tickMs);
      timers.add(timer);
    };
    void loop();
  }
  const prune = setInterval(() => {
    const deleted = store.pruneFills(Date.now() - config.fillRetentionDays * 24 * HOUR_MS);
    if (deleted > 0) stamp(`pruned ${deleted} fills older than ${config.fillRetentionDays} days`);
    // An authorization past its validBefore can no longer move funds; its replay row is kept a day longer, then dropped.
    metering.prunePayments(Math.floor(Date.now() / 1000) - 86_400);
  }, HOUR_MS);
  timers.add(prune);

  const stop = async (signal: string): Promise<void> => {
    if (stopping) return;
    stopping = true;
    stamp(`${signal}: stopping`);
    for (const timer of timers) clearTimeout(timer);
    await server.close();
    store.close();
    metering.close();
    stamp("stopped");
    process.exit(0);
  };
  process.on("SIGTERM", () => void stop("SIGTERM"));
  process.on("SIGINT", () => void stop("SIGINT"));
}

async function main(argv: readonly string[]): Promise<void> {
  const command = argv[0] ?? "serve";
  if (command === "--help" || command === "help") {
    process.stdout.write(`${USAGE}\n`);
    return;
  }
  if (command === "keys" || command === "listing") {
    const loaded = loadApiConfig(process.env);
    for (const issue of loaded.issues) process.stderr.write(`config ${issue.fatal ? "error" : "note"}: ${issue.variable}: ${issue.message}\n`);
    let config: ApiConfig;
    try {
      config = assertStartable(loaded);
    } catch {
      process.exit(2);
    }
    if (command === "listing") {
      if (argv.length > 1) process.exit(2);
      process.stdout.write(`${JSON.stringify(serviceManifest(config), null, 2)}\n`);
      return;
    }
    const metering = SqliteMeteringStore.open(join(config.dataDir as string, "api.sqlite"));
    const code = runKeysCli(metering, argv.slice(1), Date.now(), { out: (line) => process.stdout.write(`${line}\n`), err: (line) => process.stderr.write(`${line}\n`) });
    metering.close();
    process.exit(code);
  }
  if (command !== "serve" || argv.length > 1) {
    process.stderr.write(`${USAGE}\n`);
    process.exit(2);
  }
  const loaded = loadApiConfig(process.env);
  for (const issue of loaded.issues) process.stderr.write(`config ${issue.fatal ? "error" : "note"}: ${issue.variable}: ${issue.message}\n`);
  let config: ApiConfig;
  try {
    config = assertStartable(loaded);
  } catch {
    process.exit(2);
  }
  stamp(`insurance-markets-api ${API_VERSION}`);
  for (const line of describeConfig(config)) stamp(`  ${line}`);
  await serve(config);
}

void main(process.argv.slice(2));
