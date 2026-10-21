// SHA-256 and canonical JSON. Isomorphic: viem's sha256 runs the same in a browser and in Node, so a hash the
// linker writes and a hash the dApp recomputes agree byte for byte. Every hash in the link dataset is taken over
// canonical JSON (sorted keys, no whitespace). Floats are refused on purpose: the dataset holds integers,
// strings, booleans and null only.

import { sha256, stringToBytes } from "viem";

export function sha256Hex(text: string): string {
  return sha256(stringToBytes(text)).slice(2);
}

export function canonicalJson(value: unknown): string {
  if (value === null) return "null";
  switch (typeof value) {
    case "string":
      return JSON.stringify(value);
    case "boolean":
      return value ? "true" : "false";
    case "number":
      if (!Number.isSafeInteger(value)) {
        throw new Error("canonicalJson: only safe integers are allowed as numbers");
      }
      return String(value);
    case "object": {
      if (Array.isArray(value)) {
        return `[${value.map((item) => canonicalJson(item)).join(",")}]`;
      }
      const proto = Object.getPrototypeOf(value) as unknown;
      if (proto !== Object.prototype && proto !== null) {
        throw new Error("canonicalJson: only plain objects are allowed");
      }
      const record = value as Record<string, unknown>;
      const keys = Object.keys(record)
        .filter((key) => record[key] !== undefined)
        .sort();
      return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(",")}}`;
    }
    default:
      throw new Error(`canonicalJson: unsupported type ${typeof value}`);
  }
}

export function canonicalSha256(value: unknown): string {
  return sha256Hex(canonicalJson(value));
}

// Canonical JSON with two-space indentation: same key order and values as canonicalJson, so the
// bytes written to disk do not depend on how an object was built.
export function canonicalPretty(value: unknown, indent = 0): string {
  const pad = "  ".repeat(indent + 1);
  const end = "  ".repeat(indent);
  if (Array.isArray(value)) {
    if (value.length === 0) return "[]";
    return `[\n${value.map((item) => `${pad}${canonicalPretty(item, indent + 1)}`).join(",\n")}\n${end}]`;
  }
  if (value !== null && typeof value === "object") {
    const record = value as Record<string, unknown>;
    const keys = Object.keys(record)
      .filter((key) => record[key] !== undefined)
      .sort();
    if (keys.length === 0) return "{}";
    return `{\n${keys.map((key) => `${pad}${JSON.stringify(key)}: ${canonicalPretty(record[key], indent + 1)}`).join(",\n")}\n${end}}`;
  }
  return canonicalJson(value);
}
