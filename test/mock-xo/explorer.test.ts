import assert from "node:assert/strict";
import { describe } from "node:test";

import { keccak256, toHex, type Address, type Hex } from "viem";

import { deriveAccount } from "../../src/xo/account/derive.js";
import {
  ACCOUNT_DEPLOYED_TOPIC,
  ECDSA_VALIDATOR,
  ENTRY_POINT_V07,
  KERNEL_FACTORY,
  OWNER_REGISTERED_TOPIC,
  USER_OPERATION_EVENT_TOPIC,
} from "../../src/xo/chain/constants.js";
import { ExplorerLogReader, padAddressTopic, readDeploymentLogs } from "../../src/xo/chain/reads.js";
import { XO_PLUGIN_HOSTS, XoHttp } from "../../src/xo/http.js";
import type { LogSeed } from "./explorer.js";
import type { MockXo } from "./server.js";
import { deployOwner, getJson, useMock } from "./testing.js";

const MOCK_TOPIC = keccak256(toHex("MockEvent(uint256)"));
const MOCK_ADDRESS = ENTRY_POINT_V07;

function readerFor(mock: MockXo, options: { attemptTimeoutMs?: number } = {}): ExplorerLogReader {
  const http = new XoHttp({ fetchImpl: mock.fetch, allowedHosts: XO_PLUGIN_HOSTS, minIntervalMs: 0, sleep: async () => undefined, ...options });
  return new ExplorerLogReader({ transport: { getJson: (url) => http.getJson(url) } });
}

function seeds(count: number, firstBlock = 10_000, perBlock = 1): LogSeed[] {
  return Array.from({ length: count }, (_, i) => ({
    address: MOCK_ADDRESS,
    topics: [MOCK_TOPIC],
    data: toHex(BigInt(i), { size: 32 }),
    blockNumber: firstBlock + Math.floor(i / perBlock),
    logIndex: i % perBlock,
    transactionHash: keccak256(toHex(`mock-tx:${String(i)}`)),
  }));
}

interface RawRow {
  address: string;
  blockNumber: string | null;
  topics: (string | null)[];
  data: string;
  logIndex: string;
  timeStamp: string | null;
  transactionHash: string;
  transactionIndex: string;
}

async function logs(mock: MockXo, query: string): Promise<{ status: string; message: string; result: RawRow[] | null }> {
  return (await getJson(mock, "explorer", `/api?module=logs&action=getLogs&${query}`)).body as { status: string; message: string; result: RawRow[] | null };
}

describe("explorer getLogs: the cap, paging, pending rows and lazy addresses (synthetic logs, no chain)", () => {
  const harness = useMock({ chains: false });
  const QUERY = `fromBlock=0&toBlock=latest&address=${MOCK_ADDRESS}&topic0=${MOCK_TOPIC}`;

  harness.it("answers with the envelope and row fields the research scripts read", async (mock) => {
    mock.explorer.syntheticLogs.push(...seeds(3));
    const answer = await logs(mock, QUERY);
    assert.equal(answer.status, "1");
    assert.equal(answer.message, "OK");
    const row = answer.result?.[0];
    assert.ok(row !== undefined);
    assert.deepEqual(Object.keys(row).sort(), ["address", "blockNumber", "data", "gasPrice", "gasUsed", "logIndex", "timeStamp", "topics", "transactionHash", "transactionIndex"]);
    assert.equal(row.address, MOCK_ADDRESS.toLowerCase());
    assert.equal(row.blockNumber, "0x2710");
    assert.deepEqual(row.topics, [MOCK_TOPIC, null, null, null]);
    assert.equal(BigInt(row.timeStamp ?? "0x0"), BigInt(mock.clock.nowSeconds()));
  });

  harness.it("says 'No logs found' with status 0 and an empty list when nothing matches", async (mock) => {
    const answer = await logs(mock, QUERY);
    assert.deepEqual(answer, { status: "0", message: "No logs found", result: [] });
  });

  harness.it("returns at most 1,000 rows however many match, and ignores page and offset", async (mock) => {
    mock.explorer.syntheticLogs.push(...seeds(2_500));
    const first = await logs(mock, QUERY);
    assert.equal(first.result?.length, 1_000);
    const second = await logs(mock, `${QUERY}&page=2&offset=1000`);
    const third = await logs(mock, `${QUERY}&page=3`);
    assert.deepEqual(second.result, first.result);
    assert.deepEqual(third.result, first.result);
  });

  harness.it("the cap keeps the earliest rows, the latest rows or a spread, as set", async (mock) => {
    mock.explorer.syntheticLogs.push(...seeds(2_500));
    const blocks = async () => ((await logs(mock, QUERY)).result ?? []).map((row) => Number(BigInt(row.blockNumber ?? "0x0")));
    const earliest = await blocks();
    assert.equal(earliest[0], 10_000);
    assert.equal(earliest[999], 10_999);
    mock.explorer.capMode = "latest";
    const latest = await blocks();
    assert.equal(latest[0], 11_500);
    assert.equal(latest[999], 12_499);
    mock.explorer.capMode = "scattered";
    const spread = await blocks();
    assert.equal(spread.length, 1_000);
    assert.equal(spread[0], 10_000);
    assert.ok((spread[999] ?? 0) > 12_400);
    assert.equal(new Set(spread).size, 1_000);
  });

  for (const mode of ["earliest", "latest", "scattered"] as const) {
    harness.it(`the production reader gets all 2,500 rows by splitting block ranges when the cap keeps the ${mode} rows`, async (mock) => {
      mock.explorer.syntheticLogs.push(...seeds(2_500));
      mock.explorer.capMode = mode;
      const result = await readerFor(mock).getLogs({ address: MOCK_ADDRESS, topic0: MOCK_TOPIC as Hex });
      assert.equal(result.complete, true);
      assert.equal(result.logs.length, 2_500);
      assert.ok(result.requests > 1 && result.requests <= 16, `${String(result.requests)} requests`);
      assert.deepEqual(
        result.logs.map((log) => Number(log.blockNumber)),
        Array.from({ length: 2_500 }, (_, i) => 10_000 + i),
      );
    });
  }

  harness.it("a block with more rows than the cap cannot be completed, and the reader says so", async (mock) => {
    // 1,200 rows in one block against a cap of 1,000: no block range is narrower than one block.
    mock.explorer.syntheticLogs.push(...seeds(1_200, 20_000, 1_200));
    const result = await readerFor(mock).getLogs({ address: MOCK_ADDRESS, topic0: MOCK_TOPIC as Hex });
    assert.equal(result.complete, false);
    assert.ok(result.logs.length <= 1_000);
  });

  harness.it("a smaller cap is honoured", async (mock) => {
    mock.explorer.rowCap = 7;
    mock.explorer.syntheticLogs.push(...seeds(30));
    assert.equal((await logs(mock, QUERY)).result?.length, 7);
  });

  harness.it("pending rows have a null block number and the production reader drops them", async (mock) => {
    mock.explorer.syntheticLogs.push(...seeds(2));
    mock.explorer.pendingLogRows.push(...seeds(3, 0).map((seed): LogSeed => ({ ...seed, blockNumber: null, transactionHash: keccak256(toHex(`pending:${seed.data}`)) })));
    const raw = (await logs(mock, QUERY)).result ?? [];
    assert.equal(raw.length, 5);
    assert.equal(raw.filter((row) => row.blockNumber === null).length, 3);
    assert.equal(raw.filter((row) => row.timeStamp === null).length, 3);
    const read = await readerFor(mock).getLogs({ address: MOCK_ADDRESS, topic0: MOCK_TOPIC as Hex });
    assert.equal(read.droppedPending, 3);
    assert.equal(read.logs.length, 2);
    assert.equal(read.complete, true);
  });

  harness.it("a lazily filled address column is empty on an address-filtered query, and the reader fills it from the query", async (mock) => {
    mock.explorer.syntheticLogs.push(...seeds(4));
    mock.explorer.blankLogAddresses = true;
    const filtered = (await logs(mock, QUERY)).result ?? [];
    assert.ok(filtered.every((row) => row.address === ""));
    const unfiltered = (await logs(mock, `fromBlock=0&toBlock=latest&topic0=${MOCK_TOPIC}`)).result ?? [];
    assert.ok(unfiltered.every((row) => row.address !== ""), "without an address filter the column is not blank");
    const read = await readerFor(mock).getLogs({ address: MOCK_ADDRESS, topic0: MOCK_TOPIC as Hex });
    assert.equal(read.addressFilled, 4);
    assert.equal(read.logs.length, 4);
    assert.ok(read.logs.every((log) => log.address === MOCK_ADDRESS));
  });

  harness.it("filters by address and by block range", async (mock) => {
    mock.explorer.syntheticLogs.push(...seeds(10));
    assert.equal((await logs(mock, `fromBlock=10003&toBlock=10005&address=${MOCK_ADDRESS}&topic0=${MOCK_TOPIC}`)).result?.length, 3);
    assert.equal((await logs(mock, `fromBlock=10003&toBlock=10005&address=${KERNEL_FACTORY}&topic0=${MOCK_TOPIC}`)).result?.length, 0);
    assert.equal((await logs(mock, `fromBlock=10009&toBlock=latest&topic0=${MOCK_TOPIC}`)).result?.length, 1);
    assert.equal((await logs(mock, `fromBlock=20000&toBlock=latest&topic0=${MOCK_TOPIC}`)).result?.length, 0);
  });

  harness.it("a range wider than the span limit never answers, and the reader recovers by halving the range", async (mock) => {
    mock.explorer.syntheticLogs.push(...seeds(20, 100));
    mock.explorer.spanLimitBlocks = 30;
    const quick = readerFor(mock, { attemptTimeoutMs: 250 });
    const result = await quick.getLogs({ address: MOCK_ADDRESS, topic0: MOCK_TOPIC as Hex, fromBlock: 0n, toBlock: 140n });
    assert.equal(result.complete, true);
    assert.equal(result.logs.length, 20);
    assert.ok(result.requests > 3, `${String(result.requests)} requests`);
    mock.explorer.spanLimitBlocks = Number.POSITIVE_INFINITY;
  });

  harness.it("refuses malformed parameters and unknown modules with status 0, and supports only 'and'", async (mock) => {
    assert.equal((await logs(mock, "fromBlock=abc&toBlock=latest")).status, "0");
    assert.match((await logs(mock, "address=0x12")).message, /Invalid address/);
    assert.match((await logs(mock, "topic0=0x12")).message, /Invalid topic0/);
    assert.match((await logs(mock, `topic0=${MOCK_TOPIC}&topic1=${MOCK_TOPIC}&topic0_1_opr=or`)).message, /Unsupported/);
    const unknown = (await getJson(mock, "explorer", "/api?module=proxy&action=eth_blockNumber")).body;
    assert.deepEqual(unknown, { status: "0", message: "Unknown module", result: null });
    assert.deepEqual((await getJson(mock, "explorer", "/api?module=logs&action=getLogz")).body, { status: "0", message: "Unknown action", result: null });
  });

  harness.it("the faults switch reaches the explorer: a 5xx, a rate limit and truncated JSON each fail the reader the way the client reports it", async (mock) => {
    mock.explorer.syntheticLogs.push(...seeds(2));
    mock.injectFault("5xx", { count: 2 });
    await assert.rejects(readerFor(mock).getLogs({ address: MOCK_ADDRESS, topic0: MOCK_TOPIC as Hex }), (error: unknown) => (error as { code?: string }).code === "upstream_error");
    mock.injectFault("truncated-json", { count: 1 });
    await assert.rejects(readerFor(mock).getLogs({ address: MOCK_ADDRESS, topic0: MOCK_TOPIC as Hex }), (error: unknown) => (error as { code?: string }).code === "invalid_response");
    mock.injectFault("429-retry-after", { count: 2, retryAfterMs: 50 });
    await assert.rejects(readerFor(mock).getLogs({ address: MOCK_ADDRESS, topic0: MOCK_TOPIC as Hex }), (error: unknown) => (error as { code?: string }).code === "rate_limited");
    assert.equal((await readerFor(mock).getLogs({ address: MOCK_ADDRESS, topic0: MOCK_TOPIC as Hex })).logs.length, 2);
  });
});

describe("explorer: logs from the chain, and the lazy fields (real EntryPoint, factory and validator on anvil)", () => {
  const harness = useMock({ chains: { xo: true, base: false } });

  harness.it("serves the chain's own AccountDeployed log with the topic filter the research used", async (mock) => {
    const { account } = await deployOwner(mock, 2);
    const topic = padAddressTopic(account);
    const answer = await logs(mock, `fromBlock=0&toBlock=latest&address=${ENTRY_POINT_V07}&topic0=${ACCOUNT_DEPLOYED_TOPIC}&topic2=${topic}&topic0_2_opr=and`);
    assert.equal(answer.status, "1");
    assert.equal(answer.result?.length, 1);
    const row = answer.result?.[0] as RawRow;
    const chain = mock.chains.xo;
    assert.ok(chain !== undefined);
    const direct = await chain.rpc<{ topics: string[]; data: string; blockNumber: string; transactionHash: string; logIndex: string }[]>("eth_getLogs", [
      { fromBlock: "0x0", toBlock: "latest", address: ENTRY_POINT_V07, topics: [ACCOUNT_DEPLOYED_TOPIC, null, topic] },
    ]);
    assert.equal(direct.length, 1);
    assert.deepEqual(row.topics.slice(0, 3), direct[0]?.topics);
    assert.equal(row.topics[3], null);
    assert.equal(row.data, direct[0]?.data);
    assert.equal(row.blockNumber, direct[0]?.blockNumber);
    assert.equal(row.transactionHash, direct[0]?.transactionHash);
    assert.equal(BigInt(row.logIndex), BigInt(direct[0]?.logIndex ?? "0x0"));
    const block = await chain.rpc<{ timestamp: string }>("eth_getBlockByNumber", [row.blockNumber, false]);
    assert.equal(row.timeStamp, block.timestamp);
  });

  harness.it("ignores a topic filter that no opr parameter links, exactly as the real explorer does", async (mock) => {
    const a = await deployOwner(mock, 2);
    await deployOwner(mock, 3);
    const base = `fromBlock=0&toBlock=latest&address=${ENTRY_POINT_V07}&topic0=${ACCOUNT_DEPLOYED_TOPIC}&topic2=${padAddressTopic(a.account)}`;
    assert.equal((await logs(mock, base)).result?.length, 2, "without the opr the sender filter is dropped");
    assert.equal((await logs(mock, `${base}&topic0_2_opr=and`)).result?.length, 1);
  });

  harness.it("the production reader tells a deployed account from an undeployed one by the logs", async (mock) => {
    const deployed = await deployOwner(mock, 2);
    const undeployedAccount = deriveAccount(mock.chains.xo?.owner(5).address ?? deployed.owner);
    const reader = readerFor(mock);
    const yes = await readDeploymentLogs(reader, deployed.account);
    assert.equal(yes.accountDeployed.length, 1);
    assert.equal(yes.ownerRegistered.length, 1);
    assert.equal(yes.ownerRegistered[0]?.owner, deployed.owner);
    assert.equal(yes.complete, true);
    const no = await readDeploymentLogs(reader, undeployedAccount);
    assert.equal(no.accountDeployed.length, 0);
    assert.equal(no.ownerRegistered.length, 0);
    assert.equal(no.complete, true);
  });

  harness.it("serves the validator's OwnerRegistered log by account and the UserOperationEvent by hash", async (mock) => {
    const { account, userOpHashes } = await deployOwner(mock, 2);
    const owner = await logs(mock, `fromBlock=0&toBlock=latest&address=${ECDSA_VALIDATOR}&topic0=${OWNER_REGISTERED_TOPIC}&topic1=${padAddressTopic(account)}&topic0_1_opr=and`);
    assert.equal(owner.result?.length, 1);
    const event = await logs(mock, `fromBlock=0&toBlock=latest&address=${ENTRY_POINT_V07}&topic0=${USER_OPERATION_EVENT_TOPIC}&topic1=${userOpHashes[0]}&topic0_1_opr=and`);
    assert.equal(event.result?.length, 1);
  });

  harness.it("fills is_contract and the smart-contracts endpoint late: a deployed account reads as no contract until the delay passes", async (mock) => {
    const { account } = await deployOwner(mock, 2);
    // The logs already say deployed...
    assert.equal((await readDeploymentLogs(readerFor(mock), account)).accountDeployed.length, 1);
    // ...and the explorer's fields still do not.
    const first = (await getJson(mock, "explorer", `/api/v2/addresses/${account}`)).body as { is_contract: boolean; hash: string };
    assert.equal(first.is_contract, false);
    assert.equal(first.hash, account);
    assert.equal((await getJson(mock, "explorer", `/api/v2/smart-contracts/${account}`)).status, 404);
    await mock.advance(299);
    assert.equal(((await getJson(mock, "explorer", `/api/v2/addresses/${account}`)).body as { is_contract: boolean }).is_contract, false);
    await mock.advance(2);
    assert.equal(((await getJson(mock, "explorer", `/api/v2/addresses/${account}`)).body as { is_contract: boolean }).is_contract, true);
    const code = await getJson(mock, "explorer", `/api/v2/smart-contracts/${account}`);
    assert.equal(code.status, 200);
    const body = code.body as { deployed_bytecode: string; is_verified: boolean };
    assert.equal((body.deployed_bytecode.length - 2) / 2, 61, "the Kernel proxy runtime is 61 bytes");
    assert.equal(body.is_verified, false);
  });

  harness.it("an address that never fills stays 404 however long it waits, and an empty address is never a contract", async (mock) => {
    const { account } = await deployOwner(mock, 2);
    mock.explorer.neverFill.add(account.toLowerCase());
    await getJson(mock, "explorer", `/api/v2/smart-contracts/${account}`);
    await mock.advance(100_000);
    assert.equal((await getJson(mock, "explorer", `/api/v2/smart-contracts/${account}`)).status, 404);
    assert.equal(((await getJson(mock, "explorer", `/api/v2/addresses/${account}`)).body as { is_contract: boolean }).is_contract, false);
    const empty = deriveAccount(mock.chains.xo?.owner(6).address ?? account);
    await getJson(mock, "explorer", `/api/v2/addresses/${empty}`);
    await mock.advance(100_000);
    assert.equal(((await getJson(mock, "explorer", `/api/v2/addresses/${empty}`)).body as { is_contract: boolean }).is_contract, false);
    assert.equal((await getJson(mock, "explorer", `/api/v2/smart-contracts/${empty}`)).status, 404);
  });

  harness.it("with no delay the fields are filled at once, and a pinned contract reports its real bytecode", async (mock) => {
    mock.explorer.fillDelaySeconds = 0;
    const response = await getJson(mock, "explorer", `/api/v2/smart-contracts/${KERNEL_FACTORY}`);
    assert.equal(response.status, 200);
    assert.equal(((response.body as { deployed_bytecode: string }).deployed_bytecode.length - 2) / 2, 989);
    assert.equal(((await getJson(mock, "explorer", `/api/v2/addresses/${KERNEL_FACTORY}`)).body as { is_contract: boolean }).is_contract, true);
  });

  harness.it("refuses a malformed address on the v2 routes with 422", async (mock) => {
    assert.equal((await getJson(mock, "explorer", "/api/v2/addresses/0x12")).status, 422);
    assert.equal((await getJson(mock, "explorer", "/api/v2/smart-contracts/nonsense")).status, 422);
    assert.equal((await getJson(mock, "explorer", "/api/v2/addresses/0x12/transactions")).status, 422);
    assert.equal((await getJson(mock, "explorer", "/api/v2/unknown")).status, 404);
  });

  harness.it("lists pending transactions first with null block_number and null status, then confirmed ones", async (mock) => {
    await deployOwner(mock, 2);
    const pendingHash = keccak256(toHex("pending-bundle"));
    mock.explorer.pendingTransactions.push({ hash: pendingHash, from: mock.chains.xo?.bundler.address ?? ENTRY_POINT_V07, to: ENTRY_POINT_V07 });
    const feed = (await getJson(mock, "explorer", `/api/v2/addresses/${ENTRY_POINT_V07}/transactions?filter=to`)).body as {
      items: { hash: string; block_number: number | null; status: string | null; from: { hash: string }; to: { hash: string } | null }[];
      next_page_params: unknown;
    };
    assert.equal(feed.next_page_params, null);
    assert.equal(feed.items[0]?.hash, pendingHash);
    assert.equal(feed.items[0]?.block_number, null);
    assert.equal(feed.items[0]?.status, null);
    const confirmed = feed.items.filter((item) => item.block_number !== null);
    assert.ok(confirmed.length >= 1);
    assert.ok(confirmed.every((item) => item.status === "ok" && item.to?.hash.toLowerCase() === ENTRY_POINT_V07.toLowerCase()));
    // A client that reads this feed must drop the rows with no block number.
    assert.equal(feed.items.filter((item) => item.block_number === null).length, 1);
    const fromFilter = (await getJson(mock, "explorer", `/api/v2/addresses/${ENTRY_POINT_V07}/transactions?filter=from`)).body as { items: unknown[] };
    assert.equal(fromFilter.items.length, 0, "the EntryPoint sent nothing");
    assert.equal((await getJson(mock, "explorer", `/api/v2/addresses/${ENTRY_POINT_V07}/transactions?filter=sideways`)).status, 422);
  });

  harness.it("serves the chain's logs on a fresh mock after a revert: each test starts from the same chain", async (mock) => {
    const answer = await logs(mock, `fromBlock=0&toBlock=latest&address=${ENTRY_POINT_V07}&topic0=${ACCOUNT_DEPLOYED_TOPIC}`);
    assert.equal(answer.status, "0", "no account is deployed at the start of a test");
  });

  harness.it("syncs the chain to the mock clock when the clock moves", async (mock) => {
    const chain = mock.chains.xo;
    assert.ok(chain !== undefined);
    await mock.advance(3_600);
    assert.ok((await chain.blockTimestamp()) >= mock.clock.nowSeconds());
    const { account } = await deployOwner(mock, 2);
    const row = (await logs(mock, `fromBlock=0&toBlock=latest&address=${ENTRY_POINT_V07}&topic0=${ACCOUNT_DEPLOYED_TOPIC}&topic2=${padAddressTopic(account as Address)}&topic0_2_opr=and`)).result?.[0];
    assert.ok(row !== undefined);
    assert.ok(BigInt(row.timeStamp ?? "0x0") >= BigInt(mock.clock.nowSeconds()));
  });
});
