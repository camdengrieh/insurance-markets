// The mock XO's switches for everything that is unknown on the real service
// (docs/phase1-gap-closing.md section 5.5, category B). DATA ONLY: the names and values below are
// frozen in Wave 0 so the mock, the relay tests and the live kit agree on spelling. The mock stream
// implements the behaviour and may ADD switches or values; it must not rename or remove any.
//
// Profiles (decision D9): "pessimistic" is the default profile and sets every switch to its
// `pessimistic` value; "optimistic" sets every switch to its `optimistic` value. The relay suite
// runs in both, and also flips each switch alone from the pessimistic profile to every other value.
//
// How the two columns were chosen. The spec lists values "default first" but several rows list the
// working value first (for example bundler.estimate, funding.credit, withdraw.paymasterless). Here
// the pessimistic column is the least favourable value that is still a documented possibility, and
// the optimistic column is the value under which everything the plugin assumes works. Where a row
// has more than two values the middle ones are `values` entries that only the single-flip runs use.
// Numeric values are strings so the table stays plain data. `register` holds the assumption-register
// ids (AD, UO, AU, OR, FU, CR, XS) the switch is evidence for.

export interface MockSwitchDef {
  readonly name: string;
  // Every value the mock must accept for this switch.
  readonly values: readonly string[];
  readonly pessimistic: string;
  readonly optimistic: string;
  readonly register: readonly string[];
  // Unit or meaning of the values when it is not obvious.
  readonly unit?: string;
}

export const MOCK_SWITCHES = [
  // Bundler and paymaster ------------------------------------------------------------------------
  { name: "bundler.foreign_account", values: ["reject", "accept", "requires-key"], pessimistic: "reject", optimistic: "accept", register: ["AD5"] },
  { name: "bundler.paymasterless", values: ["reject", "accept"], pessimistic: "reject", optimistic: "accept", register: ["UO8"] },
  { name: "bundler.estimate", values: ["unsupported", "supported"], pessimistic: "unsupported", optimistic: "supported", register: ["UO5"] },
  { name: "bundler.shape", values: ["reject-unpacked", "v0.7-unpacked"], pessimistic: "reject-unpacked", optimistic: "v0.7-unpacked", register: ["UO6"] },
  { name: "paymaster.state", values: ["paused", "policy-narrowed", "sponsor"], pessimistic: "paused", optimistic: "sponsor", register: ["UO7"] },
  { name: "rpc.access", values: ["down", "requires-key", "open"], pessimistic: "down", optimistic: "open", register: ["UO9"] },
  // Registry and L1 -----------------------------------------------------------------------------------
  { name: "registry.trigger", values: ["never", "on-enable-trading", "on-l1-create", "on-deploy"], pessimistic: "never", optimistic: "on-deploy", register: ["AD4"] },
  { name: "l1.undeployed", values: ["reject", "erc6492"], pessimistic: "reject", optimistic: "erc6492", register: ["AU6"] },
  // Credentials -------------------------------------------------------------------------------------------
  { name: "auth.derive_returns_secret", values: ["no", "yes"], pessimistic: "no", optimistic: "yes", register: ["AU2"] },
  { name: "auth.max_keys", values: ["1", "5"], pessimistic: "1", optimistic: "5", register: ["AU4"], unit: "keys per account" },
  { name: "auth.delete_level", values: ["L1", "L2"], pessimistic: "L1", optimistic: "L2", register: ["AU3"] },
  { name: "hmac.target", values: ["path-with-query", "path-only"], pessimistic: "path-with-query", optimistic: "path-only", register: ["OR10"] },
  { name: "hmac.decode", values: ["stripped", "raw", "b64url-decoded-padded"], pessimistic: "stripped", optimistic: "b64url-decoded-padded", register: ["OR10"] },
  { name: "l2.required_on_post", values: ["no", "yes"], pessimistic: "no", optimistic: "yes", register: ["OR9"] },
  { name: "l2.xo_address", values: ["required", "ignored"], pessimistic: "required", optimistic: "ignored", register: ["OR9"] },
  // Order rules --------------------------------------------------------------------------------------------------
  { name: "order.min_size", values: ["5", "1", "0"], pessimistic: "5", optimistic: "0", register: ["OR6"], unit: "shares" },
  { name: "order.min_notional", values: ["1", "0.30", "0"], pessimistic: "1", optimistic: "0", register: ["OR6"], unit: "USD" },
  { name: "order.gtd_min", values: ["180", "60", "0"], pessimistic: "180", optimistic: "0", register: ["OR17"], unit: "seconds" },
  { name: "order.sig_forms", values: ["eip191-only", "raw-only", "both"], pessimistic: "eip191-only", optimistic: "both", register: ["OR3", "OR4"] },
  { name: "order.prefix", values: ["0x00", "0x01", "both"], pessimistic: "0x00", optimistic: "both", register: ["OR3", "OR4"] },
  { name: "order.dup_key_includes_sig", values: ["yes", "no"], pessimistic: "yes", optimistic: "no", register: ["OR13"] },
  // Cancel and engine ----------------------------------------------------------------------------------------------------
  { name: "cancel.body", values: ["numeric-id", "orderId", "orderID-hash"], pessimistic: "numeric-id", optimistic: "orderID-hash", register: ["OR11"] },
  { name: "cancel.batch_hmac_only", values: ["no", "yes"], pessimistic: "no", optimistic: "yes", register: ["OR11"] },
  { name: "engine.taker_delay", values: ["3000", "500"], pessimistic: "3000", optimistic: "500", register: ["OR12"], unit: "milliseconds" },
  { name: "engine.balance_drop", values: ["lifo-off", "lifo-on"], pessimistic: "lifo-off", optimistic: "lifo-on", register: ["OR14"] },
  // Funding and withdrawal -----------------------------------------------------------------------------------------------------
  { name: "funding.credit", values: ["not-credited", "delayed-5min", "credited-after-sweep-only", "credited"], pessimistic: "not-credited", optimistic: "credited", register: ["FU6"] },
  { name: "withdraw.paymasterless", values: ["accept-no-deliver", "reject", "accept-and-deliver"], pessimistic: "accept-no-deliver", optimistic: "accept-and-deliver", register: ["FU9"] },
  // Creation --------------------------------------------------------------------------------------------------------------------------
  { name: "meta.foreign_uri", values: ["rejected", "ignored", "reviewed"], pessimistic: "rejected", optimistic: "reviewed", register: ["CR4"] },
  { name: "seed.on_pending", values: ["422", "accept"], pessimistic: "422", optimistic: "accept", register: ["CR7"] },
  // Faults: injected per test, not part of either profile. "none" in both columns. --------------------------------------------------------
  { name: "faults", values: ["none", "429-retry-after", "5xx", "timeout", "truncated-json"], pessimistic: "none", optimistic: "none", register: ["XS"] },
] as const satisfies readonly MockSwitchDef[];

export type MockSwitchName = (typeof MOCK_SWITCHES)[number]["name"];
export type MockSwitchValue<N extends MockSwitchName> = Extract<(typeof MOCK_SWITCHES)[number], { readonly name: N }>["values"][number];
export type MockProfile = { readonly [N in MockSwitchName]: MockSwitchValue<N> };
export type MockProfileName = "pessimistic" | "optimistic";

export const MOCK_SWITCH_NAMES: readonly MockSwitchName[] = MOCK_SWITCHES.map((definition) => definition.name);

// Plain data derived from the table above (no behaviour).
export const PESSIMISTIC_PROFILE = Object.freeze(
  Object.fromEntries(MOCK_SWITCHES.map((definition) => [definition.name, definition.pessimistic])),
) as MockProfile;
export const OPTIMISTIC_PROFILE = Object.freeze(
  Object.fromEntries(MOCK_SWITCHES.map((definition) => [definition.name, definition.optimistic])),
) as MockProfile;
