// A preload that makes any test connection to a non-loopback host fail, so the unit suite stays offline.
//
// Why: a unit test once booted the production relay with the real global fetch and so sent real HTTPS requests to
// XO's explorer, RPC and order book from every run (TM-01). The test still passed because it only asserted that a
// refusal reason was a different one. The guard turns that kind of leak into a loud failure.
//
// It works at two levels: globalThis.fetch refuses a non-loopback URL at once with a clear message, and
// net.Socket.prototype.connect refuses a non-loopback TCP connection (http, https and tls all end up there). Unix
// sockets and 127.0.0.0/8, ::1 and localhost are allowed (the mock XO, anvil and the local relay bind there). Every
// blocked attempt is recorded on globalThis.__netGuardBlocked.
//
// Use:  tsx --test --import ./test/net-guard.mjs "test/**/*.test.ts"   (scripts/unit.mjs does this).
// Opt out only for the opt-in live suites: XO_LIVE=1 (or APP_LIVE=1) leaves the guard off.

import net from "node:net";

const blocked = (globalThis.__netGuardBlocked ??= []);

export function isLoopbackHost(host) {
  if (typeof host !== "string" || host === "") return true; // net's own default is localhost
  const bare = host.startsWith("[") && host.endsWith("]") ? host.slice(1, -1) : host;
  const lower = bare.toLowerCase();
  return lower === "localhost" || lower.endsWith(".localhost") || lower === "::1" || /^127(\.\d{1,3}){3}$/.test(lower) || lower === "::ffff:127.0.0.1";
}

function install() {
  if (process.env.XO_LIVE === "1" || process.env.APP_LIVE === "1") return;
  if (globalThis.__netGuardInstalled === true) return;
  globalThis.__netGuardInstalled = true;

  const realFetch = globalThis.fetch;
  globalThis.fetch = function guardedFetch(input, init) {
    let host = "";
    try {
      const url = typeof input === "string" || input instanceof URL ? new URL(String(input)) : new URL(input.url);
      host = url.hostname;
    } catch {
      return realFetch.call(this, input, init);
    }
    if (!isLoopbackHost(host)) {
      blocked.push(`fetch ${host}`);
      return Promise.reject(new TypeError(`net-guard: a test tried to reach ${host}; unit tests are offline`));
    }
    return realFetch.call(this, input, init);
  };

  const realConnect = net.Socket.prototype.connect;
  net.Socket.prototype.connect = function guardedConnect(...args) {
    // net.connect hands over a normalized [options, callback] array; a direct call passes (port, host) or (path).
    const first = Array.isArray(args[0]) ? args[0][0] : args[0];
    let host;
    let ipc = false;
    if (typeof first === "object" && first !== null) {
      if (typeof first.path === "string") ipc = true;
      else host = first.host;
    } else if (typeof first === "number") {
      host = typeof args[1] === "string" ? args[1] : undefined;
    } else if (typeof first === "string") {
      ipc = true;
    }
    if (!ipc && !isLoopbackHost(host)) {
      blocked.push(`connect ${String(host)}`);
      const error = new Error(`net-guard: a test tried to connect to ${String(host)}; unit tests are offline`);
      process.nextTick(() => this.destroy(error));
      return this;
    }
    return realConnect.apply(this, args);
  };
}

install();
