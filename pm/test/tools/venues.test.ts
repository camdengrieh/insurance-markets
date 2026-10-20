import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { adapterDescriptor } from "../../adapters/policy.js";
import { closeAll, connectDeps, makeDeps, strictAjv, NOW_MS, type Obj } from "./harness.js";

afterEach(closeAll);

describe("pm_list_venues", () => {
  it("lists the registry offline, validates against its output schema and shows adapter state", async () => {
    const deps = makeDeps();
    const harness = await connectDeps(deps);
    const tools = await harness.list();
    const schema = (tools.find((t) => t["name"] === "pm_list_venues") as Obj)["outputSchema"];
    const r = await harness.call("pm_list_venues", {});
    assert.equal(r.isError, false, r.text);
    const out = r.structured as Obj;
    assert.equal(strictAjv().compile(schema as Obj)(out), true);
    const venues = out["venues"] as Obj[];
    assert.equal(venues.length, out["count"]);
    assert.ok(venues.length >= 14);
    assert.ok(venues.some((v) => v["id"] === "xo"));
    assert.match(String(out["pmNotice"]), /no guaranteed|promises profit/i);
    const adapters = out["adapters"] as Obj[];
    const byVenue = Object.fromEntries(adapters.map((a) => [a["venue"], a]));
    assert.equal((byVenue["xo"] as Obj)["state"], "on");
    assert.equal((byVenue["polymarket"] as Obj)["state"], "on");
    assert.equal((byVenue["kalshi"] as Obj)["state"], "off");
    assert.equal((byVenue["kalshi"] as Obj)["mayPersist"], false);
    assert.equal((byVenue["kalshi"] as Obj)["mayExport"], false);
    assert.equal((byVenue["kalshi"] as Obj)["restrictedTerms"], true);
    assert.equal(typeof (byVenue["kalshi"] as Obj)["disclosure"], "string");
    assert.equal(deps.audit.events.length, 1);
    assert.equal(deps.audit.events[0]?.tool, "pm_list_venues");
    assert.equal(deps.audit.events[0]?.outcome, "ok");
  });

  it("shows a capability as yes only when recorded as yes: everything else is unproven", async () => {
    const harness = await connectDeps(makeDeps());
    const out = (await harness.call("pm_list_venues", {})).structured as Obj;
    for (const v of out["venues"] as Obj[]) {
      const caps = v["capabilities"];
      if (caps === "unknown") continue;
      for (const [key, shown] of Object.entries(caps as Obj)) {
        assert.ok(shown === "yes" || shown === "unproven", `${String(v["id"])}.${key} = ${String(shown)}`);
      }
    }
  });

  it("filters by venue and by memory-only terms", async () => {
    const harness = await connectDeps(makeDeps());
    const one = (await harness.call("pm_list_venues", { venues: ["xo"] })).structured as Obj;
    assert.equal(one["count"], 1);
    const memoryOnly = (await harness.call("pm_list_venues", { memory_only: true })).structured as Obj;
    assert.ok((memoryOnly["venues"] as Obj[]).length > 0);
    for (const v of memoryOnly["venues"] as Obj[]) assert.equal((v["dataTerms"] as Obj)["memoryOnly"], true);
    assert.ok((memoryOnly["venues"] as Obj[]).some((v) => v["id"] === "kalshi"));
  });

  it("walks Kalshi through off, ack_required and on; only the exact clause hash enables it", async () => {
    const sha = adapterDescriptor("kalshi", NOW_MS).clauseSha256;
    const state = async (env: Record<string, string>): Promise<Obj> => {
      const harness = await connectDeps(makeDeps({ env: () => env }));
      const out = (await harness.call("pm_list_venues", {})).structured as Obj;
      return (out["adapters"] as Obj[]).find((a) => a["venue"] === "kalshi") as Obj;
    };
    assert.equal((await state({}))["state"], "off");
    assert.equal((await state({ PM_KALSHI: "1" }))["state"], "ack_required");
    assert.equal((await state({ PM_KALSHI: "1", PM_KALSHI_ACK: "wrong" }))["state"], "ack_required");
    assert.equal((await state({ PM_KALSHI_ACK: sha }))["state"], "off");
    const on = await state({ PM_KALSHI: "1", PM_KALSHI_ACK: sha });
    assert.equal(on["state"], "on");
    assert.equal(on["mayPersist"], false, "enabling never makes the data storable");
    assert.equal(on["clauseSha256"], sha);
  });

  it("refuses unknown venue ids and extra fields", async () => {
    const harness = await connectDeps(makeDeps());
    assert.equal((await harness.call("pm_list_venues", { venues: ["nowhere"] })).isError, true);
    assert.equal((await harness.call("pm_list_venues", { surprise: 1 })).isError, true);
  });
});
