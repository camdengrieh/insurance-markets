// Test harness for the pm_* tools: an in-memory MCP server driven over a linked transport, an audit
// recorder, a fake-adapter world and an Ajv 2020-12 strict compiler. Not a test file. Nothing here
// touches a network; every market is synthetic.

import { InMemoryTransport, McpServer } from "@modelcontextprotocol/server";
import { Ajv2020 } from "ajv/dist/2020.js";
import type { AuditEvent } from "../../../src/guardrails/audit.js";
import { loadShippedBundle } from "../../links/shipped.js";
import { registerPmToolsWith } from "../../tools/index.js";
import type { PmAdapters, PmToolDeps } from "../../tools/common.js";
import type { Market, VenueId, VenueReadAdapter } from "../../types.js";
import {
  FakeAdapter,
  NOW_MS,
  polyRecord,
  xoRecord,
  type World,
} from "../ops/quote-fixtures.js";

export { NOW_MS };
export type Obj = Record<string, unknown>;

export interface CallResult {
  readonly isError: boolean;
  readonly text: string;
  readonly structured: Obj | undefined;
}

export interface Harness {
  call(name: string, args: Obj): Promise<CallResult>;
  list(): Promise<Obj[]>;
  close(): Promise<void>;
}

const closers: Array<() => Promise<void>> = [];
export async function closeAll(): Promise<void> {
  while (closers.length > 0) await closers.pop()?.();
}

export async function connect(register: (server: McpServer) => void): Promise<Harness> {
  const server = new McpServer({ name: "pm-test", version: "0.0.0" }, { supportedProtocolVersions: ["2026-07-28"] });
  register(server);
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  await server.connect(serverSide);
  const pending = new Map<number, (message: Obj) => void>();
  clientSide.onmessage = (message) => {
    const id = (message as { id?: number }).id;
    if (id !== undefined) pending.get(id)?.(message as unknown as Obj);
  };
  await clientSide.start();
  let nextId = 1;
  const rpc = (method: string, params: Obj): Promise<Obj> => {
    const id = nextId++;
    return new Promise((resolve) => {
      pending.set(id, resolve);
      void clientSide.send({
        jsonrpc: "2.0",
        id,
        method,
        params: {
          ...params,
          _meta: {
            "io.modelcontextprotocol/protocolVersion": "2026-07-28",
            "io.modelcontextprotocol/clientInfo": { name: "pm-tools-test", version: "0" },
            "io.modelcontextprotocol/clientCapabilities": {},
          },
        },
      } as never);
    });
  };
  const close = async (): Promise<void> => {
    await clientSide.close();
    await server.close();
  };
  closers.push(close);
  return {
    async call(name, args) {
      const response = await rpc("tools/call", { name, arguments: args });
      const result = response["result"] as Obj | undefined;
      if (result === undefined) return { isError: true, text: JSON.stringify(response["error"] ?? response), structured: undefined };
      const content = (result["content"] as Array<{ type: string; text: string }> | undefined) ?? [];
      return {
        isError: result["isError"] === true,
        text: content.map((item) => item.text).join("\n"),
        structured: result["structuredContent"] as Obj | undefined,
      };
    },
    async list() {
      const response = await rpc("tools/list", {});
      return (response["result"] as Obj)["tools"] as Obj[];
    },
    close,
  };
}

// ---- deps ----

export interface AuditRecorder {
  readonly events: AuditEvent[];
  write(event: AuditEvent): void;
}
export function auditRecorder(): AuditRecorder {
  const events: AuditEvent[] = [];
  return { events, write: (e) => void events.push(e) };
}

export const KALSHI_OFF = { status: "off", clauseSha256: null } as const;

export function adaptersOf(map: Partial<Record<VenueId, VenueReadAdapter>>, kalshi: PmAdapters["kalshi"] = KALSHI_OFF): PmAdapters {
  return { lookup: (venue) => map[venue], kalshi };
}

export function makeDeps(over: Partial<PmToolDeps> & { audit?: AuditRecorder } = {}): PmToolDeps & { audit: AuditRecorder } {
  const audit = over.audit ?? auditRecorder();
  return {
    now: () => NOW_MS,
    env: () => ({}),
    adapters: () => adaptersOf({}),
    dataset: loadShippedBundle,
    gates: () => undefined,
    budgetMs: 3_000,
    callTimeoutMs: 800,
    ...over,
    audit,
  };
}

export async function connectDeps(deps: PmToolDeps): Promise<Harness> {
  return connect((server) => registerPmToolsWith(server, deps));
}

// ---- a fake world whose markets carry the rule fields the link hashes need ----

class RuleFieldAdapter implements VenueReadAdapter {
  readonly id: VenueId;
  readonly caps;
  constructor(
    private readonly inner: FakeAdapter,
    private readonly record: (marketId: string) => Record<string, unknown>,
  ) {
    this.id = inner.id;
    this.caps = inner.caps;
  }
  listMarkets: VenueReadAdapter["listMarkets"] = () => this.inner.listMarkets();
  async getMarket(ref: { marketId: string }): Promise<Market> {
    const market = await this.inner.getMarket(ref);
    return Object.assign({}, market, {
      extras: { ruleFields: this.record(ref.marketId), rulesHashRecipe: "rules-v2", warnings: [], geoRestricted: null },
    }) as Market;
  }
  getBooks: VenueReadAdapter["getBooks"] = (tokens) => this.inner.getBooks(tokens);
  getFeeSpec: VenueReadAdapter["getFeeSpec"] = (m) => this.inner.getFeeSpec(m);
  health: VenueReadAdapter["health"] = () => this.inner.health();
}

export function worldAdapters(w: World, rules: { xo?: Record<string, unknown>; poly?: Record<string, unknown> } = {}): PmAdapters {
  return adaptersOf({
    xo: new RuleFieldAdapter(w.xoAdapter, () => rules.xo ?? xoRecord()),
    polymarket: new RuleFieldAdapter(w.polyAdapter, () => rules.poly ?? polyRecord()),
  });
}

// ---- schema checks ----

export function strictAjv(): Ajv2020 {
  return new Ajv2020({ strict: true, validateFormats: false, logger: false });
}

// Every object in `value` whose JSON text contains `needle` in a string leaf must be an untrusted slot.
export function leafParents(value: unknown, needle: string, parent: unknown = null, out: Array<{ parent: unknown; key: string }> = [], key = ""): Array<{ parent: unknown; key: string }> {
  if (typeof value === "string") {
    if (value.includes(needle)) out.push({ parent, key });
  } else if (Array.isArray(value)) {
    value.forEach((v, i) => leafParents(v, needle, value, out, String(i)));
  } else if (value !== null && typeof value === "object") {
    for (const [k, v] of Object.entries(value as Obj)) leafParents(v, needle, value, out, k);
  }
  return out;
}
