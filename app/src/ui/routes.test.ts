import { describe, expect, it } from "vitest";

import { metaProblem, navEntries, resolveRoutes, type Loader } from "./routes";

const Screen = () => null;
const ok = (id: string, path: string, extra: Record<string, unknown> = {}): Loader => async () => ({ route: { id, path, title: id, ...extra }, default: Screen });

describe("metaProblem", () => {
  const good = { id: "markets", path: "/markets", title: "Markets", nav: { label: "Markets", order: 1 } };

  it("accepts good metadata", () => {
    expect(metaProblem(good)).toBeNull();
    expect(metaProblem({ ...good, nav: undefined, path: "/market/:venue/:marketId", availability: "cockpit" })).toBeNull();
    expect(metaProblem({ ...good, path: "/" })).toBeNull();
  });

  it("rejects every malformed field", () => {
    const bad: Array<Record<string, unknown>> = [
      { ...good, id: "Markets" },
      { ...good, id: "" },
      { ...good, id: "a".repeat(41) },
      { ...good, path: "markets" },
      { ...good, path: "/a//b" },
      { ...good, path: "/a/../b" },
      { ...good, path: "/a?x=1" },
      { ...good, path: "/a/*" },
      { ...good, path: "/<script>" },
      { ...good, title: "" },
      { ...good, title: "t".repeat(61) },
      { ...good, availability: "sometimes" },
      { ...good, nav: { label: "", order: 1 } },
      { ...good, nav: { label: "x", order: Number.NaN } },
      { ...good, nav: { label: "x", order: "1" } },
      { ...good, nav: "yes" },
      { ...good, path: "/m/:id" },
    ];
    for (const meta of bad) expect(metaProblem(meta), JSON.stringify(meta)).not.toBeNull();
    for (const meta of [null, undefined, 5, "x"]) expect(metaProblem(meta)).not.toBeNull();
  });
});

describe("resolveRoutes", () => {
  it("orders by nav order, then id, with unlisted routes after, and failures last", async () => {
    const routes = await resolveRoutes({
      "./routes/z.tsx": ok("zeta", "/zeta", { nav: { label: "Z", order: 2 } }),
      "./routes/a.tsx": ok("alpha", "/alpha", { nav: { label: "A", order: 2 } }),
      "./routes/m.tsx": ok("market", "/market/:venue/:id"),
      "./routes/p.tsx": ok("portfolio", "/portfolio", { nav: { label: "P", order: 1 } }),
      "./routes/bad.tsx": async () => ({ route: { id: "BAD" }, default: Screen }),
    });
    expect(routes.map((entry) => (entry.status === "ok" ? entry.meta.id : `failed:${entry.file}`))).toEqual(["portfolio", "alpha", "zeta", "market", "failed:./routes/bad.tsx"]);
    expect(navEntries(routes).map((entry) => entry.meta.id)).toEqual(["portfolio", "alpha", "zeta"]);
  });

  it("isolates a module that throws, resolves empty, or has no component", async () => {
    const routes = await resolveRoutes({
      "./routes/boom.tsx": async () => {
        throw new Error("top-level failure with <b>market text</b>");
      },
      "./routes/empty.tsx": async () => undefined,
      "./routes/nocomp.tsx": async () => ({ route: { id: "x", path: "/x", title: "X" } }),
      "./routes/fine.tsx": ok("fine", "/fine"),
    });
    const failed = routes.filter((entry) => entry.status === "failed");
    expect(failed.map((entry) => entry.file).sort()).toEqual(["./routes/boom.tsx", "./routes/empty.tsx", "./routes/nocomp.tsx"]);
    expect(routes[0]?.status).toBe("ok");
    // The thrown message never reaches the result.
    expect(JSON.stringify(failed)).not.toContain("market text");
  });

  it("fails BOTH routes that share an id or a path", async () => {
    const routes = await resolveRoutes({
      "./routes/one.tsx": ok("same", "/one"),
      "./routes/two.tsx": ok("same", "/two"),
      "./routes/three.tsx": ok("three", "/dup"),
      "./routes/four.tsx": ok("four", "/dup"),
      "./routes/five.tsx": ok("five", "/five"),
    });
    const by = Object.fromEntries(routes.map((entry) => [entry.file, entry.status]));
    expect(by).toEqual({
      "./routes/one.tsx": "failed",
      "./routes/two.tsx": "failed",
      "./routes/three.tsx": "failed",
      "./routes/four.tsx": "failed",
      "./routes/five.tsx": "ok",
    });
  });

  it("returns nothing for no routes (a build with no screens)", async () => {
    expect(await resolveRoutes({})).toEqual([]);
  });

  it("is deterministic for any key order", async () => {
    const loaders = { "./routes/b.tsx": ok("bb", "/bb"), "./routes/a.tsx": ok("aa", "/aa") };
    const reversed = { "./routes/a.tsx": loaders["./routes/a.tsx"], "./routes/b.tsx": loaders["./routes/b.tsx"] };
    const one = (await resolveRoutes(loaders)).map((entry) => entry.file);
    const two = (await resolveRoutes(reversed)).map((entry) => entry.file);
    expect(one).toEqual(two);
  });
});
