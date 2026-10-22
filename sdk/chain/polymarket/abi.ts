import { parseAbi, toEventSelector } from "viem";

// ABI fragments for exactly the Polymarket reads and events the chain readers use. Each signature was copied from the
// verified ABI Sourcify serves for the contract (chain 137, read 2026-10-22); sdk/chain/abi.test.ts recomputes every
// selector and topic and compares them with the verified ABIs in sdk/chain/fixtures/verified-abi-excerpts_2026-10-22.json.
//
//   CTF Exchange 0xE111...996B and Neg Risk CTF Exchange 0xe222...0F59 (both `CTFExchange`, Sourcify match) and the
//   Protocol V2 Exchange implementation 0x641b...8Bb7 (`Exchange`, Sourcify match) emit the same OrderFilled: the
//   signed order's `tokenId` and `side` (0 BUY, 1 SELL) instead of maker and taker asset ids.
//   PositionManager implementation 0xCc5D...c2D0: the standard ERC-1155 balance reads and transfer events.
//   BinaryModule 0xf642...e9A2 and NegRiskModule 0x39a5...d70e: getResult(bytes31) is [] until resolved, then two
//   values in parts per million that sum to RESULT_DENOMINATOR (1,000,000); NegRiskModule's derives sibling results.

export const POLYMARKET_EXCHANGE_ABI = parseAbi([
  "event OrderFilled(bytes32 indexed orderHash, address indexed maker, address indexed taker, uint8 side, uint256 tokenId, uint256 makerAmountFilled, uint256 takerAmountFilled, uint256 fee, bytes32 builder, bytes32 metadata)",
]);

export const POLYMARKET_ORDER_FILLED_TOPIC = toEventSelector("OrderFilled(bytes32,address,address,uint8,uint256,uint256,uint256,uint256,bytes32,bytes32)");

export const POLYMARKET_MODULE_ABI = parseAbi([
  "function getResult(bytes31 conditionId) view returns (uint256[])",
  "event ConditionResolved(bytes31 indexed conditionId, uint256[] result)",
]);

export const POLYMARKET_RESULT_DENOMINATOR = 1_000_000n;
