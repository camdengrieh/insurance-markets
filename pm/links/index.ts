// Barrel for the pure parts of pm/links (no file or process access). The CLI (cli.ts), the
// working-registry file helpers and approve.ts are imported by path on purpose: approval is a
// human command, so its function is not part of the general surface.
export * from "./canonical.js";
export * from "./hash.js";
export * from "./schema.js";
export * from "./tier.js";
export * from "./invariants.js";
// replaceLink is deliberately not re-exported: it writes any link state without the approval
// checks, so only approve.ts and store.ts itself may use it.
export {
  EVENT_ACTIONS,
  REGISTRY_FORMAT,
  emptyRegistry,
  eventSchema,
  findLink,
  pairConflicts,
  parseRegistry,
  proposeLink,
  registrySchema,
  revokeLink,
  suspendLink,
  vetoLink,
  type Outcome,
  type Proposer,
  type Registry,
  type RegistryEvent,
} from "./store.js";
export * from "./bundle.js";
export * from "./lookup.js";
export * from "./pins.js";
export * as goldset from "./goldset/index.js";
