import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { checkFetchSite, checkHost, checkOrigin, duplicatedHeader, expectedHost, expectedOrigin, isJsonContentType, isUserNavigation, parseTarget } from "../../origin.js";

describe("host pinning", () => {
  const port = 41873;
  it("accepts only the exact loopback host and port", () => {
    assert.equal(checkHost(`127.0.0.1:${port}`, port), true);
    for (const bad of [
      undefined,
      "",
      "evil.example",
      `evil.example:${port}`,
      `localhost:${port}`,
      `127.0.0.1:${port + 1}`,
      "127.0.0.1",
      `127.0.0.1.:${port}`,
      `127.0.0.1:${port}.`,
      ` 127.0.0.1:${port}`,
      `127.0.0.1:${port}, evil.example`,
      `[::1]:${port}`,
      `0.0.0.0:${port}`,
      `127.0.0.1:${port}@evil.example`,
      `evil.example@127.0.0.1:${port}`,
    ]) {
      assert.equal(checkHost(bad, port), false, `rejects ${String(bad)}`);
    }
  });
  it("builds the expected host and origin from the port", () => {
    assert.equal(expectedHost(port), "127.0.0.1:41873");
    assert.equal(expectedOrigin(port), "http://127.0.0.1:41873");
  });
});

describe("origin pinning", () => {
  const port = 41873;
  it("treats a missing Origin as absent and the daemon's own origin as ok", () => {
    assert.equal(checkOrigin(undefined, port), "absent");
    assert.equal(checkOrigin(`http://127.0.0.1:${port}`, port), "ok");
  });
  it("rejects every other origin, including null and look-alikes", () => {
    for (const bad of [
      "null",
      "",
      "https://app.paybox.sh",
      "https://example.org",
      `http://localhost:${port}`,
      `http://127.0.0.1:${port + 1}`,
      `https://127.0.0.1:${port}`,
      `http://127.0.0.1:${port}/`,
      `http://127.0.0.1:${port}.evil.example`,
      `HTTP://127.0.0.1:${port}`,
      `http://127.0.0.1:${port} http://evil.example`,
    ]) {
      assert.equal(checkOrigin(bad, port), "bad", `rejects ${bad}`);
    }
  });
});

describe("fetch metadata", () => {
  it("passes same-origin, none and absent; refuses cross-site and same-site", () => {
    assert.equal(checkFetchSite(undefined), true);
    assert.equal(checkFetchSite("same-origin"), true);
    assert.equal(checkFetchSite("none"), true);
    assert.equal(checkFetchSite("cross-site"), false);
    assert.equal(checkFetchSite("same-site"), false);
    assert.equal(checkFetchSite(""), false);
  });
  it("calls only a typed or bookmarked page load a user navigation", () => {
    assert.equal(isUserNavigation({ "sec-fetch-site": "none", "sec-fetch-mode": "navigate", "sec-fetch-dest": "document" }), true);
    assert.equal(isUserNavigation({ "sec-fetch-site": "same-origin", "sec-fetch-mode": "navigate", "sec-fetch-dest": "document" }), true);
    assert.equal(isUserNavigation({ "sec-fetch-site": "cross-site", "sec-fetch-mode": "navigate", "sec-fetch-dest": "document" }), false);
    assert.equal(isUserNavigation({ "sec-fetch-site": "none", "sec-fetch-mode": "no-cors", "sec-fetch-dest": "empty" }), false);
    assert.equal(isUserNavigation({}), false);
  });
});

describe("request target", () => {
  it("accepts plain origin-form targets and splits the query", () => {
    assert.deepEqual(parseTarget("/"), { path: "/", query: "" });
    assert.deepEqual(parseTarget("/ui/status"), { path: "/ui/status", query: "" });
    assert.deepEqual(parseTarget("/ui/read/xo_data/api/markets?limit=5&q=a%20b"), { path: "/ui/read/xo_data/api/markets", query: "limit=5&q=a%20b" });
    assert.deepEqual(parseTarget("/assets/index-3f9a.js"), { path: "/assets/index-3f9a.js", query: "" });
  });
  it("refuses absolute-form, authority tricks, dot segments and encoded separators", () => {
    for (const bad of [
      "",
      "*",
      "http://evil.example/",
      "//evil.example/x",
      "ui/status",
      "/a/../b",
      "/a/./b",
      "/a/%2e%2e/b",
      "/a/%2E%2e/b",
      "/a%2fb",
      "/a%2Fb",
      "/a%5cb",
      "/a\\b",
      "/a%00b",
      "/a#frag",
      "/a b",
      "/a\tb",
      "/café",
      `/${"a".repeat(5000)}`,
    ]) {
      assert.equal(parseTarget(bad), undefined, `refuses ${JSON.stringify(bad).slice(0, 40)}`);
    }
  });
});

describe("duplicated headers", () => {
  it("finds a repeated single-value header in any letter case", () => {
    assert.equal(duplicatedHeader(["Host", "a", "Accept", "b"]), undefined);
    assert.equal(duplicatedHeader(["Host", "a", "host", "b"]), "host");
    assert.equal(duplicatedHeader(["Authorization", "x", "AUTHORIZATION", "y"]), "authorization");
    assert.equal(duplicatedHeader(["Content-Type", "x", "Content-type", "y"]), "content-type");
    assert.equal(duplicatedHeader(["Accept", "a", "Accept", "b"]), undefined);
  });
});

describe("content type", () => {
  it("accepts application/json with an optional utf-8 charset only", () => {
    assert.equal(isJsonContentType("application/json"), true);
    assert.equal(isJsonContentType("Application/JSON; charset=UTF-8"), true);
    assert.equal(isJsonContentType("application/json;charset=utf-8"), true);
    for (const bad of [undefined, "", "text/plain", "application/x-www-form-urlencoded", "application/json; charset=latin1", "application/jsonp", "application/json; boundary=x", "multipart/form-data"]) {
      assert.equal(isJsonContentType(bad), false, `rejects ${String(bad)}`);
    }
  });
});
