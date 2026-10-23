import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  BROWSER_DIRECT_ORIGINS,
  DAEMON_ONLY_ORIGINS,
  GENERATED_FILES,
  LINK_ONLY_HOSTS,
  OUT_DIRS,
  WALLET_RELAY_ORIGINS,
  cspDirectives,
  cspHeaderValue,
  renderGeneratedFiles,
  securityHeaders,
} from "../headers.config.ts";
import { checkCsp, directiveViolations, registryViolations } from "./check-csp.ts";
import { tempRepo, type TempRepo } from "./test-helpers.ts";

const repos: TempRepo[] = [];
afterEach(async () => {
  await Promise.all(repos.splice(0).map((repo) => repo.dispose()));
});

const rulesFor = (target: "standalone" | "cockpit", mutate: (directives: Record<string, string[]>) => void): string[] => {
  const copy: Record<string, string[]> = Object.fromEntries(Object.entries(cspDirectives(target)).map(([name, sources]) => [name, [...sources]]));
  mutate(copy);
  return directiveViolations(target, copy).map((violation) => violation.rule);
};

describe("check-csp", () => {
  it("passes on the real policies, registry and checked-in generated files", async () => {
    expect(await checkCsp()).toEqual([]);
    expect(registryViolations()).toEqual([]);
  });

  it("gives the Cockpit build connect-src 'self' only, and no loopback anywhere", () => {
    expect(cspDirectives("cockpit")["connect-src"]).toEqual(["'self'"]);
    for (const target of ["cockpit", "standalone"] as const) {
      expect(cspHeaderValue(target)).not.toMatch(/127\.0\.0\.1|localhost|unsafe-|\*/);
    }
  });

  it("lists exactly the browser-direct origins and the wallet relay in the standalone build, and none of the daemon-only ones", () => {
    const connect = cspDirectives("standalone")["connect-src"] ?? [];
    expect(connect).toEqual(["'self'", ...BROWSER_DIRECT_ORIGINS.map((entry) => entry.origin), ...WALLET_RELAY_ORIGINS.map((entry) => entry.origin)]);
    for (const entry of DAEMON_ONLY_ORIGINS) expect(connect).not.toContain(entry.origin);
    // https everywhere, except the one WalletConnect relay, which is a WebSocket.
    expect(WALLET_RELAY_ORIGINS.map((entry) => entry.origin)).toEqual(["wss://relay.walletconnect.org"]);
    expect(connect.filter((source) => source !== "'self'" && !source.startsWith("https://"))).toEqual(["wss://relay.walletconnect.org"]);
    expect(cspDirectives("cockpit")["connect-src"]).not.toContain("wss://relay.walletconnect.org");
  });

  it("allows a wss origin only when it is the listed wallet relay, and never a link-only host", () => {
    expect(rulesFor("standalone", (d) => d["connect-src"]?.push("wss://relay.walletconnect.com"))).toContain("malformed-source");
    expect(rulesFor("standalone", (d) => d["img-src"]?.push("wss://relay.walletconnect.org"))).toContain("malformed-source");
    expect(rulesFor("cockpit", (d) => d["connect-src"]?.push("wss://relay.walletconnect.org"))).toContain("directive");
    expect(rulesFor("standalone", (d) => d["connect-src"]?.push("https://app.paybox.sh"))).toContain("link-only-host");
    expect(Object.keys(LINK_ONLY_HOSTS)).toEqual(["app.paybox.sh"]);
  });

  it("sends the same header set on both builds apart from the CSP", () => {
    const a = securityHeaders("standalone").filter((pair) => pair.key !== "Content-Security-Policy");
    const b = securityHeaders("cockpit").filter((pair) => pair.key !== "Content-Security-Policy");
    expect(a).toEqual(b);
    expect(OUT_DIRS.standalone).not.toBe(OUT_DIRS.cockpit);
  });

  it("fails each seeded policy weakening", () => {
    expect(rulesFor("standalone", (d) => d["script-src"]?.push("'unsafe-inline'"))).toContain("forbidden-source");
    expect(rulesFor("standalone", (d) => d["script-src"]?.push("'unsafe-eval'"))).toContain("forbidden-source");
    expect(rulesFor("standalone", (d) => d["connect-src"]?.push("https://*.example.com"))).toContain("forbidden-source");
    expect(rulesFor("standalone", (d) => d["connect-src"]?.push("http://api.example.com"))).toContain("insecure-source");
    expect(rulesFor("standalone", (d) => d["connect-src"]?.push("wss://stream.example.com"))).toContain("malformed-source");
    expect(rulesFor("standalone", (d) => d["connect-src"]?.push("http://127.0.0.1:8787"))).toContain("loopback-source");
    expect(rulesFor("standalone", (d) => d["connect-src"]?.push(DAEMON_ONLY_ORIGINS[0]?.origin ?? ""))).toContain("daemon-only-in-csp");
    expect(rulesFor("standalone", (d) => d["connect-src"]?.push("https://api.paybox.sh"))).toContain("never-host");
    expect(rulesFor("standalone", (d) => d["connect-src"]?.push("https://api.example.com/path"))).toContain("malformed-source");
    expect(rulesFor("standalone", (d) => d["connect-src"]?.push("https://api.gemini.com"))).toContain("duplicate");
    expect(rulesFor("cockpit", (d) => d["connect-src"]?.push("https://api.manifold.markets"))).toContain("directive");
    expect(rulesFor("cockpit", (d) => (d["default-src"] = ["'self'"]))).toContain("directive");
    expect(rulesFor("cockpit", (d) => delete d["trusted-types"])).toContain("directive");
    expect(rulesFor("cockpit", (d) => (d["frame-ancestors"] = ["'self'"]))).toContain("directive");
    expect(rulesFor("cockpit", (d) => d["img-src"]?.push("https:"))).toContain("malformed-source");
  });

  it("detects drift in a checked-in generated file, a missing file, and regenerates with write", async () => {
    const repo = await tempRepo();
    repos.push(repo);
    expect((await checkCsp({ appDir: repo.app })).map((v) => v.rule)).toEqual(GENERATED_FILES.map(() => "drift"));
    expect(await checkCsp({ appDir: repo.app, write: true })).toEqual([]);
    expect(await checkCsp({ appDir: repo.app })).toEqual([]);

    const vercel = join(repo.app, "vercel.json");
    await writeFile(vercel, (await readFile(vercel, "utf8")).replace("default-src 'none'", "default-src 'self'"));
    const found = await checkCsp({ appDir: repo.app });
    expect(found.map((v) => `${v.rule}:${v.file}`)).toEqual(["drift:app/vercel.json"]);

    const examples = join(repo.app, "scripts/examples/_headers");
    await mkdir(dirname(examples), { recursive: true });
    await writeFile(examples, "stale\n");
    expect((await checkCsp({ appDir: repo.app })).length).toBe(2);
  });

  it("renders deterministic files with no timestamp", () => {
    expect(renderGeneratedFiles()).toEqual(renderGeneratedFiles());
    for (const text of Object.values(renderGeneratedFiles())) expect(text).not.toMatch(/\d{4}-\d{2}-\d{2}T/);
  });
});
