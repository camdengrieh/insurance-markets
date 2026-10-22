import { XoHttp as SdkXoHttp, type FetchLike, type HttpOptions as SdkHttpOptions } from "../../sdk/venues/xo/api/http.js";

// The XO transport lives in the SDK (sdk/venues/xo/api/http.ts), where the fetch and the clock are injected.
// This is the plugin's (Node) host for it: the same options with Node's defaults filled in, so every tool and test
// keeps its import path and its behaviour.
//   fetchImpl  the global fetch, looked up at call time (tests stub the global after building a client)
//   now        performance.now
//   sleep      a timer
//   wallNowMs  Date.now, for an HTTP-date Retry-After

export * from "../../sdk/venues/xo/api/http.js";

export interface HttpOptions extends Omit<SdkHttpOptions, "fetchImpl" | "now"> {
  // Defaults to globalThis.fetch looked up at call time, so tests can stub the global.
  readonly fetchImpl?: FetchLike;
  readonly now?: () => number;
}

const globalFetch: FetchLike = (input, init) => globalThis.fetch(input, init);
const monotonicNow = (): number => performance.now();
const timerSleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

export function withNodeDefaults(options: HttpOptions = {}): SdkHttpOptions {
  return {
    ...options,
    fetchImpl: options.fetchImpl ?? globalFetch,
    now: options.now ?? monotonicNow,
    sleep: options.sleep ?? timerSleep,
    wallNowMs: options.wallNowMs ?? (() => Date.now()),
  };
}

export class XoHttp extends SdkXoHttp {
  constructor(options: HttpOptions = {}) {
    super(withNodeDefaults(options));
  }
}
