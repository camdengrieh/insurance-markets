import { afterEach, describe, expect, it } from "vitest";

import { checkOrigins, stripComments } from "./check-origins.ts";
import { classifyHost, findUrls, htmlViolations, originViolations } from "./policy.ts";
import { tempRepo, type TempRepo } from "./test-helpers.ts";

const repos: TempRepo[] = [];
afterEach(async () => {
  await Promise.all(repos.splice(0).map((repo) => repo.dispose()));
});

const GOOD_HTML =
  '<!doctype html><html><head><meta charset="utf-8"><meta name="referrer" content="no-referrer"><title>x</title></head><body><div id="root"></div><script type="module" src="/src/main.tsx"></script></body></html>';

async function rules(files: Record<string, string>): Promise<string[]> {
  const repo = await tempRepo(files);
  repos.push(repo);
  return (await checkOrigins({ repoRoot: repo.root })).map((violation) => `${violation.rule}:${violation.file}`);
}

describe("check-origins", () => {
  it("passes on the real tree", async () => {
    expect(await checkOrigins()).toEqual([]);
  });

  it("accepts a clean page and a source file that names a listed origin (control)", async () => {
    expect(
      await rules({
        "app/index.html": GOOD_HTML,
        "app/src/venues/x.ts": 'export const base = "https://gamma-api.polymarket.com";\nexport const q = "https://orderbooks.xo.market";\n',
      }),
    ).toEqual([]);
  });

  it("fails an unknown origin and a never-host in source", async () => {
    expect(await rules({ "app/index.html": GOOD_HTML, "app/src/a.ts": 'export const u = "https://tracker.example.com/pixel";\n' })).toEqual(["unknown-origin:app/src/a.ts"]);
    expect(await rules({ "app/index.html": GOOD_HTML, "app/src/a.ts": 'export const u = "https://api.paybox.sh/mcp";\n' })).toContain("never-host:app/src/a.ts");
    expect(await rules({ "app/index.html": GOOD_HTML, "app/src/a.ts": 'export const host = "api.trueo.com";\n' })).toContain("never-host:app/src/a.ts");
  });

  it("fails a network origin over plain http and any ws or ftp scheme", async () => {
    expect(await rules({ "app/index.html": GOOD_HTML, "app/src/a.ts": 'export const u = "http://gamma-api.polymarket.com";\n' })).toEqual(["insecure-origin:app/src/a.ts"]);
    expect(await rules({ "app/index.html": GOOD_HTML, "app/src/a.ts": 'export const u = "wss://ws.example.com";\n' })).toEqual(["unknown-origin:app/src/a.ts"]);
  });

  it("ignores test files and recorded fixtures (hostile market text lives there)", async () => {
    expect(
      await rules({
        "app/index.html": GOOD_HTML,
        "app/src/a.test.ts": 'export const evil = "https://evil.example/x";\n',
        "app/src/venues/xo/fixtures/market.json": '{"title":"visit https://evil.example"}',
      }),
    ).toEqual([]);
  });

  it("fails a page with an inline script, an inline style, an external script or no referrer policy", async () => {
    const page = (body: string, head = '<meta name="referrer" content="no-referrer">'): string => `<!doctype html><html><head>${head}</head><body>${body}</body></html>`;
    expect(await rules({ "app/index.html": page("<script>alert(1)</script>") })).toContain("inline-script:app/index.html");
    expect(await rules({ "app/index.html": page('<script type="module" src="https://cdn.example.com/x.js"></script>') })).toContain("external-script:app/index.html");
    expect(await rules({ "app/index.html": page("<style>p{color:red}</style>") })).toContain("inline-style:app/index.html");
    expect(await rules({ "app/index.html": page('<p style="color:red">x</p>') })).toContain("inline-style:app/index.html");
    expect(await rules({ "app/index.html": page('<img src="x.png" onerror="boom()">') })).toContain("inline-handler:app/index.html");
    expect(await rules({ "app/index.html": page('<link rel="stylesheet" href="https://fonts.googleapis.com/css">') })).toContain("external-resource:app/index.html");
    expect(await rules({ "app/index.html": page("<p>x</p>", "") })).toEqual(["referrer-policy:app/index.html"]);
  });

  it("fails string-to-HTML and string-to-code sinks in source, but not a comment that names one", async () => {
    expect(await rules({ "app/index.html": GOOD_HTML, "app/src/a.ts": "export const f = (el: HTMLElement, s: string) => { el.innerHTML = s; };\n" })).toEqual(["html-sink:app/src/a.ts"]);
    expect(await rules({ "app/index.html": GOOD_HTML, "app/src/a.tsx": "export const C = () => <div dangerouslySetInnerHTML={{ __html: 'x' }} />;\n" })).toEqual(["html-sink:app/src/a.tsx"]);
    expect(await rules({ "app/index.html": GOOD_HTML, "app/src/a.ts": "export const r = eval('1');\n" })).toEqual(["html-sink:app/src/a.ts"]);
    expect(await rules({ "app/index.html": GOOD_HTML, "app/src/a.ts": "// never use innerHTML here\nexport const a = 1; /* eval is banned */\n" })).toEqual([]);
  });

  it("classifies hosts and finds URLs without matching template hosts", () => {
    expect(classifyHost("api-mainnet.xo.market")).toBe("network");
    expect(classifyHost("orderbooks.xo.market")).toBe("network");
    expect(classifyHost("react.dev")).toBe("inert");
    expect(classifyHost("api.paybox.sh")).toBe("never");
    expect(classifyHost("evil.example")).toBe("unknown");
    expect(findUrls('x "https://a.example.com:8443/p" `http://[${host}]`').map((hit) => hit.host)).toEqual(["a.example.com"]);
    expect(stripComments("a // b\nc /* d */ e")).toBe("a \nc  e");
  });

  it("reports line numbers", () => {
    expect(originViolations("f.ts", '\n\nconst u = "https://tracker.example.com";\n')[0]?.line).toBe(3);
    expect(htmlViolations("f.html", "<p>\n<script>1</script>")[0]?.line).toBe(2);
  });
});
