import { WalletError, type WalletErrorCode } from "../../../core/signer";
import { forTextNode, sanitizeText } from "../../../core/untrusted";

// What a wallet answered, as a WalletError a screen can act on. A wallet speaks EIP-1193 numeric codes (a browser
// extension, often wrapped by viem in its own error classes with the original on `cause`) or WalletConnect's own
// (5000 and up). The code decides the kind; the wallet's own words are untrusted text, cleaned and capped, and only
// ever appear after fixed app text.

const MAX_DEPTH = 8;
const MAX_WALLET_TEXT = 160;

// The first numeric code found on the error or on its causes, including the nested `data.originalError` some mobile
// wallets use to carry 4902 under a generic -32603.
export function rpcCodeOf(error: unknown): number | null {
  let current: unknown = error;
  let generic: number | null = null;
  for (let depth = 0; depth < MAX_DEPTH && typeof current === "object" && current !== null; depth += 1) {
    const candidate = current as { code?: unknown; cause?: unknown; data?: unknown };
    const nested = (candidate.data as { originalError?: { code?: unknown } } | undefined)?.originalError?.code;
    if (typeof nested === "number" && Number.isInteger(nested)) return nested;
    if (typeof candidate.code === "number" && Number.isInteger(candidate.code)) {
      // A JSON-RPC internal or generic code says less than an EIP-1193 code further down the cause chain.
      if (candidate.code > -32800 && candidate.code < -32000) generic ??= candidate.code;
      else if (candidate.code !== -1) return candidate.code;
    }
    current = candidate.cause;
  }
  return generic;
}

// The wallet's own message, cleaned, or null. Viem's "shortMessage" is preferred when present: it is the line a
// person reads, without the request dump.
export function walletTextOf(error: unknown): string | null {
  if (typeof error === "string") return clean(error);
  if (typeof error !== "object" || error === null) return null;
  const candidate = error as { shortMessage?: unknown; message?: unknown };
  const raw = typeof candidate.shortMessage === "string" ? candidate.shortMessage : typeof candidate.message === "string" ? candidate.message : null;
  return raw === null ? null : clean(raw);
}

function clean(raw: string): string | null {
  const text = forTextNode(sanitizeText("generic", raw).text).slice(0, MAX_WALLET_TEXT).trim();
  return text === "" ? null : text;
}

function codeOf(rpc: number | null): WalletErrorCode {
  switch (rpc) {
    case 4001:
    case 5000: // WalletConnect: user rejected
    case 5001: // user rejected chains
    case 5002: // user rejected methods
    case 5003: // user rejected events
      return "rejected";
    case 4100:
    case 4200:
    case 5101: // unsupported methods
    case 5102: // unsupported events
      return "unsupported";
    case 4901:
    case 4902:
    case 5100: // unsupported chains
      return "unsupported_chain";
    case 4900:
    case 6000: // WalletConnect: user disconnected
      return "disconnected";
    default:
      return "failed";
  }
}

const FIXED: Readonly<Record<WalletErrorCode, string>> = {
  rejected: "You declined the request in your wallet.",
  unsupported: "Your wallet does not do this.",
  unsupported_chain: "Your wallet will not use that chain.",
  disconnected: "Your wallet is no longer connected.",
  failed: "Your wallet could not complete the request.",
};

// Any thrown value -> a WalletError. A WalletError passes through unchanged.
export function walletErrorOf(error: unknown): WalletError {
  if (error instanceof WalletError) return error;
  const code = codeOf(rpcCodeOf(error));
  if (code === "rejected") return new WalletError(code, FIXED.rejected);
  const said = walletTextOf(error);
  return new WalletError(code, said === null ? FIXED[code] : `${FIXED[code]} It said: ${said}`);
}

// Runs a wallet call and turns whatever it throws into a WalletError.
export async function guard<T>(call: () => Promise<T>): Promise<T> {
  try {
    return await call();
  } catch (error) {
    throw walletErrorOf(error);
  }
}
