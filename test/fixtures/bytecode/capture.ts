// One-time capture of the deployed runtime bytecode of the XO account stack (chain 3223), from the
// public block explorer's smart-contracts endpoint. Run it by hand, never from a test:
//
//   pnpm exec tsx test/fixtures/bytecode/capture.ts            (prints the plan, makes no request)
//   pnpm exec tsx test/fixtures/bytecode/capture.ts --run      (makes the requests)
//   ... --run --only=kernel-factory,ecdsa-validator            (only the named contracts)
//
// The explorer fills a contract's code lazily: a first request can answer 404 for an address it has
// not looked at yet and a later one 200 (docs/research/19 V2.1), so a 404 here means "ask again in a
// few minutes", and every ask counts against the request budget.
//
// Rules this script enforces (the task budget for the capture was 25 requests in total):
//   - GET only, one request per contract, one host (the explorer), unauthenticated, no redirects
//   - at least 300 ms between requests, a hard cap of 25 requests per run, no retries
//   - the fixed User-Agent below and no other identifying header
//   - 401, 403 or 429 stops the run (a key requirement is a stop, never something to work around)
//   - nothing is written unless the response is sane: 0x-hex, even length, the size the notes give
//
// Output per contract: <name>.hex (the runtime code, lower-case, one line) and <name>.json with
// {address, sha256, source_url, captured_at, size} plus name, keccak256 and chain_id. sha256 is over
// the code bytes, not over the hex text. The harness (test/anvil/bytecode.ts) re-checks size, sha256
// and keccak256 on every load, so a hand edit of a .hex file fails loudly.

import { createHash } from "node:crypto";
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { getContractAddress, getAddress, hexToBytes, keccak256, type Hex } from "viem";

import {
  ECDSA_VALIDATOR,
  ENTRY_POINT_V07,
  KERNEL_FACTORY,
  KERNEL_IMPLEMENTATION,
  POLICY_PAYMASTER,
  XO_CHAIN_ID,
} from "../../../src/xo/chain/constants.js";

const EXPLORER = "https://explorer-mainnet.xo.market";
const USER_AGENT = "insurance-markets-research/0.1";
const CAPTURED_AT = "2026-10-19";
const MAX_REQUESTS = 25;
const GAP_MS = 300;
const MAX_BODY_BYTES = 4 * 1024 * 1024;

interface Target {
  readonly name: string;
  readonly address: string;
  // Sizes stated in docs/phase1-gap-closing.md section 2.1 and docs/research/21 V1.4. The SenderCreator
  // size is not stated anywhere, so it is only recorded.
  readonly expectedSize?: number;
}

// The EntryPoint's SenderCreator is the EntryPoint's first CREATE (a contract's nonce starts at 1), so
// its address follows from the CREATE rule alone (spec 5.5); the capture confirms there is code there.
const SENDER_CREATOR = getContractAddress({ from: ENTRY_POINT_V07, nonce: 1n });

export const TARGETS: readonly Target[] = [
  { name: "entrypoint-v07", address: ENTRY_POINT_V07, expectedSize: 16_035 },
  { name: "sender-creator", address: SENDER_CREATOR },
  { name: "kernel-factory", address: KERNEL_FACTORY, expectedSize: 989 },
  { name: "ecdsa-validator", address: ECDSA_VALIDATOR, expectedSize: 1_819 },
  { name: "kernel-implementation", address: KERNEL_IMPLEMENTATION, expectedSize: 22_784 },
  { name: "policy-paymaster", address: POLICY_PAYMASTER, expectedSize: 7_309 },
];

const here = dirname(fileURLToPath(import.meta.url));
let requests = 0;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function getJson(url: string): Promise<{ status: number; body: unknown }> {
  if (requests >= MAX_REQUESTS) throw new Error(`request cap of ${String(MAX_REQUESTS)} reached`);
  requests += 1;
  const response = await fetch(url, {
    method: "GET",
    redirect: "error",
    headers: { "user-agent": USER_AGENT, accept: "application/json" },
    signal: AbortSignal.timeout(40_000),
  });
  const text = await response.text();
  if (text.length > MAX_BODY_BYTES) throw new Error("response too large");
  if (response.status === 401 || response.status === 403 || response.status === 429) {
    throw new Error(`HTTP ${String(response.status)} from the explorer: stop, do not look for a key or retry`);
  }
  let body: unknown = null;
  try {
    body = JSON.parse(text);
  } catch {
    body = null;
  }
  return { status: response.status, body };
}

async function main(): Promise<void> {
  const run = process.argv.includes("--run");
  const only = process.argv.find((arg) => arg.startsWith("--only="))?.slice("--only=".length).split(",");
  const targets = only === undefined ? TARGETS : TARGETS.filter((target) => only.includes(target.name));
  if (only !== undefined && targets.length !== only.length) throw new Error("--only names an unknown contract");
  for (const target of targets) {
    const address = getAddress(target.address);
    const url = `${EXPLORER}/api/v2/smart-contracts/${address}`;
    console.log(`${run ? "GET" : "plan"} ${url}`);
  }
  if (!run) {
    console.log(`${String(targets.length)} requests planned, cap ${String(MAX_REQUESTS)}. Pass --run to make them.`);
    return;
  }
  for (const target of targets) {
    const address = getAddress(target.address);
    const url = `${EXPLORER}/api/v2/smart-contracts/${address}`;
    const { status, body } = await getJson(url);
    const field = typeof body === "object" && body !== null ? (body as Record<string, unknown>)["deployed_bytecode"] : undefined;
    if (status !== 200 || typeof field !== "string") {
      console.log(`${target.name}: HTTP ${String(status)}, no deployed_bytecode field; nothing written`);
      await sleep(GAP_MS);
      continue;
    }
    if (!/^0x(?:[0-9a-fA-F]{2})+$/.test(field)) {
      console.log(`${target.name}: deployed_bytecode is not even-length 0x hex; nothing written`);
      await sleep(GAP_MS);
      continue;
    }
    const code = field.toLowerCase() as Hex;
    const bytes = hexToBytes(code);
    if (target.expectedSize !== undefined && bytes.length !== target.expectedSize) {
      console.log(`${target.name}: size ${String(bytes.length)} differs from the expected ${String(target.expectedSize)}; nothing written`);
      await sleep(GAP_MS);
      continue;
    }
    const sidecar = {
      name: target.name,
      address,
      chain_id: XO_CHAIN_ID,
      size: bytes.length,
      sha256: createHash("sha256").update(bytes).digest("hex"),
      keccak256: keccak256(code),
      source_url: url,
      source_field: "deployed_bytecode",
      captured_at: CAPTURED_AT,
    };
    writeFileSync(join(here, `${target.name}.hex`), `${code}\n`);
    writeFileSync(join(here, `${target.name}.json`), `${JSON.stringify(sidecar, null, 2)}\n`);
    console.log(`${target.name}: HTTP 200, ${String(bytes.length)} bytes written`);
    await sleep(GAP_MS);
  }
  console.log(`${String(requests)} requests made`);
}

// Only when run directly, so importing TARGETS from a test never makes a request.
if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
