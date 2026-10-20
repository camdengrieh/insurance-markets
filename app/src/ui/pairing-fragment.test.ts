// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { consumePairingCode, resetPairingCodeForTests, takePairingFragment } from "./pairing-fragment";

const CODE = "0123456789abcdef0123456789abcdef";

beforeEach(() => {
  resetPairingCodeForTests();
  window.history.replaceState(null, "", "/");
});

afterEach(() => {
  window.history.replaceState(null, "", "/");
});

describe("takePairingFragment", () => {
  it("removes a valid #pair= fragment from the address bar and keeps the code once", () => {
    window.history.replaceState(null, "", `/app/index.html?x=1#pair=${CODE}`);
    takePairingFragment();
    expect(window.location.hash).toBe("");
    expect(window.location.href).not.toContain(CODE);
    expect(window.location.pathname + window.location.search).toBe("/app/index.html?x=1");
    expect(consumePairingCode()).toBe(CODE);
    expect(consumePairingCode()).toBeUndefined();
  });

  it("removes a malformed code too and yields none", () => {
    for (const bad of ["", "xyz", CODE.toUpperCase(), `${CODE}00`, CODE.slice(1), "<script>"]) {
      window.history.replaceState(null, "", `/#pair=${bad}`);
      takePairingFragment();
      expect(window.location.hash, bad).toBe("");
      expect(consumePairingCode(), bad).toBeUndefined();
    }
  });

  it("forgets an older code when a later bad fragment is taken", () => {
    window.history.replaceState(null, "", `/#pair=${CODE}`);
    takePairingFragment();
    window.history.replaceState(null, "", "/#pair=nope");
    takePairingFragment();
    expect(consumePairingCode()).toBeUndefined();
  });

  it("leaves a route fragment alone", () => {
    window.history.replaceState(null, "", "/#/markets");
    takePairingFragment();
    expect(window.location.hash).toBe("#/markets");
    expect(consumePairingCode()).toBeUndefined();
  });

  it("does nothing without a fragment", () => {
    takePairingFragment();
    expect(window.location.hash).toBe("");
    expect(consumePairingCode()).toBeUndefined();
  });

  it("never writes the code to storage, the document or the history state", () => {
    window.history.replaceState(null, "", `/#pair=${CODE}`);
    takePairingFragment();
    expect(JSON.stringify(window.history.state)).not.toContain(CODE);
    expect(document.documentElement.outerHTML).not.toContain(CODE);
    for (const store of [window.localStorage, window.sessionStorage]) {
      for (let index = 0; index < store.length; index += 1) {
        expect(store.getItem(store.key(index) ?? "")).not.toContain(CODE);
      }
    }
  });
});
