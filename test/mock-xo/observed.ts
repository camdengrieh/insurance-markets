// Facts observed on the real service that production code deliberately does not pin. They live here, in
// test code, so the mock can reproduce them without an address literal or a version string in src/ or relay/.

import { getAddress } from "viem";

// What the bundler's eth_supportedEntryPoints advertised, v0.6 first (docs/research/21 sec 6, V3.13). Nothing
// the project uses is on v0.6; spec 2.2 says "do not use" it.
export const ENTRY_POINT_V06_ADVERTISED = getAddress("0x5ff137d4b0fdcd49dca30c7cf57e578a026d2789");

// web3_clientVersion on rpc-mainnet-2.xo.market (docs/research/21 sec 6).
export const XO_RPC_CLIENT_VERSION = "reth/v2.0.0-eb4c15e/x86_64-unknown-linux-gnu";
export const BASE_RPC_CLIENT_VERSION = "mock-base-rpc/0.1";

// The XO node refuses eth_getLogs over more than this many blocks (docs/research/20 sec 1, p23).
export const XO_RPC_MAX_LOG_RANGE_BLOCKS = 100_000;

// Methods the XO RPC node answers without a key (docs/research/21 sec 6): the first seven are the spec's list
// (5.5), the rest are reads the real node was seen to answer or that any node answers.
export const RPC_READ_METHODS = Object.freeze([
  "eth_chainId",
  "eth_blockNumber",
  "eth_call",
  "eth_getCode",
  "eth_getStorageAt",
  "eth_getLogs",
  "eth_getTransactionReceipt",
  "eth_getBalance",
  "eth_getTransactionByHash",
  "eth_getBlockByNumber",
  "web3_clientVersion",
] as const);

export type RpcReadMethod = (typeof RPC_READ_METHODS)[number];

// Hostnames of the real services the mock stands in for. The orderbook, Data API and explorer names are the
// ones src/xo/http.ts pins; the RPC, bundler and Base names are configuration there (XO_RPC_URL and so on).
export const XO_RPC_HOST = "rpc-mainnet-2.xo.market";
export const XO_BUNDLER_HOST = "mainnet-bundler.xo.market";
export const BASE_RPC_HOST = "mainnet.base.org";
