// Barrel for pm/core. The books and fee engine lives in the SDK (sdk/engine); the rationals and the category
// matcher are SDK modules re-exported by the two files left here. No I/O, no network, no clock (callers inject
// `nowMs`), no floating point.
export * from "../../sdk/engine/index.js";
export * from "./rational.js";
export * from "./category.js";
