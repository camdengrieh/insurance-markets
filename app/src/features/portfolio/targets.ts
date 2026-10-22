// Which venues are asked about which addresses (docs/dapp-design.md 4.3, 7.2 M2-7, M2-9).
//
// A saved address queries NO venue until the user selects it for that address (the privacy cost is stated on the
// binding screen). The plan turns the bindings into reads and says, in words, why a read is not made: the venue
// is off, needs the Cockpit, has no position reader in this build, or the address is the wrong kind for it.
// A venue that is not read is never an empty table.

import { deriveKernelAccount } from "../../core/account";
import type { AddressBinding } from "../../core/bindings";
import type { VenueId } from "../../core/ports";
import { venueState, type BuildKind, type VenueSwitches } from "../../core/venue-policy";
import type { VenueReadOutcome } from "./types";

export type Resolution = "direct" | "derived_kernel";

export type PlannedRead =
  | {
      readonly kind: "run";
      readonly venue: VenueId;
      readonly binding: AddressBinding;
      // The address whose holdings are read.
      readonly address: string;
      readonly resolution: Resolution;
    }
  | { readonly kind: "skip"; readonly venue: VenueId; readonly binding: AddressBinding; readonly outcome: VenueReadOutcome };

export const XO_CHAIN = "eip155:3223";
export const BASE_CHAIN = "eip155:8453";

// Venues that have a position reader in this build. Hyperliquid's and Manifold's adapters read no positions
// (their caps say so), and SX and the restricted venues have no reader yet.
export const POSITION_READERS: ReadonlySet<VenueId> = new Set<VenueId>(["xo", "polymarket", "limitless", "trueo", "pascal"]);

// Venues whose positions are read from the chain alone (chain-reads.ts). Their reads go to a public RPC the page may
// call directly, so a venue whose own API needs the Cockpit is still read in the standalone build.
export const CHAIN_READERS: ReadonlySet<VenueId> = new Set<VenueId>(["xo", "polymarket", "limitless"]);

function skip(venue: VenueId, binding: AddressBinding, kind: "unsupported" | "unresolved", why: string): PlannedRead {
  return { kind: "skip", venue, binding, outcome: { kind, venue, bindingId: binding.id, bindingLabel: binding.label, why } };
}

function target(venue: VenueId, binding: AddressBinding): PlannedRead {
  const address = binding.address;
  if (address === null) return skip(venue, binding, "unsupported", "This saved entry has no address.");
  switch (venue) {
    case "xo": {
      if (binding.kind === "kernel") {
        return binding.chain === XO_CHAIN
          ? { kind: "run", venue, binding, address, resolution: "direct" }
          : skip(venue, binding, "unsupported", "XO positions are held by the account on XO's own chain (3223). Select XO on that chain's row instead.");
      }
      if (binding.kind === "eoa") {
        // XO keys positions by the derived account, never by the owner.
        const derived = deriveKernelAccount(address);
        return derived.ok
          ? { kind: "run", venue, binding, address: derived.account, resolution: "derived_kernel" }
          : skip(venue, binding, "unsupported", "The XO account could not be derived from this address.");
      }
      return skip(venue, binding, "unsupported", "XO positions are looked up for a PayBox address, which owns the account, or for the account itself.");
    }
    case "polymarket":
      // Read on Polygon for the address itself. No profile lookup: that is a venue API call. Polymarket usually holds
      // positions in a wallet it creates for a signer; for an owner's address the readers also derive those wallets and
      // read each one confirmed on chain (readers.ts). A wallet pasted as its own entry is read directly.
      if (binding.kind === "venue_proxy" || binding.kind === "eoa") return { kind: "run", venue, binding, address, resolution: "direct" };
      return skip(venue, binding, "unsupported", "Polymarket positions are read on Polygon for an ordinary address or for the Polymarket wallet itself.");
    case "limitless":
      if (binding.kind === "eoa" || binding.kind === "venue_proxy" || (binding.kind === "kernel" && binding.chain === BASE_CHAIN)) {
        return { kind: "run", venue, binding, address, resolution: "direct" };
      }
      return skip(venue, binding, "unsupported", "Limitless holdings are read on Base for an ordinary address.");
    case "trueo":
      if (binding.kind === "eoa" || binding.kind === "venue_proxy" || (binding.kind === "kernel" && binding.chain === BASE_CHAIN)) {
        return { kind: "run", venue, binding, address, resolution: "direct" };
      }
      return skip(venue, binding, "unsupported", "Trueo holdings are read on Base for an ordinary address.");
    case "pascal":
      return binding.kind === "solana" ? { kind: "run", venue, binding, address, resolution: "direct" } : skip(venue, binding, "unsupported", "Pascal accounts are Solana addresses.");
    default:
      return skip(venue, binding, "unsupported", "This build has no position reader for this venue. That is different from an account with no positions.");
  }
}

export function planReads(bindings: readonly AddressBinding[], switches: VenueSwitches, build: BuildKind): PlannedRead[] {
  const planned: PlannedRead[] = [];
  const seen = new Set<string>();
  for (const binding of bindings) {
    for (const venue of binding.venues) {
      const state = venueState(venue, switches, build);
      // A chain reader asks a public RPC, never the venue's API, so the Cockpit is not needed for it.
      if (!state.enabled && !(state.reason === "needs_cockpit" && CHAIN_READERS.has(venue))) {
        const base = { venue, bindingId: binding.id, bindingLabel: binding.label };
        planned.push({
          kind: "skip",
          venue,
          binding,
          outcome: state.reason === "needs_cockpit" ? { kind: "needs_cockpit", ...base, what: "positions for this address" } : { kind: "off", ...base, reason: state.reason },
        });
        continue;
      }
      const item = target(venue, binding);
      if (item.kind === "run") {
        // The same venue asked about the same address twice (an owner and its account both selected) is read once.
        const key = `${venue}:${item.address.toLowerCase()}`;
        if (seen.has(key)) continue;
        seen.add(key);
      }
      planned.push(item);
    }
  }
  return planned;
}
