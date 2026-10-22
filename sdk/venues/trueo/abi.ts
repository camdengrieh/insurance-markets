import { parseAbi } from "viem";

// The read-only slice of each contract the adapter calls (docs/research/11-trueo.md section 11.2, taken from
// Sourcify-verified ABIs). Reads only: no function here changes state, and the adapter has no ABI for any
// write, so there is nothing to encode a transaction with. constants.test.ts pins each selector to the value
// the research recorded with `cast sig`.

const POOL_KEY = "struct PoolKey { address currency0; address currency1; uint24 fee; int24 tickSpacing; address hooks; }";

export const MANAGER_ABI = parseAbi([
  "function numberOfActiveMarkets() view returns (uint256)",
  "function getActiveMarketAddress(uint256 index) view returns (address)",
  "function isActiveMarket(address market) view returns (bool)",
  "function paused() view returns (bool)",
]);

export const MARKET_ABI = parseAbi([
  POOL_KEY,
  "function VERSION() view returns (string)",
  "function marketQuestion() view returns (string)",
  "function marketSource() view returns (string)",
  "function additionalInfo() view returns (string)",
  "function endOfTrading() view returns (uint256)",
  // Derived from time. The stored `currentStatus` slot and any indexer lag behind it.
  "function getCurrentStatus() view returns (uint8)",
  "function winningPosition() view returns (uint256)",
  "function paymentToken() view returns (address)",
  "function yesToken() view returns (address)",
  "function noToken() view returns (address)",
  "function getPoolKeys() view returns (PoolKey yes, PoolKey no)",
  "function getPoolIds() view returns (bytes32 yesId, bytes32 noId)",
  "function paused() view returns (bool)",
  "function getUserPosition(address user) view returns (uint256 yes, uint256 no)",
  "function getUserClaimableAmount(address user) view returns (uint256)",
]);

export const HOOK_ABI = parseAbi([
  "function feeNumerator() view returns (uint256)",
  "function FEE_DENOMINATOR() view returns (uint256)",
  "function poolPaused(bytes32 poolId) view returns (bool)",
]);

export const STATE_VIEW_ABI = parseAbi([
  "function getSlot0(bytes32 poolId) view returns (uint160 sqrtPriceX96, int24 tick, uint24 protocolFee, uint24 lpFee)",
  "function getLiquidity(bytes32 poolId) view returns (uint128)",
]);

// V4Quoter. The functions are not `view` in the ABI (they revert internally to return values) but are called
// with eth_call, which changes nothing.
export const QUOTER_ABI = parseAbi([
  POOL_KEY,
  "struct QuoteExactSingleParams { PoolKey poolKey; bool zeroForOne; uint128 exactAmount; bytes hookData; }",
  "function quoteExactInputSingle(QuoteExactSingleParams params) returns (uint256 amountOut, uint256 gasEstimate)",
  "function quoteExactOutputSingle(QuoteExactSingleParams params) returns (uint256 amountIn, uint256 gasEstimate)",
]);

export const ERC20_ABI = parseAbi([
  "function balanceOf(address account) view returns (uint256)",
  "function decimals() view returns (uint8)",
]);

// TYD is an ERC-4626 vault share over USDC: one TYD is worth `convertToAssets(1e6)` USDC.
export const VAULT_ABI = parseAbi([
  "function asset() view returns (address)",
  "function convertToAssets(uint256 shares) view returns (uint256)",
  "function decimals() view returns (uint8)",
]);

// ERC-20 Transfer, for the opt-in history scan (logs.ts).
export const TRANSFER_EVENT = parseAbi(["event Transfer(address indexed from, address indexed to, uint256 value)"]);
