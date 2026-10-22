import type { RpcHttpResponse, RpcPost } from "../rpc.js";

// A recording transport and its replay, for the chain recordings. A recording keeps each JSON-RPC request's method
// and params with the answer the node gave (its `result` or `error`), batches split into their items. The replay
// answers a request (single or batch) from those, in the request's own ids; a request that was never recorded is an
// error, so a test notices when a reader starts sending something else.

export interface RecordedExchange {
  readonly method: string;
  readonly params: unknown;
  readonly response: { readonly result?: unknown; readonly error?: unknown };
}

export interface Recording {
  readonly source: string;
  readonly rpc: string;
  readonly captured_at: string;
  readonly inputs: { readonly block: string; readonly fillBlocks: string };
  readonly exchanges: readonly RecordedExchange[];
}

interface Item {
  readonly id?: unknown;
  readonly method?: unknown;
  readonly params?: unknown;
}

const keyOf = (method: unknown, params: unknown): string => JSON.stringify([method, params]);

export function recordingPost(inner: RpcPost, sink: RecordedExchange[]): RpcPost {
  return async (url, body, options) => {
    const response = await inner(url, body, options);
    if (response.status !== 200) throw new Error(`HTTP ${String(response.status)} while recording: stop`);
    const requests = (Array.isArray(body) ? body : [body]) as Item[];
    const answers = (Array.isArray(response.body) ? response.body : [response.body]) as Array<Record<string, unknown>>;
    for (const request of requests) {
      const answer = answers.find((entry) => entry !== null && typeof entry === "object" && entry["id"] === request.id);
      if (answer === undefined) throw new Error("an answer is missing while recording: stop");
      sink.push({ method: String(request.method), params: request.params, response: "error" in answer ? { error: answer["error"] } : { result: answer["result"] } });
    }
    return response;
  };
}

export function replayPost(exchanges: readonly RecordedExchange[]): RpcPost & { readonly sent: string[] } {
  const table = new Map<string, RecordedExchange["response"]>();
  for (const exchange of exchanges) table.set(keyOf(exchange.method, exchange.params), exchange.response);
  const sent: string[] = [];
  const answer = (item: Item): Record<string, unknown> => {
    sent.push(String(item.method));
    const recorded = table.get(keyOf(item.method, item.params));
    if (recorded === undefined) throw new Error(`not recorded: ${String(item.method)} ${JSON.stringify(item.params).slice(0, 200)}`);
    return { jsonrpc: "2.0", id: item.id, ...recorded };
  };
  const post = async (_url: string, body: unknown): Promise<RpcHttpResponse> => {
    if (Array.isArray(body)) return { status: 200, body: (body as Item[]).map(answer) };
    return { status: 200, body: answer(body as Item) };
  };
  return Object.assign(post, { sent });
}
