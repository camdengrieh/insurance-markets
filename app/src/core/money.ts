// Moved to sdk/money/qty.ts (docs/sdk-and-api-design.md step 2). Kept as a re-export so app import paths stay stable.
export * from "@sdk/money/qty";
// The shared decimal grammar and base-unit conversion under it (sdk/money/decimal.ts), for the tickets and the market page.
export { decToAtomic, isDec, splitDecimal } from "@sdk/money/decimal";
