// Barrel for the venue-agnostic types and the exact-decimal bridge. Subfolders (core, registry,
// links, adapters, ops, signals, recorder, tools) are imported by path, not re-exported here, so
// that importing the types never pulls in I/O code.
export * from "./types.js";
