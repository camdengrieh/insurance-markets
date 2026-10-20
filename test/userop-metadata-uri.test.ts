import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { encodeFunctionData } from "viem";

import { MARKET_MANAGER_ABI } from "../src/xo/chain/abi.js";
import { USDC_E_ADDRESS } from "../src/xo/chain/constants.js";
import { createMarketCalls, decodeAllowedCall } from "../src/xo/userop/calls.js";
import { UserOpError } from "../src/xo/userop/encode.js";

// SC-5: the metadata URI of a market creation is shown on the signature card cut to about 100 characters, so the
// part of it that decides where the content is fetched from (the host) must always be inside what is shown, and
// nothing in front of the host may disguise it.

const OK = { startsAt: 10n, expiresAt: 20n };
const refused = (uri: string): void =>
  assert.throws(() => createMarketCalls({ ...OK, metadataUri: uri }), (error: unknown) => error instanceof UserOpError && error.code === "invalid_input", uri.slice(0, 80));

describe("the metadata URI (SC-5)", () => {
  it("refuses a URI with credentials in front of the host, however the host is hidden behind them", () => {
    refused("https://market.example.org:" + "a".repeat(110) + "@evil.example/meta.json");
    refused("https://user@evil.example/meta.json");
    refused("https://user:pass@evil.example/meta.json");
    refused("https://market.example.org@evil.example/meta.json");
  });

  it("refuses a backslash, which URL parsers read as a slash and so can move the host", () => {
    refused("https://market.example.org\\@evil.example/meta.json");
    refused("https://example.org/a\\b.json");
  });

  it("refuses an authority longer than what the card shows, and an empty one", () => {
    refused(`https://${"a".repeat(97)}.example/meta.json`);
    refused("https:///meta.json");
    refused("https://?x=1");
    refused("https://#frag");
  });

  it("accepts a long path or query after a short host, a port, and a host at the limit", () => {
    for (const uri of [
      `https://market.example.org/${"p".repeat(1800)}.json`,
      "https://market.example.org:8443/meta.json",
      "https://market.example.org/meta.json?a=b@c",
      `https://${"a".repeat(80)}.example/meta.json`,
    ]) {
      assert.doesNotThrow(() => createMarketCalls({ ...OK, metadataUri: uri }), uri.slice(0, 80));
    }
  });

  it("a call read back from chain bytes is refused when its URI hides the host, like one being built", () => {
    const [, create] = createMarketCalls({ ...OK, metadataUri: "https://market.example.org/meta.json" });
    assert.ok(create !== undefined);
    assert.doesNotThrow(() => decodeAllowedCall(create));
    const hostile = {
      ...create,
      data: encodeFunctionData({
        abi: MARKET_MANAGER_ABI,
        functionName: "createConvictionMarket",
        args: [10, 20, USDC_E_ADDRESS, "https://market.example.org:" + "a".repeat(110) + "@evil.example/meta.json"],
      }),
    };
    assert.throws(() => decodeAllowedCall(hostile), (error: unknown) => error instanceof UserOpError);
  });
});
