import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { parseAbi, toEventSelector, toFunctionSelector, type Abi, type AbiEvent, type AbiFunction } from "viem";

import {
  ACCESS_MANAGER_ABI,
  ALL_ABIS,
  CONDITIONAL_TOKENS_ABI,
  CONFIG_MANAGER_ABI,
  CTF_EXCHANGE_ABI,
  CTF_EXCHANGE_DECODE_ONLY_ABI,
  ECDSA_VALIDATOR_ABI,
  ENTRY_POINT_ABI,
  ERC20_ABI,
  KERNEL_ABI,
  KERNEL_FACTORY_ABI,
  MAILBOX_ABI,
  MARKET_MANAGER_ABI,
  MARKET_MANAGER_DECODE_ONLY_ABI,
  POLICY_PAYMASTER_ABI,
  UPGRADED_EVENT_ABI,
  WARP_ROUTER_ABI,
} from "../src/xo/chain/abi.js";
import * as C from "../src/xo/chain/constants.js";

// Independent expectation tables. Each value was typed from docs/phase1-gap-closing.md section 2.1
// (marked "spec") or computed once with Foundry `cast sig` / `cast sig-event` (marked "cast"), never
// copied from the code under test. The signature text is the key: a changed argument type changes both
// the recomputed selector and the table lookup.
const FUNCTIONS: Readonly<Record<string, { selector: string; from: "spec" | "cast" }>> = {
  "initialize(bytes21,address,bytes,bytes,bytes[])": { selector: "0x3c3b752b", from: "spec" },
  "execute(bytes32,bytes)": { selector: "0xe9ae5c53", from: "spec" },
  "createAccount(bytes,bytes32)": { selector: "0xea6d13ac", from: "spec" },
  "getAddress(bytes,bytes32)": { selector: "0x48aac392", from: "cast" },
  "implementation()": { selector: "0x5c60da1b", from: "cast" },
  "getNonce(address,uint192)": { selector: "0x35567e1a", from: "spec" },
  "handleOps((address,uint256,bytes,bytes,bytes32,uint256,bytes32,bytes,bytes)[],address)": { selector: "0x765e827f", from: "spec" },
  "getUserOpHash((address,uint256,bytes,bytes,bytes32,uint256,bytes32,bytes,bytes))": { selector: "0x22cdde4c", from: "cast" },
  "ecdsaValidatorStorage(address)": { selector: "0x20709efc", from: "cast" },
  "approve(address,uint256)": { selector: "0x095ea7b3", from: "spec" },
  "allowance(address,address)": { selector: "0xdd62ed3e", from: "spec" },
  "transfer(address,uint256)": { selector: "0xa9059cbb", from: "cast" },
  "balanceOf(address)": { selector: "0x70a08231", from: "spec" },
  "setApprovalForAll(address,bool)": { selector: "0xa22cb465", from: "cast" },
  "isApprovedForAll(address,address)": { selector: "0xe985e9c5", from: "cast" },
  "redeemPositions(address,bytes32,bytes32,uint256[])": { selector: "0x01b7037c", from: "cast" },
  "payoutDenominator(bytes32)": { selector: "0xdd34de67", from: "cast" },
  "token()": { selector: "0xfc0c546a", from: "spec" },
  "routers(uint32)": { selector: "0x2ead72f6", from: "spec" },
  "mailbox()": { selector: "0xd5438eae", from: "cast" },
  "interchainSecurityModule()": { selector: "0xde523cf3", from: "cast" },
  "localDomain()": { selector: "0x8d3638f4", from: "cast" },
  "quoteTransferRemote(uint32,bytes32,uint256)": { selector: "0x8bd90b82", from: "spec" },
  "transferRemote(uint32,bytes32,uint256)": { selector: "0x81b4e8b4", from: "spec" },
  "delivered(bytes32)": { selector: "0xe495f1d4", from: "spec" },
  "defaultHook()": { selector: "0x3d1250b7", from: "cast" },
  "requiredHook()": { selector: "0xd6d08a09", from: "cast" },
  "defaultIsm()": { selector: "0x6e5f516e", from: "cast" },
  "checkPolicy(address,address,bytes4)": { selector: "0xb591eaca", from: "spec" },
  "paused()": { selector: "0x5c975abb", from: "spec" },
  "dailyTxLimit()": { selector: "0xda023b31", from: "spec" },
  "getRemainingDailyTxs(address)": { selector: "0xad1e92ea", from: "spec" },
  "nonces(address)": { selector: "0x7ecebe00", from: "spec" },
  "validateOrder((uint256,address,address,address,uint256,uint256,uint256,uint256,uint128,bytes16,bytes32,uint8,uint8,bytes))": { selector: "0x5451c7a4", from: "spec" },
  "incrementNonceFor(address)": { selector: "0xbfb66376", from: "spec" },
  "createConvictionMarket(uint40,uint40,address,string)": { selector: "0x7f54a7a2", from: "spec" },
  "respondToUpdateRequest(bytes32,bool)": { selector: "0x1de5facd", from: "spec" },
  "cancelMarket(bytes32)": { selector: "0xbdb83289", from: "spec" },
  "authority()": { selector: "0xbf7e214f", from: "spec" },
  "CONFIG_MANAGER()": { selector: "0x6d64c83f", from: "spec" },
  "reviewMarket(bytes32,uint8,string,string,uint40,uint40)": { selector: "0x4cbe35ee", from: "spec" },
  "createConvictionMarketFor(address,uint40,uint40,address,string)": { selector: "0x507cedd3", from: "spec" },
  "updateMetadata(bytes32,string)": { selector: "0xa375765e", from: "spec" },
  "canCall(address,address,bytes4)": { selector: "0xb7009613", from: "spec" },
  "collateralConfig(address)": { selector: "0x0cc248ad", from: "spec" },
};

const EVENTS: Readonly<Record<string, { topic: string; from: "spec" | "cast" }>> = {
  "UserOperationEvent(bytes32,address,address,uint256,bool,uint256,uint256)": { topic: "0x49628fd1471006c1482da88028e9ce4dbb080b815c9b0344d39e5a8e6ec1419f", from: "spec" },
  "AccountDeployed(bytes32,address,address,address)": { topic: "0xd51a9c61267aa6196961883ecf5ff2da6619c37dac0fa92122513fb32c032d2d", from: "spec" },
  "OwnerRegistered(address,address)": { topic: "0xa5e1f8b4009110f5525798d04ae2125421a12d0590aa52c13682ff1bd3c492ca", from: "spec" },
  "Approval(address,address,uint256)": { topic: "0x8c5be1e5ebec7d5bd14f71427d1e84f3dd0314c0f7b2291e5b200ac8c7c3b925", from: "cast" },
  "Transfer(address,address,uint256)": { topic: "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef", from: "cast" },
  "ApprovalForAll(address,address,bool)": { topic: "0x17307eab39ab6107e8899845ad3d59bd9653f200f220920489ca2b5937696c31", from: "cast" },
  "ConditionResolution(bytes32,address,bytes32,uint256,uint256[])": { topic: "0xb44d84d3289691f71497564b85d4233648d9dbae8cbdbb4329f301c3a0185894", from: "cast" },
  "SentTransferRemote(uint32,bytes32,uint256)": { topic: "0xd229aacb94204188fe8042965fa6b269c62dc5818b21238779ab64bdd17efeec", from: "cast" },
  "ReceivedTransferRemote(uint32,bytes32,uint256)": { topic: "0xba20947a325f450d232530e5f5fce293e7963499d5309a07cee84a269f2f15a6", from: "cast" },
  "DispatchId(bytes32)": { topic: "0x788dbc1b7152732178210e7f4d9d010ef016f9eafbe66786bd7169f56e0c353a", from: "spec" },
  "ProcessId(bytes32)": { topic: "0x1cae38cdd3d3919489272725a5ae62a4f48b2989b0dae843d3c279fee18073a9", from: "spec" },
  "Upgraded(address)": { topic: "0xbc7cd75a20ee27fd9adebab32041f755214dbc6bffa90cc0225b39da2e5c2d3b", from: "spec" },
  "NonceIncremented(address,uint128,uint128,address)": { topic: "0xc3ab8769b052bec3201cd16265d258ccc297277e8d91d562d5b5e399d5f8cca0", from: "spec" },
  "MaxFeeRateUpdated(uint256,uint256)": { topic: "0x3b0628c08a7360081d719329ff580ace85680788ec349e5f2b95788e262fd61d", from: "spec" },
  "CLOBMarketCreated(bytes32,address,bytes32,uint256,uint256,address,address,uint40,uint40,uint16,string,uint8)": { topic: "0xfc777083d83af2d598c4ee0de93a86199dec7742d0001485cb6e25bc8c3b16c8", from: "spec" },
  "MarketReviewed(bytes32,uint8,string,string,uint40,uint40)": { topic: "0xab43af6d7c659e1ce1dfdc8a80d94af9f6b085793b380ddd2e8a0d1b6d3ba27f", from: "spec" },
  "MarketCreationFeeCharged(bytes32,address,address,uint256)": { topic: "0xe9927345bdffcfbc768aecc0c516a76565447079fc0dab2b1e5f2c28e91dcf2e", from: "spec" },
  "UpdateRequestResponded(bytes32,address,bool,string)": { topic: "0xd875fbcccd09683c3f5634238cfc5441c0c702ec33c6d705dd181524212ac74b", from: "spec" },
  "MarketCancelledByOwner(bytes32,address)": { topic: "0xa594ccd17afec32aa8a5584fd61eb38872adbb5948e5de67a3046bcc9236e2ea", from: "spec" },
  "MetadataUpdated(bytes32,string)": { topic: "0xe36c73fd13989812054eaa73a813bdd65752bda9044a9bdac079e4143c6ab7bd", from: "spec" },
};

// The signature text of an ABI item, built from the item's own components (not from the code under test).
function signatureOf(item: AbiFunction | AbiEvent): string {
  const type = (input: { type: string; components?: readonly { type: string; components?: readonly unknown[] }[] }): string => {
    if (!input.type.startsWith("tuple")) return input.type;
    const inner = (input.components ?? []).map((c) => type(c as never)).join(",");
    return `(${inner})${input.type.slice("tuple".length)}`;
  };
  return `${item.name}(${item.inputs.map((i) => type(i as never)).join(",")})`;
}

function allItems(): Array<{ abiName: string; item: AbiFunction | AbiEvent }> {
  const out: Array<{ abiName: string; item: AbiFunction | AbiEvent }> = [];
  for (const [abiName, abi] of Object.entries(ALL_ABIS)) {
    for (const item of abi as Abi) if (item.type === "function" || item.type === "event") out.push({ abiName, item });
  }
  return out;
}

describe("selectors and topics recomputed from the fragments", () => {
  const items = allItems();

  it("recomputes every function selector and finds it in the independent table", () => {
    const seen = new Set<string>();
    for (const { abiName, item } of items) {
      if (item.type !== "function") continue;
      const signature = signatureOf(item);
      const expected = FUNCTIONS[signature];
      assert.ok(expected !== undefined, `${abiName} has a function ${signature} that the table does not pin`);
      assert.equal(toFunctionSelector(item), expected.selector, `${abiName}.${signature}`);
      seen.add(signature);
    }
    // And the table has no entry that no fragment produces.
    assert.deepEqual([...seen].sort(), Object.keys(FUNCTIONS).sort());
  });

  it("recomputes every event topic and finds it in the independent table", () => {
    const seen = new Set<string>();
    for (const { abiName, item } of items) {
      if (item.type !== "event") continue;
      const signature = signatureOf(item);
      const expected = EVENTS[signature];
      assert.ok(expected !== undefined, `${abiName} has an event ${signature} that the table does not pin`);
      assert.equal(toEventSelector(item), expected.topic, `${abiName}.${signature}`);
      seen.add(signature);
    }
    assert.deepEqual([...seen].sort(), Object.keys(EVENTS).sort());
  });

  it("covers the 21 selectors and 11 topics the spec states (and more)", () => {
    const specSelectors = Object.values(FUNCTIONS).filter((f) => f.from === "spec").length;
    const specTopics = Object.values(EVENTS).filter((e) => e.from === "spec").length;
    assert.ok(specSelectors >= 21, `only ${specSelectors} spec selectors are pinned`);
    assert.ok(specTopics >= 11, `only ${specTopics} spec topics are pinned`);
  });

  it("makes every selector and topic constant in constants.ts equal the recomputed value", () => {
    const bySelector = new Map(Object.values(FUNCTIONS).map((f) => [f.selector, true]));
    const byTopic = new Map(Object.values(EVENTS).map((e) => [e.topic, true]));
    const selectorNames = Object.entries(C).filter(([name]) => /_SELECTOR(_NEVER_CALL)?$/.test(name) && !["ROOT_VALIDATOR_TYPE_BYTE"].includes(name));
    const topicNames = Object.entries(C).filter(([name]) => /_TOPIC$/.test(name));
    assert.ok(selectorNames.length >= 20, `found ${selectorNames.length} selector constants`);
    assert.ok(topicNames.length >= 14, `found ${topicNames.length} topic constants`);
    for (const [name, value] of selectorNames) assert.ok(bySelector.has(value as string), `${name} = ${String(value)} is not produced by any fragment`);
    for (const [name, value] of topicNames) assert.ok(byTopic.has(value as string), `${name} = ${String(value)} is not produced by any fragment`);
  });

  it("names each constant after the function or event it equals", () => {
    const pairs: ReadonlyArray<readonly [string, string]> = [
      ["FACTORY_CREATE_ACCOUNT_SELECTOR", "createAccount(bytes,bytes32)"],
      ["KERNEL_INITIALIZE_SELECTOR", "initialize(bytes21,address,bytes,bytes,bytes[])"],
      ["GET_NONCE_SELECTOR", "getNonce(address,uint192)"],
      ["EXECUTE_SELECTOR", "execute(bytes32,bytes)"],
      ["HANDLE_OPS_SELECTOR", "handleOps((address,uint256,bytes,bytes,bytes32,uint256,bytes32,bytes,bytes)[],address)"],
      ["CHECK_POLICY_SELECTOR", "checkPolicy(address,address,bytes4)"],
      ["PAYMASTER_PAUSED_SELECTOR", "paused()"],
      ["PAYMASTER_DAILY_TX_LIMIT_SELECTOR", "dailyTxLimit()"],
      ["PAYMASTER_REMAINING_DAILY_TXS_SELECTOR", "getRemainingDailyTxs(address)"],
      ["EXCHANGE_NONCES_SELECTOR", "nonces(address)"],
      ["INCREMENT_NONCE_FOR_SELECTOR", "incrementNonceFor(address)"],
      ["VALIDATE_ORDER_SELECTOR", "validateOrder((uint256,address,address,address,uint256,uint256,uint256,uint256,uint128,bytes16,bytes32,uint8,uint8,bytes))"],
      ["CREATE_CONVICTION_MARKET_SELECTOR", "createConvictionMarket(uint40,uint40,address,string)"],
      ["RESPOND_TO_UPDATE_REQUEST_SELECTOR", "respondToUpdateRequest(bytes32,bool)"],
      ["CANCEL_MARKET_SELECTOR", "cancelMarket(bytes32)"],
      ["REVIEW_MARKET_SELECTOR_NEVER_CALL", "reviewMarket(bytes32,uint8,string,string,uint40,uint40)"],
      ["CREATE_CONVICTION_MARKET_FOR_SELECTOR_NEVER_CALL", "createConvictionMarketFor(address,uint40,uint40,address,string)"],
      ["UPDATE_METADATA_SELECTOR_NEVER_CALL", "updateMetadata(bytes32,string)"],
      ["ACCESS_MANAGER_CAN_CALL_SELECTOR", "canCall(address,address,bytes4)"],
      ["MANAGER_AUTHORITY_SELECTOR", "authority()"],
      ["MANAGER_CONFIG_MANAGER_SELECTOR", "CONFIG_MANAGER()"],
      ["COLLATERAL_CONFIG_SELECTOR", "collateralConfig(address)"],
      ["APPROVE_SELECTOR", "approve(address,uint256)"],
      ["TRANSFER_REMOTE_SELECTOR", "transferRemote(uint32,bytes32,uint256)"],
      ["ROUTER_TOKEN_SELECTOR", "token()"],
      ["ROUTER_ROUTERS_SELECTOR", "routers(uint32)"],
      ["ERC20_ALLOWANCE_SELECTOR", "allowance(address,address)"],
      ["ERC20_BALANCE_OF_SELECTOR", "balanceOf(address)"],
      ["ROUTER_QUOTE_TRANSFER_REMOTE_SELECTOR", "quoteTransferRemote(uint32,bytes32,uint256)"],
      ["MAILBOX_DELIVERED_SELECTOR", "delivered(bytes32)"],
    ];
    const constants = C as unknown as Record<string, string>;
    for (const [name, signature] of pairs) {
      const expected = FUNCTIONS[signature];
      assert.ok(expected !== undefined, signature);
      assert.equal(constants[name], expected.selector, name);
    }
    const topicPairs: ReadonlyArray<readonly [string, string]> = [
      ["OWNER_REGISTERED_TOPIC", "OwnerRegistered(address,address)"],
      ["ACCOUNT_DEPLOYED_TOPIC", "AccountDeployed(bytes32,address,address,address)"],
      ["USER_OPERATION_EVENT_TOPIC", "UserOperationEvent(bytes32,address,address,uint256,bool,uint256,uint256)"],
      ["UPGRADED_TOPIC", "Upgraded(address)"],
      ["NONCE_INCREMENTED_TOPIC", "NonceIncremented(address,uint128,uint128,address)"],
      ["MAX_FEE_RATE_UPDATED_TOPIC", "MaxFeeRateUpdated(uint256,uint256)"],
      ["CLOB_MARKET_CREATED_TOPIC", "CLOBMarketCreated(bytes32,address,bytes32,uint256,uint256,address,address,uint40,uint40,uint16,string,uint8)"],
      ["MARKET_REVIEWED_TOPIC", "MarketReviewed(bytes32,uint8,string,string,uint40,uint40)"],
      ["MARKET_CREATION_FEE_CHARGED_TOPIC", "MarketCreationFeeCharged(bytes32,address,address,uint256)"],
      ["UPDATE_REQUEST_RESPONDED_TOPIC", "UpdateRequestResponded(bytes32,address,bool,string)"],
      ["MARKET_CANCELLED_BY_OWNER_TOPIC", "MarketCancelledByOwner(bytes32,address)"],
      ["METADATA_UPDATED_TOPIC", "MetadataUpdated(bytes32,string)"],
      ["DISPATCH_ID_TOPIC", "DispatchId(bytes32)"],
      ["PROCESS_ID_TOPIC", "ProcessId(bytes32)"],
      ["ERC20_APPROVAL_TOPIC", "Approval(address,address,uint256)"],
      ["APPROVAL_FOR_ALL_TOPIC", "ApprovalForAll(address,address,bool)"],
    ];
    for (const [name, signature] of topicPairs) {
      const expected = EVENTS[signature];
      assert.ok(expected !== undefined, signature);
      assert.equal(constants[name], expected.topic, name);
    }
  });

  it("has teeth: a changed argument type changes the selector, so the table would no longer match", () => {
    const tampered = parseAbi(["function approve(address spender, uint128 value) returns (bool)"]);
    const item = tampered[0] as AbiFunction;
    assert.notEqual(toFunctionSelector(item), FUNCTIONS["approve(address,uint256)"]?.selector);
    assert.equal(FUNCTIONS[signatureOf(item)], undefined);
    const tamperedEvent = parseAbi(["event OwnerRegistered(address kernel, address owner)"])[0] as AbiEvent;
    // Indexed-ness does not change a topic0, so only the types matter: a different type does.
    const differentType = parseAbi(["event OwnerRegistered(address indexed kernel, address indexed owner, uint256 extra)"])[0] as AbiEvent;
    assert.equal(toEventSelector(tamperedEvent), EVENTS["OwnerRegistered(address,address)"]?.topic);
    assert.notEqual(toEventSelector(differentType), EVENTS["OwnerRegistered(address,address)"]?.topic);
  });
});

function functionNames(abi: Abi): string[] {
  return abi.flatMap((item) => (item.type === "function" ? [item.name] : []));
}

describe("builder fragments versus decode-only fragments", () => {
  const BUILDER_ABIS: Readonly<Record<string, Abi>> = {
    KERNEL_ABI,
    KERNEL_FACTORY_ABI,
    ENTRY_POINT_ABI,
    ECDSA_VALIDATOR_ABI,
    ERC20_ABI,
    CONDITIONAL_TOKENS_ABI,
    WARP_ROUTER_ABI,
    MAILBOX_ABI,
    POLICY_PAYMASTER_ABI,
    UPGRADED_EVENT_ABI,
    CTF_EXCHANGE_ABI,
    MARKET_MANAGER_ABI,
    ACCESS_MANAGER_ABI,
    CONFIG_MANAGER_ABI,
  };

  it("keeps operator and role-gated functions out of every builder ABI", () => {
    const never = ["incrementNonceFor", "reviewMarket", "createConvictionMarketFor", "updateMetadata", "updateMetadataAndActivate", "pauseTrading", "unpauseTrading", "createCLOBMarket"];
    for (const [name, abi] of Object.entries(BUILDER_ABIS)) {
      for (const fn of functionNames(abi)) assert.ok(!never.includes(fn), `${name} contains ${fn}`);
    }
  });

  it("holds those functions in the decode-only ABIs", () => {
    assert.deepEqual(functionNames(CTF_EXCHANGE_DECODE_ONLY_ABI), ["incrementNonceFor"]);
    assert.deepEqual(functionNames(MARKET_MANAGER_DECODE_ONLY_ABI), ["reviewMarket", "createConvictionMarketFor", "updateMetadata"]);
  });

  it("gives the manager exactly the three calls the plan builds and the six events it follows", () => {
    const writes = MARKET_MANAGER_ABI.flatMap((item) => (item.type === "function" && item.stateMutability !== "view" ? [item.name] : []));
    assert.deepEqual(writes, ["createConvictionMarket", "respondToUpdateRequest", "cancelMarket"]);
    const events = MARKET_MANAGER_ABI.flatMap((item) => (item.type === "event" ? [item.name] : []));
    assert.deepEqual(events, ["CLOBMarketCreated", "MarketReviewed", "MarketCreationFeeCharged", "UpdateRequestResponded", "MarketCancelledByOwner", "MetadataUpdated"]);
  });

  it("gives the router exactly the preflight views plus transferRemote as its only write", () => {
    const writes = WARP_ROUTER_ABI.flatMap((item) => (item.type === "function" && item.stateMutability !== "view" ? [item.name] : []));
    assert.deepEqual(writes, ["transferRemote"]);
    const transfer = WARP_ROUTER_ABI.find((item) => item.type === "function" && item.name === "transferRemote");
    assert.equal(transfer?.type === "function" ? transfer.stateMutability : null, "payable");
  });

  it("has no state-changing function on the paymaster, the access manager, the config manager or the mailbox", () => {
    for (const abi of [POLICY_PAYMASTER_ABI, ACCESS_MANAGER_ABI, CONFIG_MANAGER_ABI, MAILBOX_ABI]) {
      for (const item of abi) if (item.type === "function") assert.equal(item.stateMutability, "view", item.name);
    }
  });
});
