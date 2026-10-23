import { describe, expect, it } from "vitest";

import { ANVIL_ACCOUNT_0_OWNER } from "@shared/xo/chain/constants";

import { WALLET_RELAY_ORIGINS } from "../../headers.config";
import { WALLETCONNECT_PROJECT_ID, WALLETCONNECT_RELAY_URL, isProjectId, payboxPairingUrl, requestedNamespaces, sessionFacts, type SessionLike } from "./walletconnect";

const OWNER = ANVIL_ACCOUNT_0_OWNER;

function session(namespace: Record<string, unknown>): SessionLike {
  return { topic: "t".repeat(64), expiry: 1, namespaces: { eip155: namespace as never }, peer: { metadata: { name: "x" } } };
}

describe("WalletConnect facts", () => {
  it("ships a well-formed project id, and treats anything else as not configured", () => {
    expect(isProjectId(WALLETCONNECT_PROJECT_ID)).toBe(true);
    expect(isProjectId(null)).toBe(false);
    expect(isProjectId("")).toBe(false);
    expect(isProjectId("EB06E71BF30FE71FE266FEA90BF50730")).toBe(false);
    expect(isProjectId("eb06e71bf30fe71fe266fea90bf5073")).toBe(false);
  });

  it("uses exactly the relay the CSP lists", () => {
    expect(WALLET_RELAY_ORIGINS.map((entry) => entry.origin)).toEqual([WALLETCONNECT_RELAY_URL]);
  });

  it("asks for everything as optional: the four chains, the four methods, the two events", () => {
    expect(requestedNamespaces()).toEqual({
      eip155: {
        chains: ["eip155:137", "eip155:8453", "eip155:3223", "eip155:1"],
        methods: ["eth_signTypedData_v4", "personal_sign", "eth_sendTransaction", "wallet_switchEthereumChain"],
        events: ["accountsChanged", "chainChanged"],
      },
    });
  });

  it("links to PayBox's WalletConnect page with the pairing link encoded", () => {
    const uri = "wc:abc@2?relay-protocol=irn&symKey=def";
    const url = new URL(payboxPairingUrl(uri));
    expect(url.origin + url.pathname).toBe("https://app.paybox.sh/wc");
    expect(url.searchParams.get("uri")).toBe(uri);
    expect(payboxPairingUrl(uri)).not.toContain("&symKey");
  });
});

describe("sessionFacts", () => {
  it("derives chains, the address and the capabilities from what the wallet approved (PayBox: no transactions)", () => {
    const facts = sessionFacts(session({ accounts: [`eip155:137:${OWNER.toLowerCase()}`, `eip155:8453:${OWNER}`], methods: ["personal_sign", "eth_signTypedData_v4"], events: [] }));
    expect(facts).toEqual({ address: OWNER, addresses: [OWNER], chains: [137, 8453], methods: ["personal_sign", "eth_signTypedData_v4"], sendTransaction: false, switchChain: false });
  });

  it("grants sending and switching only when those methods were approved, and reads the chain list too", () => {
    const facts = sessionFacts(session({ accounts: [`eip155:1:${OWNER}`], chains: ["eip155:1", "eip155:3223"], methods: ["eth_sendTransaction", "wallet_switchEthereumChain"], events: [] }));
    expect(facts?.chains).toEqual([1, 3223]);
    expect(facts?.sendTransaction).toBe(true);
    expect(facts?.switchChain).toBe(true);
  });

  it("refuses a session with no usable account, and skips malformed entries", () => {
    expect(sessionFacts(session({ accounts: [], methods: [], events: [] }))).toBeNull();
    expect(sessionFacts(session({ accounts: ["eip155:1:0x1234", "solana:abc:def", "eip155:0x1:" + OWNER, 7], methods: [], events: [] }))).toBeNull();
    expect(sessionFacts({ topic: "t", expiry: 1, namespaces: {}, peer: { metadata: {} } })).toBeNull();
    expect(sessionFacts(session({ accounts: ["junk", `eip155:10:${OWNER}`], methods: [3], events: [] }))?.chains).toEqual([10]);
  });
});
