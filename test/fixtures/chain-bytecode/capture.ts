// One-time capture of the deployed runtime code of every contract the SDK's chain readers name
// (sdk/chain/polymarket, sdk/chain/limitless, sdk/chain/xo/pins.ts and sdk/chain/multicall.ts). Run it by hand,
// never from a test:
//
//   pnpm exec tsx test/fixtures/chain-bytecode/capture.ts            (prints the plan, makes no request)
//   pnpm exec tsx test/fixtures/chain-bytecode/capture.ts --run      (makes the requests)
//   ... --run --only name,name                                         (captures only the named targets)
//
// For each contract it reads eth_getCode from the chain's public RPC (the hosts sdk/venues/origins.ts lists:
// rpc_polygon, rpc_base, xo_rpc) and, where Sourcify has the contract, Sourcify's recorded on-chain runtime code and
// match status, and writes <chain>/<name>.hex (the runtime code, lower-case, one line) and <chain>/<name>.json (the
// address, where the address came from, sizes, sha256 and keccak256 over the code bytes, the Sourcify status and
// whether its code equals the RPC's). An EIP-1967 proxy also records the implementation its slot names, and the
// implementation is captured as its own entry. test/chain-pins.test.ts re-hashes every .hex file and compares it with
// the pins in the SDK, so a hand edit of either fails loudly.
//
// Rules: read-only JSON-RPC (eth_getCode, eth_getStorageAt) and GETs to Sourcify, the fixed User-Agent below and no
// other identifying header, at least 300 ms between requests, a hard cap of 120 requests, no retries. A 401, 403 or
// 429 stops the run (a key requirement is a stop, never something to work around).

import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { getAddress, hexToBytes, keccak256, type Hex } from "viem";

const USER_AGENT = "insurance-markets-research/0.1";
const CAPTURED_AT = "2026-10-22";
const MAX_REQUESTS = 120;
const GAP_MS = 300;
const EIP1967_IMPLEMENTATION_SLOT = "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc";

const RPC: Readonly<Record<number, string>> = {
  137: "https://polygon-bor-rpc.publicnode.com/",
  8453: "https://base-rpc.publicnode.com/",
  3223: "https://rpc-mainnet-2.xo.market/",
};
const FOLDER: Readonly<Record<number, string>> = { 137: "polygon", 8453: "base", 3223: "xo" };

const PM_CONTRACTS = "https://docs.polymarket.com/resources/contracts.md (read 2026-10-22)";
const LL_CONTRACTS = "https://docs.limitless.exchange/user-guide/smart-contracts.md (read 2026-10-22)";
const XO_CONTRACTS = "XO Market Docs /documentation/introduction, Contracts table (read 2026-10-22 through the xo-docs MCP)";
const MULTICALL3 = "https://github.com/mds1/multicall3 README, Multicall3 Contract Addresses (the canonical deployment)";

export interface Target {
  readonly name: string;
  readonly chainId: 137 | 8453 | 3223;
  readonly address: string;
  // Where the address was taken from.
  readonly addressSource: string;
  // Look the contract up on Sourcify (false where it is known not to be there and nothing would be learned).
  readonly sourcify: boolean;
  // An EIP-1967 proxy: the name of the target that is its implementation.
  readonly implementation?: string;
}

export const TARGETS: readonly Target[] = [
  // ---- Polymarket, Polygon 137 ----
  { name: "polymarket-conditional-tokens", chainId: 137, address: "0x4D97DCd97eC945f40cF65F87097ACe5EA0476045", addressSource: PM_CONTRACTS, sourcify: true },
  { name: "polymarket-ctf-exchange", chainId: 137, address: "0xE111180000d2663C0091e4f400237545B87B996B", addressSource: PM_CONTRACTS, sourcify: true },
  { name: "polymarket-neg-risk-ctf-exchange", chainId: 137, address: "0xe2222d279d744050d28e00520010520000310F59", addressSource: PM_CONTRACTS, sourcify: true },
  { name: "polymarket-neg-risk-adapter", chainId: 137, address: "0xd91E80cF2E7be2e162c6513ceD06f1dD0dA35296", addressSource: PM_CONTRACTS, sourcify: true },
  { name: "polymarket-uma-ctf-adapter-v3-1", chainId: 137, address: "0x157Ce2d672854c848c9b79C49a8Cc6cc89176a49", addressSource: PM_CONTRACTS, sourcify: true },
  { name: "polymarket-uma-ctf-adapter-v2", chainId: 137, address: "0x6A9D222616C90FcA5754cd1333cFD9b7fb6a4F74", addressSource: PM_CONTRACTS, sourcify: true },
  { name: "polymarket-exchange-v3", chainId: 137, address: "0xe3333700cA9d93003F00f0F71f8515005F6c00Aa", addressSource: PM_CONTRACTS, sourcify: true, implementation: "polymarket-exchange-v3-implementation" },
  { name: "polymarket-exchange-v3-implementation", chainId: 137, address: "0x641b40ec414a076b9e79E703Fc7BF4EBEC248Bb7", addressSource: PM_CONTRACTS, sourcify: true },
  { name: "polymarket-position-manager", chainId: 137, address: "0x006F54F7f9A22e0000CC2AB60031000000ae9fEF", addressSource: PM_CONTRACTS, sourcify: true, implementation: "polymarket-position-manager-implementation" },
  { name: "polymarket-position-manager-implementation", chainId: 137, address: "0xCc5De1e9D14a7AB75E872E23FC9D605518Bac2D0", addressSource: PM_CONTRACTS, sourcify: true },
  { name: "polymarket-binary-module", chainId: 137, address: "0x1000008dD9001B968442c1000017eaE6E0dA00Ba", addressSource: PM_CONTRACTS, sourcify: true, implementation: "polymarket-binary-module-implementation" },
  { name: "polymarket-binary-module-implementation", chainId: 137, address: "0xf6428c0B5fa9361c0708CDdb95468cf54C56e9A2", addressSource: PM_CONTRACTS, sourcify: true },
  { name: "polymarket-neg-risk-module", chainId: 137, address: "0x200000900045e3B6259600682756002200028933", addressSource: PM_CONTRACTS, sourcify: true, implementation: "polymarket-neg-risk-module-implementation" },
  { name: "polymarket-neg-risk-module-implementation", chainId: 137, address: "0x39a5B01a100edF811f2748aa37B1313715Ded70e", addressSource: PM_CONTRACTS, sourcify: true },
  { name: "polymarket-ctf-collateral-adapter", chainId: 137, address: "0xAdA100Db00Ca00073811820692005400218FcE1f", addressSource: PM_CONTRACTS, sourcify: true },
  {
    name: "polymarket-usdc-e",
    chainId: 137,
    address: "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174",
    addressSource: "USDCE() of the pinned, Sourcify exact-match CtfCollateralAdapter and col() of the pinned NegRiskAdapter, both read 2026-10-22",
    sourcify: true,
  },
  {
    name: "polymarket-wrapped-collateral",
    chainId: 137,
    address: "0x3A3BD7bb9528E159577F7C2e685CC81A765002E2",
    addressSource: "wcol() of the pinned, Sourcify exact-match NegRiskAdapter, read 2026-10-22",
    sourcify: true,
  },
  // Polymarket's wallet factories (the contract list's "Wallet Factory Contracts") and what each clones: the proxy
  // wallet implementation (getImplementation() of the Proxy Factory) and the Safe singleton (masterCopy() of the Safe
  // Factory), both read 2026-10-22. sdk/chain/polymarket/wallets.ts derives an owner's wallets from them.
  { name: "polymarket-proxy-wallet-factory", chainId: 137, address: "0xaB45c5A4B0c941a2F231C04C3f49182e1A254052", addressSource: PM_CONTRACTS, sourcify: true },
  {
    name: "polymarket-proxy-wallet-implementation",
    chainId: 137,
    address: "0x44e999d5c2F66Ef0861317f9A4805AC2e90aEB4f",
    addressSource: "getImplementation() of the pinned, Sourcify-verified Polymarket Proxy Factory, read 2026-10-22",
    sourcify: true,
  },
  { name: "polymarket-safe-proxy-factory", chainId: 137, address: "0xaacFeEa03eb1561C4e67d661e40682Bd20E3541b", addressSource: PM_CONTRACTS, sourcify: true },
  {
    name: "polymarket-safe-singleton",
    chainId: 137,
    address: "0xE51abdf814f8854941b9Fe8e3A4F65CAB4e7A4a8",
    addressSource: "masterCopy() of the pinned, Sourcify exact-match Polymarket Safe Factory, read 2026-10-22",
    sourcify: true,
  },
  { name: "multicall3-polygon", chainId: 137, address: "0xcA11bde05977b3631167028862bE2a173976CA11", addressSource: MULTICALL3, sourcify: true },
  // ---- Limitless, Base 8453 ----
  { name: "limitless-conditional-tokens", chainId: 8453, address: "0xC9c98965297Bc527861c898329Ee280632B76e18", addressSource: LL_CONTRACTS, sourcify: true },
  { name: "limitless-ctf-exchange-v1", chainId: 8453, address: "0xa4409D988CA2218d956BeEFD3874100F444f0DC3", addressSource: LL_CONTRACTS, sourcify: true },
  { name: "limitless-ctf-exchange-v2", chainId: 8453, address: "0xF1De958F8641448A5ba78c01f434085385Af096D", addressSource: LL_CONTRACTS, sourcify: true },
  { name: "limitless-ctf-exchange-v3", chainId: 8453, address: "0x05c748E2f4DcDe0ec9Fa8DDc40DE6b867f923fa5", addressSource: LL_CONTRACTS, sourcify: true },
  { name: "limitless-neg-risk-ctf-exchange-v1", chainId: 8453, address: "0x5a38afc17F7E97ad8d6C547ddb837E40B4aEDfC6", addressSource: LL_CONTRACTS, sourcify: true },
  { name: "limitless-neg-risk-ctf-exchange-v2", chainId: 8453, address: "0x46e607D3f4a8494B0aB9b304d1463e2F4848891d", addressSource: LL_CONTRACTS, sourcify: true },
  { name: "limitless-neg-risk-ctf-exchange-v3", chainId: 8453, address: "0xe3E00BA3a9888d1DE4834269f62ac008b4BB5C47", addressSource: LL_CONTRACTS, sourcify: true },
  { name: "limitless-neg-risk-adapter-v1", chainId: 8453, address: "0xb8DAA4C8C9f690396f671BB601727A4c3741340C", addressSource: LL_CONTRACTS, sourcify: true },
  { name: "limitless-neg-risk-adapter-v2", chainId: 8453, address: "0x7afeB946986211950d17f24176039F12c2aB2436", addressSource: LL_CONTRACTS, sourcify: true },
  { name: "limitless-neg-risk-adapter-v3", chainId: 8453, address: "0x6151EF8368b6316c1aa3C68453EF083ad31E712D", addressSource: LL_CONTRACTS, sourcify: true },
  { name: "limitless-wrapped-collateral-v1", chainId: 8453, address: "0x5d6C6a4fEA600E0b1A3Ab3eF711060310E27886A", addressSource: LL_CONTRACTS, sourcify: true },
  { name: "limitless-wrapped-collateral-v2", chainId: 8453, address: "0x428F0FC93221A9957dC667baa07E62d50c6b8c03", addressSource: LL_CONTRACTS, sourcify: true },
  { name: "limitless-wrapped-collateral-v3", chainId: 8453, address: "0xBd8Ff5Ac78A3739037FEaA18278cC157C4798B01", addressSource: LL_CONTRACTS, sourcify: true },
  { name: "base-usdc", chainId: 8453, address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", addressSource: LL_CONTRACTS, sourcify: true },
  { name: "multicall3-base", chainId: 8453, address: "0xcA11bde05977b3631167028862bE2a173976CA11", addressSource: MULTICALL3, sourcify: true },
  // ---- XO, chain 3223 (not on Sourcify; the exchange implementation's verified source is on XO's explorer) ----
  { name: "xo-conditional-tokens", chainId: 3223, address: "0xCcf1b2C676E2f9A13e5674be0e0DdFF6d0B13909", addressSource: XO_CONTRACTS, sourcify: false },
  { name: "xo-ctf-exchange", chainId: 3223, address: "0x4bC5E872256D12E6017dfe466E04c867DC761B77", addressSource: XO_CONTRACTS, sourcify: false, implementation: "xo-ctf-exchange-implementation" },
  {
    name: "xo-ctf-exchange-implementation",
    chainId: 3223,
    address: "0x24BB67503d92f3b2A36cf97c45E51FF2C0c452ED",
    addressSource: "the EIP-1967 slot of the XO CTF Exchange proxy; verified CTFExchange source on explorer-mainnet.xo.market (docs/research/22 section 1)",
    sourcify: false,
  },
  { name: "xo-usdc-e", chainId: 3223, address: "0x80c12230ce677e6f304027a14780Edd2A829ab0c", addressSource: XO_CONTRACTS, sourcify: false },
];

const here = dirname(fileURLToPath(import.meta.url));
let requests = 0;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function send(url: string, init: { method: "GET" | "POST"; body?: string }): Promise<unknown> {
  if (requests >= MAX_REQUESTS) throw new Error(`request cap of ${String(MAX_REQUESTS)} reached`);
  requests += 1;
  const response = await fetch(url, {
    method: init.method,
    redirect: "error",
    headers: { "user-agent": USER_AGENT, accept: "application/json", ...(init.body === undefined ? {} : { "content-type": "application/json" }) },
    ...(init.body === undefined ? {} : { body: init.body }),
    signal: AbortSignal.timeout(40_000),
  });
  if (response.status === 401 || response.status === 403 || response.status === 429) throw new Error(`HTTP ${String(response.status)} from ${new URL(url).host}: stop`);
  const text = await response.text();
  await sleep(GAP_MS);
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

async function rpc(chainId: number, method: string, params: unknown[]): Promise<string> {
  const body = (await send(RPC[chainId] as string, { method: "POST", body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) })) as { result?: unknown } | null;
  const result = body?.result;
  if (typeof result !== "string" || !/^0x(?:[0-9a-fA-F]{2})*$/.test(result)) throw new Error(`${method} on ${String(chainId)} did not return hex`);
  return result.toLowerCase();
}

interface SourcifyView {
  readonly match: string | null;
  readonly name: string | null;
  readonly onchain: string | null;
  readonly url: string;
}

async function sourcify(chainId: number, address: string): Promise<SourcifyView> {
  const url = `https://sourcify.dev/server/v2/contract/${String(chainId)}/${address}?fields=runtimeBytecode,compilation`;
  const body = (await send(url, { method: "GET" })) as Record<string, unknown> | null;
  const runtime = body?.["runtimeBytecode"] as { onchainBytecode?: unknown } | undefined;
  const compilation = body?.["compilation"] as { name?: unknown } | undefined;
  return {
    match: typeof body?.["match"] === "string" ? (body["match"] as string) : null,
    name: typeof compilation?.name === "string" ? compilation.name : null,
    onchain: typeof runtime?.onchainBytecode === "string" ? runtime.onchainBytecode.toLowerCase() : null,
    url,
  };
}

async function main(): Promise<void> {
  const run = process.argv.includes("--run");
  const onlyAt = process.argv.indexOf("--only");
  const only = onlyAt === -1 ? null : new Set((process.argv[onlyAt + 1] ?? "").split(","));
  if (only !== null && [...only].some((name) => !TARGETS.some((target) => target.name === name))) throw new Error("--only names a target that does not exist");
  const chosen = only === null ? TARGETS : TARGETS.filter((target) => only.has(target.name));
  for (const target of TARGETS) {
    if (getAddress(target.address) !== target.address) throw new Error(`${target.name}: not the checksummed form`);
  }
  if (!run) {
    const planned = chosen.length + chosen.filter((t) => t.sourcify).length + chosen.filter((t) => t.implementation !== undefined).length;
    console.log(`${String(planned)} requests planned for ${String(chosen.length)} contracts, cap ${String(MAX_REQUESTS)}. Pass --run to make them.`);
    return;
  }
  for (const target of chosen) {
    const code = (await rpc(target.chainId, "eth_getCode", [target.address, "latest"])) as Hex;
    if (code === "0x") throw new Error(`${target.name}: no code at ${target.address}`);
    const bytes = hexToBytes(code);
    let implementation: string | null = null;
    if (target.implementation !== undefined) {
      const word = await rpc(target.chainId, "eth_getStorageAt", [target.address, EIP1967_IMPLEMENTATION_SLOT, "latest"]);
      implementation = getAddress(`0x${word.slice(-40)}`);
      const expected = TARGETS.find((entry) => entry.name === target.implementation);
      if (expected === undefined || expected.address !== implementation) throw new Error(`${target.name}: the slot names ${implementation}, not ${expected?.address ?? "?"}`);
    }
    const view = target.sourcify ? await sourcify(target.chainId, target.address) : null;
    const sidecar = {
      name: target.name,
      address: target.address,
      chain_id: target.chainId,
      address_source: target.addressSource,
      size: bytes.length,
      sha256: createHash("sha256").update(bytes).digest("hex"),
      keccak256: keccak256(code),
      code_source: `eth_getCode over ${RPC[target.chainId] as string} (sdk/venues/origins.ts)`,
      eip1967_implementation: implementation,
      sourcify_url: view?.url ?? null,
      sourcify_match: view?.match ?? null,
      sourcify_contract: view?.name ?? null,
      sourcify_onchain_equals_rpc: view?.onchain === null || view === null ? null : view.onchain === code,
      captured_at: CAPTURED_AT,
    };
    const folder = join(here, FOLDER[target.chainId] as string);
    mkdirSync(folder, { recursive: true });
    writeFileSync(join(folder, `${target.name}.hex`), `${code}\n`);
    writeFileSync(join(folder, `${target.name}.json`), `${JSON.stringify(sidecar, null, 2)}\n`);
    console.log(`${target.name}: ${String(bytes.length)} bytes, sourcify ${String(sidecar.sourcify_match)} ${String(sidecar.sourcify_contract)}, equal ${String(sidecar.sourcify_onchain_equals_rpc)}${implementation === null ? "" : `, implementation ${implementation}`}`);
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
