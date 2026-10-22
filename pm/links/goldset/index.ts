// The gold-set tooling lives in the SDK (sdk/links/goldset); the parser is bound to the platform
// registry's terms in ./format.ts.
export * from "../../../sdk/links/goldset/index.js";
export { parseGoldSet } from "./format.js";
