import { TOKEN_ID } from "./schemas";

// Which list of ids names the tradable outcome tokens (acceptance M0-1). Polymarket carries two position ledgers:
// the CTF ledger (`clobTokenIds`, version "v1") and Polymarket Protocol V2 (`positionIds`, version "v2"). Its docs:
// "Choose the ID field by `version`, even when both fields are present." The recorded gamma_markets_list.json has
// exactly that case: version "v1" with BOTH lists present and different, so reading `positionIds` whenever it exists
// would hand out ids the CLOB does not know. A missing or unknown version is not guessed: the market gets no
// token ids (fail closed).

export type Ledger = "ctf_v1" | "protocol_v2";

export type TokenIds =
  | { readonly ok: true; readonly ledger: Ledger; readonly ids: readonly string[] }
  | { readonly ok: false; readonly reason: string };

const MAX_U256 = (1n << 256n) - 1n;

export function isTokenId(value: string): boolean {
  return TOKEN_ID.test(value) && BigInt(value) <= MAX_U256;
}

export function selectTokenIds(input: {
  readonly version: string | null | undefined;
  readonly clobTokenIds: readonly string[] | null | undefined;
  readonly positionIds: readonly string[] | null | undefined;
  readonly outcomeCount: number;
}): TokenIds {
  let ledger: Ledger;
  let list: readonly string[] | null | undefined;
  if (input.version === "v1") {
    ledger = "ctf_v1";
    list = input.clobTokenIds;
  } else if (input.version === "v2") {
    ledger = "protocol_v2";
    list = input.positionIds;
  } else {
    return { ok: false, reason: "market version is missing or not v1 or v2" };
  }
  if (list === null || list === undefined) return { ok: false, reason: `the id list for ledger ${ledger} is missing` };
  if (list.length !== input.outcomeCount) return { ok: false, reason: `${list.length} token ids for ${input.outcomeCount} outcomes` };
  if (!list.every(isTokenId)) return { ok: false, reason: "a token id is not a decimal 256-bit integer" };
  if (new Set(list).size !== list.length) return { ok: false, reason: "two outcomes share one token id" };
  return { ok: true, ledger, ids: Object.freeze([...list]) };
}
