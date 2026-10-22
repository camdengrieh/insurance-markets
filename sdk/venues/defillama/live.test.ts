import { describe, expect, it } from "vitest";

import type { AdapterDeps, FetchLike } from "../../model.js";
import { createDefiLlamaClient } from "./client.js";
import { DEFILLAMA_MAX_BODY_CHARS } from "./constants.js";

// Live drift suite: OPT-IN. It sends one real GET to api.llama.fi and runs only with APP_LIVE=1, so a normal
// `pnpm test` stays offline. GET only, no key, no custom Origin, the fixed research User-Agent and nothing else that
// identifies a person. It is where the one unchecked fact is settled: the live /overview/dexs envelope, whether its rows
// carry a `category`, and how big the answer is against the Cockpit proxy's 8 MiB cap. It was written and NOT run by the
// stream that built it.

const LIVE = process.env.APP_LIVE === "1";
const USER_AGENT = "insurance-markets-research/0.1";
let bodyChars = 0;

const liveFetch: FetchLike = async (input, init) => {
  const response = await fetch(input, {
    method: "GET",
    headers: { "user-agent": USER_AGENT, accept: "application/json", ...(init?.headers ?? {}) },
    ...(init?.signal === undefined ? {} : { signal: init.signal }),
  });
  const text = await response.text();
  bodyChars = text.length;
  return { ok: response.ok, status: response.status, headers: { get: (name) => response.headers.get(name) }, json: async () => JSON.parse(text) as unknown, text: async () => text };
};
const deps: AdapterDeps = { fetch: liveFetch, nowMs: () => Date.now() };

describe.skipIf(!LIVE)("defillama live drift (APP_LIVE=1)", () => {
  it("returns prediction-market rows within the body cap, with exact decimals and the venues the app joins to", async () => {
    const report = await createDefiLlamaClient(deps).predictionVolumes({ deadlineMs: 60_000 });
    expect(bodyChars).toBeLessThan(DEFILLAMA_MAX_BODY_CHARS);
    expect(report.rows.length).toBeGreaterThan(5);
    expect(report.rejected / Math.max(report.rows.length, 1)).toBeLessThan(0.1);
    for (const row of report.rows) {
      for (const figure of [row.volume24h, row.volume7d, row.volume30d]) if (figure !== null) expect(figure).toMatch(/^(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/);
    }
    expect(report.rows.some((row) => row.venue === "xo")).toBe(true);
  }, 120_000);
});
