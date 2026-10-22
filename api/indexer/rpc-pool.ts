import { createPinGuard, type PinGuard } from "../../sdk/chain/pins.js";
import { RpcError, type RpcPort } from "../../sdk/chain/rpc.js";

// Several RPC endpoints for one chain, tried in the configured order (docs/sdk-and-api-design.md section 7: "Each chain gets
// several RPC providers"). An endpoint that fails is set aside for a cool-down and the next one is asked; nothing is sent
// twice to the same endpoint in one call, and a key refusal latches the endpoint's port for good (sdk/chain/rpc.ts). Each
// endpoint is checked once to serve the expected chain id before it is used, and has its own pin guard.

export const MIN_COOLDOWN_MS = 30_000;
export const MAX_COOLDOWN_MS = 10 * 60_000;
export const KEY_COOLDOWN_MS = 60 * 60_000;

export interface EndpointStatus {
  // The host only: a provider key in the path is never shown.
  readonly host: string;
  readonly up: boolean;
  readonly downUntilMs: number | null;
  // A closed code (an RpcErrorCode, or "wrong_chain"), never an upstream message.
  readonly lastError: string | null;
}

interface Endpoint {
  readonly port: RpcPort;
  readonly host: string;
  readonly guard: PinGuard;
  chainChecked: boolean;
  wrongChain: boolean;
  failures: number;
  downUntilMs: number;
  lastError: string | null;
}

export interface RunOptions {
  // For a log range: a refusal of its size (too_large, upstream_error) is the caller's to handle by asking for less,
  // and is thrown without setting the endpoint aside.
  readonly rangeSensitive?: boolean;
}

// The errors that say something about the endpoint (move on) rather than about the request.
const ENDPOINT_FAILURES: ReadonlySet<string> = new Set(["rate_limited", "timeout", "unreachable", "http_status", "requires_key", "invalid_response", "upstream_error", "too_large"]);

export class RpcPool {
  readonly chainId: number;
  readonly #endpoints: Endpoint[];
  readonly #nowMs: () => number;

  constructor(chainId: number, ports: readonly RpcPort[], nowMs: () => number) {
    if (ports.length === 0) throw new Error("an RPC pool needs at least one endpoint");
    this.chainId = chainId;
    this.#nowMs = nowMs;
    this.#endpoints = ports.map((port) => ({ port, host: new URL(port.url).host, guard: createPinGuard(port), chainChecked: false, wrongChain: false, failures: 0, downUntilMs: 0, lastError: null }));
  }

  status(): EndpointStatus[] {
    const now = this.#nowMs();
    return this.#endpoints.map((e) => ({ host: e.host, up: !e.wrongChain && e.downUntilMs <= now, downUntilMs: e.wrongChain ? null : e.downUntilMs > now ? e.downUntilMs : null, lastError: e.lastError }));
  }

  #setAside(endpoint: Endpoint, error: RpcError): void {
    endpoint.failures += 1;
    endpoint.lastError = error.code;
    const backoff = Math.min(MAX_COOLDOWN_MS, MIN_COOLDOWN_MS * 2 ** Math.min(endpoint.failures - 1, 5));
    const wait = error.code === "requires_key" ? KEY_COOLDOWN_MS : Math.max(backoff, Math.min(error.retryAfterMs ?? 0, MAX_COOLDOWN_MS));
    endpoint.downUntilMs = this.#nowMs() + wait;
  }

  // Runs `fn` on the first endpoint that is up, moving on when an endpoint fails. Throws the last failure when none is left.
  async run<T>(fn: (port: RpcPort, guard: PinGuard) => Promise<T>, options: RunOptions = {}): Promise<T> {
    let last: unknown = new RpcError("unreachable", "no_endpoint_up");
    for (const endpoint of this.#endpoints) {
      if (endpoint.wrongChain || endpoint.downUntilMs > this.#nowMs()) continue;
      try {
        if (!endpoint.chainChecked) {
          const id = await endpoint.port.chainId();
          if (id !== this.chainId) {
            endpoint.wrongChain = true;
            endpoint.lastError = "wrong_chain";
            last = new RpcError("invalid_response", "wrong_chain");
            continue;
          }
          endpoint.chainChecked = true;
        }
        const out = await fn(endpoint.port, endpoint.guard);
        endpoint.failures = 0;
        endpoint.lastError = null;
        return out;
      } catch (error) {
        if (!(error instanceof RpcError)) throw error;
        if (options.rangeSensitive === true && (error.code === "too_large" || (error.code === "upstream_error" && error.detail === "logs_range_refused"))) throw error;
        if (!ENDPOINT_FAILURES.has(error.code)) throw error;
        this.#setAside(endpoint, error);
        last = error;
      }
    }
    throw last;
  }
}
