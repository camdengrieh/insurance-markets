import assert from "node:assert/strict";
import { test } from "node:test";

import { API_LIMITS, DEFAULT_CONFIRMATIONS, DEFAULT_RPC, describeConfig, loadApiConfig, parseOrigin } from "../../api/config.js";

// Configuration from the environment, as relay/config.ts does it: every value validated, no issue ever printing a value,
// a working default for everything but the data directory, and no variable that can widen what is served or raise a limit.

test("only the data directory is required; every other default works with no secret", () => {
  const missing = loadApiConfig({});
  assert.deepEqual(missing.fatal.map((i) => i.variable), ["API_DATA_DIR"]);
  const loaded = loadApiConfig({ API_DATA_DIR: "/data" });
  assert.deepEqual(loaded.fatal, []);
  const c = loaded.config;
  assert.equal(c.host, "127.0.0.1");
  assert.equal(c.port, 8790);
  assert.equal(c.indexer, true);
  assert.deepEqual(c.chains.map((x) => [x.chain, x.rpcUrls, x.confirmations, x.startBlock]), [
    ["polygon", DEFAULT_RPC.polygon, DEFAULT_CONFIRMATIONS.polygon, null],
    ["base", DEFAULT_RPC.base, DEFAULT_CONFIRMATIONS.base, null],
    ["xo", DEFAULT_RPC.xo, DEFAULT_CONFIRMATIONS.xo, null],
  ]);
  assert.equal(c.limits, API_LIMITS);
  assert.deepEqual(c.corsOrigins, []);
});

test("RPC URLs are checked, listed in order, and never printed", () => {
  const secretPath = "https://rpc.example.org/v2/abcdef0123456789";
  const loaded = loadApiConfig({ API_DATA_DIR: "/data", API_RPC_POLYGON: `${secretPath}, https://polygon.example.net/` , API_CHAINS: "polygon" });
  assert.deepEqual(loaded.fatal, []);
  assert.deepEqual(loaded.config.chains[0]?.rpcUrls, [secretPath, "https://polygon.example.net/"]);
  assert.equal(describeConfig(loaded.config).join("\n").includes("abcdef0123456789"), false);
  for (const bad of ["http://rpc.example.org/", "https://user:pw@rpc.example.org/", "https://rpc.example.org/?key=abcdef", "not a url", "a,b,c,d,e"]) {
    const refused = loadApiConfig({ API_DATA_DIR: "/data", API_RPC_BASE: bad });
    assert.deepEqual(refused.fatal.map((i) => i.variable), ["API_RPC_BASE"], bad);
    for (const issue of refused.issues) assert.equal(issue.message.includes(bad), false);
  }
});

test("bad values are named, never echoed, and the fatal ones stop the start", () => {
  const loaded = loadApiConfig({
    API_DATA_DIR: "/data",
    API_PORT: "70000",
    API_HOST: "example.org",
    API_CHAINS: "polygon,solana",
    API_TRUST_PROXY_HOPS: "9",
    API_START_BLOCK_XO: "-1",
    API_CONFIRMATIONS_BASE: "1",
    API_FILL_RETENTION_DAYS: "1000",
    API_INDEXER: "maybe",
    API_LINKS_BUNDLE: "/data/links.bundle.json",
  });
  assert.deepEqual(loaded.fatal.map((i) => i.variable).sort(), ["API_CHAINS", "API_HOST", "API_PORT", "API_START_BLOCK_XO", "API_TRUST_PROXY_HOPS"].sort());
  const notes = loaded.issues.filter((i) => !i.fatal).map((i) => i.variable).sort();
  assert.deepEqual(notes, ["API_CONFIRMATIONS_BASE", "API_FILL_RETENTION_DAYS", "API_INDEXER", "API_LINKS_PIN"].sort());
  for (const issue of loaded.issues) assert.equal(/70000|example\.org|solana|1000|maybe/.test(issue.message), false, issue.message);
});

test("CORS origins are exact https origins, or a local dApp on loopback", () => {
  assert.equal(parseOrigin("https://app.example.org"), "https://app.example.org");
  assert.equal(parseOrigin("http://localhost:5173"), "http://localhost:5173");
  for (const bad of ["http://app.example.org", "https://app.example.org/path", "https://*.example.org", "https://1.2.3.4", "null", "https://app.example.org?x=1"]) assert.equal(parseOrigin(bad), null, bad);
  const loaded = loadApiConfig({ API_DATA_DIR: "/data", API_CORS_ORIGINS: "https://app.example.org, http://app.example.org" });
  assert.deepEqual(loaded.config.corsOrigins, ["https://app.example.org"]);
  assert.equal(loaded.issues[0]?.variable, "API_CORS_ORIGINS");
});
