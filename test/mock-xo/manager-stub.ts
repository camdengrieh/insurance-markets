// A STUB of the XO market manager (XOClobMarketManager proxy), built with the mini assembler in
// test/anvil/asm.ts. It stands in for a contract whose bytecode this harness does not carry, and it says so:
//
//   What it does like the real contract (docs/research/23 sec 1 and V3.5):
//     createConvictionMarket(uint40,uint40,address,string)   selector 0x7f54a7a2
//        reverts unless expiresAt > block.timestamp, startsAt <= expiresAt and the collateral is USDC.e;
//        charges the creation fee with USDC.e.transferFrom(creator, treasury, 1,000,000) (so a batch without
//        the approve reverts as a whole, and the fee really leaves the account); stores owner and status
//        PENDING; emits MarketCreationFeeCharged and CLOBMarketCreated with the real data layout (the ten
//        head words, then the metadata URI as an ABI string); returns the condition id
//     respondToUpdateRequest(bytes32,bool)                    selector 0x1de5facd
//        only the market owner, only from UPDATE_REQUIRED, an accept only before suggestionExpiresAt;
//        emits UpdateRequestResponded(conditionId; owner, accepted, uri)
//     cancelMarket(bytes32)                                   selector 0xbdb83289
//        only the owner, only from PENDING; emits MarketCancelledByOwner
//
//   What it does NOT do like the real contract (M, labelled):
//     - the URI in UpdateRequestResponded is the empty string (the real one carries the accepted URI);
//       the mock's creation module applies the accepted suggestion to its own catalogue
//     - no oracle logic lives here. The mock oracle acts through two functions that only the XO oracle
//       address may call (anvil impersonates it): stubSetState(conditionId, statusPlusOne, suggestionExpiresAt)
//       and stubEmit2(topic0, topic1, data), which emits a log whose bytes viem encoded with the real
//       event ABI (MarketReviewed, MetadataUpdated), so those layouts are real as well
//     - no AccessManager, no pause, no UUPS, no NFT, no creator fee
//
// Storage: slot 0 owner[conditionId], slot 1 statusPlusOne[conditionId] (0 = unknown market; otherwise
// MarketStatus + 1), slot 2 suggestionExpiresAt[conditionId], slot 3 market counter.

import { parseAbi, toEventSelector, toFunctionSelector, type Hex } from "viem";

import {
  ACCESS_MANAGER,
  CONFIG_MANAGER,
  CREATION_FEE_ATOMIC,
  MARKET_TYPE_CLOB_CONVICTION,
  USDC_E_ADDRESS,
  XO_ORACLE,
} from "../../src/xo/chain/constants.js";
import { Assembler } from "../anvil/asm.js";

export const MANAGER_STUB_NOTICE =
  "MARKET MANAGER TEST STUB. Real event layouts and fee transfer; no oracle logic, no AccessManager, no NFT, empty URI in UpdateRequestResponded.";

// MarketStatus enum of the real manager (docs/research/23 sec 1): PENDING, CANCELLED, ACTIVE, PAUSED, RESOLVED,
// CLOSED, UPDATE_REQUIRED, VOIDED, VOIDED_CLOSED. The stub stores status + 1.
export const MANAGER_STATUS = Object.freeze({
  PENDING: 0,
  CANCELLED: 1,
  ACTIVE: 2,
  PAUSED: 3,
  RESOLVED: 4,
  CLOSED: 5,
  UPDATE_REQUIRED: 6,
  VOIDED: 7,
  VOIDED_CLOSED: 8,
} as const);
export type ManagerStatusName = keyof typeof MANAGER_STATUS;

export const MANAGER_STUB_SIGNATURES = Object.freeze({
  create: "createConvictionMarket(uint40,uint40,address,string)",
  respond: "respondToUpdateRequest(bytes32,bool)",
  cancel: "cancelMarket(bytes32)",
  authority: "authority()",
  configManager: "CONFIG_MANAGER()",
  statusPlusOne: "stubStatusPlusOne(bytes32)",
  ownerOf: "stubOwnerOf(bytes32)",
  suggestionExpiresAt: "stubSuggestionExpiresAt(bytes32)",
  setState: "stubSetState(bytes32,uint256,uint256)",
  emit2: "stubEmit2(bytes32,bytes32,bytes)",
} as const);

// What the mock itself calls on the stub (the oracle hooks and the views). The user-callable functions are in
// MARKET_MANAGER_ABI (src/xo/chain/abi.ts).
export const MANAGER_STUB_ABI = parseAbi([
  "function stubStatusPlusOne(bytes32 conditionId) view returns (uint256)",
  "function stubOwnerOf(bytes32 conditionId) view returns (address)",
  "function stubSuggestionExpiresAt(bytes32 conditionId) view returns (uint256)",
  "function stubSetState(bytes32 conditionId, uint256 statusPlusOne, uint256 suggestionExpiresAt)",
  "function stubEmit2(bytes32 topic0, bytes32 topic1, bytes data)",
]);

// A fixed address that receives the creation fee (the real treasury is not pinned anywhere). Derived, not typed,
// so no address literal lives outside src/xo/chain/constants.ts.
export const MANAGER_STUB_TREASURY: Hex = `0x${"00".repeat(18)}fee1` as Hex;

const TOPIC_CLOB_CREATED = toEventSelector(
  "event CLOBMarketCreated(bytes32 indexed conditionId, address indexed creator, bytes32 questionId, uint256 outcome1TokenId, uint256 outcome2TokenId, address collateralToken, address resolver, uint40 startsAt, uint40 expiresAt, uint16 creatorFeeBps, string metadataURI, uint8 marketType)",
);
const TOPIC_FEE_CHARGED = toEventSelector(
  "event MarketCreationFeeCharged(bytes32 indexed conditionId, address indexed creator, address collateralToken, uint256 fee)",
);
const TOPIC_RESPONDED = toEventSelector("event UpdateRequestResponded(bytes32 indexed conditionId, address owner, bool accepted, string metaDataURI)");
const TOPIC_CANCELLED = toEventSelector("event MarketCancelledByOwner(bytes32 indexed conditionId, address owner)");

const selector = (signature: string): Hex => toFunctionSelector(signature);
const ADDRESS_MASK: Hex = `0x${"ff".repeat(20)}`;

// Revert selectors, so a failure is readable in a UserOperationRevertReason.
export const MANAGER_STUB_ERRORS = Object.freeze({
  invalidParameter: toFunctionSelector("InvalidParameter()"),
  notMarketOwner: toFunctionSelector("NotMarketOwner()"),
  wrongStatus: toFunctionSelector("WrongStatus()"),
  windowClosed: toFunctionSelector("SuggestionWindowClosed()"),
  feeTransferFailed: toFunctionSelector("FeeTransferFailed()"),
  notOracle: toFunctionSelector("NotOracle()"),
} as const);

// [value] -> []  (mem[offset] = value)
function mstore(a: Assembler, offset: number): void {
  a.push(offset).op("MSTORE");
}
function mload(a: Assembler, offset: number): void {
  a.push(offset).op("MLOAD");
}
// calldata word i, counted from after the selector
function arg(a: Assembler, index: number): void {
  a.push(4 + 32 * index).op("CALLDATALOAD");
}
// [key] -> [keccak256(key . base)]
function mapSlot(a: Assembler, base: number): void {
  a.push(0).op("MSTORE").push(base).push(32).op("MSTORE").push(64).push(0).op("SHA3");
}
function timestamp(a: Assembler): void {
  a.data("0x42"); // TIMESTAMP, not in the assembler's opcode table
}
function mask(a: Assembler): void {
  a.pushBytes(ADDRESS_MASK).op("AND");
}
function revertWith(a: Assembler, label: string, errorSelector: Hex): void {
  a.label(label);
  a.pushBytes(`${errorSelector}${"00".repeat(28)}` as Hex).push(0).op("MSTORE");
  a.push(4).push(0).op("REVERT");
}
function returnWord(a: Assembler): void {
  a.push(0).op("MSTORE").push(32).push(0).op("RETURN");
}

export function managerStubRuntime(): Hex {
  const a = new Assembler();
  a.op("CALLVALUE").jumpi("fail");
  a.push(0).op("CALLDATALOAD").push(0xe0).op("SHR");
  const table: readonly (readonly [string, string])[] = [
    [MANAGER_STUB_SIGNATURES.create, "create"],
    [MANAGER_STUB_SIGNATURES.respond, "respond"],
    [MANAGER_STUB_SIGNATURES.cancel, "cancel"],
    [MANAGER_STUB_SIGNATURES.authority, "authority"],
    [MANAGER_STUB_SIGNATURES.configManager, "configManager"],
    [MANAGER_STUB_SIGNATURES.statusPlusOne, "statusPlusOne"],
    [MANAGER_STUB_SIGNATURES.ownerOf, "ownerOf"],
    [MANAGER_STUB_SIGNATURES.suggestionExpiresAt, "suggestionExpiresAt"],
    [MANAGER_STUB_SIGNATURES.setState, "setState"],
    [MANAGER_STUB_SIGNATURES.emit2, "emit2"],
  ];
  for (const [signature, label] of table) a.op("DUP1").pushBytes(selector(signature)).op("EQ").jumpi(label);
  a.label("fail").push(0).op("DUP1", "REVERT");
  revertWith(a, "err_invalid", MANAGER_STUB_ERRORS.invalidParameter);
  revertWith(a, "err_owner", MANAGER_STUB_ERRORS.notMarketOwner);
  revertWith(a, "err_status", MANAGER_STUB_ERRORS.wrongStatus);
  revertWith(a, "err_window", MANAGER_STUB_ERRORS.windowClosed);
  revertWith(a, "err_fee", MANAGER_STUB_ERRORS.feeTransferFailed);
  revertWith(a, "err_oracle", MANAGER_STUB_ERRORS.notOracle);

  // ---- createConvictionMarket -------------------------------------------------------------------------
  // calldata: [4] startsAt [36] expiresAt [68] collateral [100] offset [132] length [164..] bytes
  a.label("create").op("POP");
  timestamp(a);
  arg(a, 1);
  a.op("GT", "ISZERO").jumpi("err_invalid"); //                      expiresAt > block.timestamp
  arg(a, 0);
  arg(a, 1);
  a.op("LT").jumpi("err_invalid"); //                                 startsAt <= expiresAt (expiresAt < startsAt reverts)
  arg(a, 2);
  mask(a);
  a.push(USDC_E_ADDRESS).op("EQ", "ISZERO").jumpi("err_invalid"); //   collateral == USDC.e
  // fee: USDC.e.transferFrom(caller, treasury, fee)
  a.pushBytes(`${selector("transferFrom(address,address,uint256)")}${"00".repeat(28)}` as Hex);
  mstore(a, 0);
  a.op("CALLER");
  mstore(a, 4);
  a.push(MANAGER_STUB_TREASURY);
  mstore(a, 36);
  a.push(CREATION_FEE_ATOMIC);
  mstore(a, 68);
  a.push(32).push(0).push(100).push(0).push(0); //                   retSize retOffset argsSize argsOffset value
  a.push(USDC_E_ADDRESS).op("GAS", "CALL");
  a.op("ISZERO").jumpi("err_fee");
  a.op("RETURNDATASIZE").push(31).op("LT", "ISZERO").jumpi("err_fee");
  // counter
  a.push(3).op("SLOAD");
  mstore(a, 0x180);
  mload(a, 0x180);
  a.push(1).op("ADD").push(3).op("SSTORE");
  // questionId = keccak(counter . caller), conditionId = keccak(questionId), outcome ids = keccak(questionId . i)
  mload(a, 0x180);
  mstore(a, 0);
  a.op("CALLER");
  mstore(a, 32);
  a.push(64).push(0).op("SHA3");
  mstore(a, 0x100);
  mload(a, 0x100);
  mstore(a, 0);
  a.push(32).push(0).op("SHA3");
  mstore(a, 0x120);
  mload(a, 0x100);
  mstore(a, 0);
  a.push(1);
  mstore(a, 32);
  a.push(64).push(0).op("SHA3");
  mstore(a, 0x140);
  a.push(2);
  mstore(a, 32);
  a.push(64).push(0).op("SHA3");
  mstore(a, 0x160);
  // owner[conditionId] = caller, status = PENDING (+1)
  a.op("CALLER");
  mload(a, 0x120);
  mapSlot(a, 0);
  a.op("SSTORE");
  a.push(1);
  mload(a, 0x120);
  mapSlot(a, 1);
  a.op("SSTORE");
  // CLOBMarketCreated data at 0x200: ten head words, then the string tail
  mload(a, 0x100);
  mstore(a, 0x200); //                                               0 questionId
  mload(a, 0x140);
  mstore(a, 0x220); //                                               1 outcome1TokenId
  mload(a, 0x160);
  mstore(a, 0x240); //                                               2 outcome2TokenId
  arg(a, 2);
  mask(a);
  mstore(a, 0x260); //                                               3 collateral
  a.push(XO_ORACLE);
  mstore(a, 0x280); //                                               4 resolver
  arg(a, 0);
  mstore(a, 0x2a0); //                                               5 startsAt
  arg(a, 1);
  mstore(a, 0x2c0); //                                               6 expiresAt
  a.push(0);
  mstore(a, 0x2e0); //                                               7 creatorFeeBps
  a.push(0x140);
  mstore(a, 0x300); //                                               8 offset of the string
  a.push(MARKET_TYPE_CLOB_CONVICTION);
  mstore(a, 0x320); //                                               9 marketType
  // string tail = calldata[132 .. end): the length word, then the bytes (already padded by the ABI)
  a.push(132).op("CALLDATASIZE", "SUB"); //                          [tailSize]
  a.op("DUP1").push(132).push(0x340).op("CALLDATACOPY"); //          [tailSize]  (dest 0x340, offset 132, size tailSize)
  a.push(0x140).op("ADD"); //                                        [dataSize = 0x140 + tailSize]
  mstore(a, 0x1e0);
  // LOG3(0x200, dataSize, topic0, conditionId, creator)
  a.op("CALLER");
  mload(a, 0x120);
  a.pushBytes(TOPIC_CLOB_CREATED);
  mload(a, 0x1e0);
  a.push(0x200).op("LOG3");
  // MarketCreationFeeCharged(conditionId, creator; collateral, fee)
  arg(a, 2);
  mask(a);
  mstore(a, 0x1a0);
  a.push(CREATION_FEE_ATOMIC);
  mstore(a, 0x1c0);
  a.op("CALLER");
  mload(a, 0x120);
  a.pushBytes(TOPIC_FEE_CHARGED).push(64).push(0x1a0).op("LOG3");
  mload(a, 0x120);
  returnWord(a);

  // ---- respondToUpdateRequest(bytes32,bool) -----------------------------------------------------------------
  a.label("respond").op("POP");
  arg(a, 0);
  mapSlot(a, 0);
  a.op("SLOAD", "CALLER", "EQ", "ISZERO").jumpi("err_owner");
  arg(a, 0);
  mapSlot(a, 1);
  a.op("SLOAD").push(MANAGER_STATUS.UPDATE_REQUIRED + 1).op("EQ", "ISZERO").jumpi("err_status");
  arg(a, 1);
  a.op("ISZERO").jumpi("declined");
  // accept: block.timestamp < suggestionExpiresAt
  arg(a, 0);
  mapSlot(a, 2);
  a.op("SLOAD");
  timestamp(a);
  a.op("LT", "ISZERO").jumpi("err_window"); //                       LT(timestamp, sugExp) must be true
  a.push(MANAGER_STATUS.ACTIVE + 1);
  arg(a, 0);
  mapSlot(a, 1);
  a.op("SSTORE");
  a.push(1);
  a.jump("respond_emit");
  a.label("declined");
  a.push(MANAGER_STATUS.CANCELLED + 1);
  arg(a, 0);
  mapSlot(a, 1);
  a.op("SSTORE");
  a.push(0);
  a.label("respond_emit"); //                                        [accepted]
  a.op("CALLER");
  mstore(a, 0);
  mstore(a, 32); //                                                  mem[32] = accepted
  a.push(0x60);
  mstore(a, 64);
  a.push(0);
  mstore(a, 96);
  arg(a, 0);
  a.pushBytes(TOPIC_RESPONDED).push(128).push(0).op("LOG2", "STOP");

  // ---- cancelMarket(bytes32) ---------------------------------------------------------------------------------------
  a.label("cancel").op("POP");
  arg(a, 0);
  mapSlot(a, 0);
  a.op("SLOAD", "CALLER", "EQ", "ISZERO").jumpi("err_owner");
  arg(a, 0);
  mapSlot(a, 1);
  a.op("SLOAD").push(MANAGER_STATUS.PENDING + 1).op("EQ", "ISZERO").jumpi("err_status");
  a.push(MANAGER_STATUS.CANCELLED + 1);
  arg(a, 0);
  mapSlot(a, 1);
  a.op("SSTORE");
  a.op("CALLER");
  mstore(a, 0);
  arg(a, 0);
  a.pushBytes(TOPIC_CANCELLED).push(32).push(0).op("LOG2", "STOP");

  // ---- views ---------------------------------------------------------------------------------------------------------
  a.label("authority").op("POP");
  a.push(ACCESS_MANAGER);
  returnWord(a);
  a.label("configManager").op("POP");
  a.push(CONFIG_MANAGER);
  returnWord(a);
  a.label("statusPlusOne").op("POP");
  arg(a, 0);
  mapSlot(a, 1);
  a.op("SLOAD");
  returnWord(a);
  a.label("ownerOf").op("POP");
  arg(a, 0);
  mapSlot(a, 0);
  a.op("SLOAD");
  returnWord(a);
  a.label("suggestionExpiresAt").op("POP");
  arg(a, 0);
  mapSlot(a, 2);
  a.op("SLOAD");
  returnWord(a);

  // ---- oracle-only test hooks --------------------------------------------------------------------------------------
  a.label("setState").op("POP");
  a.op("CALLER").push(XO_ORACLE).op("EQ", "ISZERO").jumpi("err_oracle");
  arg(a, 1);
  arg(a, 0);
  mapSlot(a, 1);
  a.op("SSTORE");
  arg(a, 2);
  arg(a, 0);
  mapSlot(a, 2);
  a.op("SSTORE", "STOP");
  a.label("emit2").op("POP");
  a.op("CALLER").push(XO_ORACLE).op("EQ", "ISZERO").jumpi("err_oracle");
  // calldata: [4] topic0 [36] topic1 [68] offset [100] length [132..] bytes
  a.push(100).op("CALLDATALOAD"); //                                  [len]
  a.op("DUP1").push(132).push(0).op("CALLDATACOPY"); //               [len]
  arg(a, 1);
  arg(a, 0);
  a.op("DUP3").push(0).op("LOG2"); //                                  LOG2(0, len, topic0, topic1)
  a.op("POP", "STOP");
  return a.build();
}
