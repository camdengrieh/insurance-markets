import type { Untrusted } from "../../../core/ports";
import { forTextNode, sanitizeText } from "../../../core/untrusted";

// Browser wallets, found the EIP-6963 way: the page dispatches "eip6963:requestProvider" and every installed wallet
// answers with an "eip6963:announceProvider" event carrying its name, icon, reverse-DNS id and EIP-1193 provider.
// Only when no wallet announces itself within a short wait does the page fall back to window.ethereum, labelled
// "Browser wallet" (an older extension that predates EIP-6963).
//
// Everything a wallet announces is untrusted: the name becomes sanitised text shown only as a text node, and the
// icon is kept only when it is a data: image URI of a raster or SVG type, rendered through <img> (an SVG in an image
// context runs no script), never as markup. Nothing here asks a wallet for anything; discovery is silent.

export interface Eip1193Provider {
  request(args: { readonly method: string; readonly params?: unknown }): Promise<unknown>;
  on?(event: string, listener: (...args: never[]) => void): unknown;
  removeListener?(event: string, listener: (...args: never[]) => void): unknown;
}

export interface DiscoveredWallet {
  // The key the page remembers the wallet by: its reverse-DNS id when it has one ("io.metamask"), else its
  // announcement uuid, or "injected" for the window.ethereum fallback.
  readonly id: string;
  readonly name: Untrusted<string>;
  // The same name as plain text, for WalletSigner.name (which screens render as untrusted text again).
  readonly nameText: string;
  readonly rdns: string | null;
  readonly icon: string | null;
  readonly provider: Eip1193Provider;
  readonly via: "eip6963" | "window.ethereum";
}

export const FALLBACK_WALLET_ID = "injected";
export const FALLBACK_WALLET_NAME = "Browser wallet";
const MAX_NAME_CHARS = 40;
const MAX_ICON_CHARS = 128 * 1024;

export function isEip1193Provider(value: unknown): value is Eip1193Provider {
  return typeof value === "object" && value !== null && typeof (value as { request?: unknown }).request === "function";
}

// A data: URI of an image type the page will show through <img>, or null. Base64 bodies only use the base64
// alphabet; plain bodies must be percent-encoded (no raw quotes, angle brackets or whitespace).
export function safeWalletIcon(icon: unknown): string | null {
  if (typeof icon !== "string" || icon.length > MAX_ICON_CHARS) return null;
  if (/^data:image\/(?:png|svg\+xml|webp|jpeg);base64,[A-Za-z0-9+/]+={0,2}$/.test(icon)) return icon;
  if (/^data:image\/(?:png|svg\+xml|webp|jpeg)(?:;charset=utf-8)?,[A-Za-z0-9%._~!$&()*+,;=:@/?#[\]-]+$/i.test(icon)) return icon;
  return null;
}

export function cleanWalletName(raw: unknown): { readonly name: Untrusted<string>; readonly text: string } {
  const sanitized = sanitizeText("generic", typeof raw === "string" ? raw : "").text;
  const text = forTextNode(sanitized).slice(0, MAX_NAME_CHARS).trim();
  const final = text === "" ? "Unnamed wallet" : text;
  return { name: sanitizeText("generic", final).text, text: final };
}

// One announcement's detail -> a wallet, or null when it is malformed. The rdns must look like a reverse domain.
export function walletFromAnnouncement(detail: unknown): DiscoveredWallet | null {
  if (typeof detail !== "object" || detail === null) return null;
  const { info, provider } = detail as { info?: unknown; provider?: unknown };
  if (typeof info !== "object" || info === null || !isEip1193Provider(provider)) return null;
  const { uuid, name, icon, rdns } = info as { uuid?: unknown; name?: unknown; icon?: unknown; rdns?: unknown };
  if (typeof uuid !== "string" || !/^[0-9A-Za-z-]{1,64}$/.test(uuid)) return null;
  const reverse = typeof rdns === "string" && /^[a-z0-9-]+(?:\.[a-z0-9-]+)+$/i.test(rdns) && rdns.length <= 100 ? rdns.toLowerCase() : null;
  const cleaned = cleanWalletName(name);
  return { id: reverse ?? uuid, name: cleaned.name, nameText: cleaned.text, rdns: reverse, icon: safeWalletIcon(icon), provider, via: "eip6963" };
}

function fallbackWallet(provider: Eip1193Provider): DiscoveredWallet {
  const cleaned = cleanWalletName(FALLBACK_WALLET_NAME);
  return { id: FALLBACK_WALLET_ID, name: cleaned.name, nameText: cleaned.text, rdns: null, icon: null, provider, via: "window.ethereum" };
}

// Adds a wallet unless one with the same id or the same provider object is already listed (a wallet that answers
// twice, or two announcements of one extension). The first announcement wins.
export function mergeWallet(list: readonly DiscoveredWallet[], wallet: DiscoveredWallet): readonly DiscoveredWallet[] {
  if (list.some((entry) => entry.id === wallet.id || entry.provider === wallet.provider)) return list;
  // A real announcement replaces the window.ethereum fallback.
  const kept = wallet.via === "eip6963" ? list.filter((entry) => entry.via !== "window.ethereum") : list;
  return [...kept, wallet];
}

export interface DiscoveryTarget {
  addEventListener(type: string, listener: (event: Event) => void): void;
  removeEventListener(type: string, listener: (event: Event) => void): void;
  dispatchEvent(event: Event): boolean;
  readonly ethereum?: unknown;
}

export interface DiscoveryOptions {
  // How long to wait for an announcement before trying window.ethereum. Wallets answer synchronously in practice.
  readonly fallbackDelayMs?: number;
  readonly setTimer?: (callback: () => void, ms: number) => unknown;
  readonly clearTimer?: (handle: unknown) => void;
}

export const DEFAULT_FALLBACK_DELAY_MS = 400;

// Starts listening, asks the wallets to announce themselves and reports the list after every change, then once more
// with done = true when the fallback wait is over. Returns the function that stops listening.
export function discoverWallets(target: DiscoveryTarget, onChange: (wallets: readonly DiscoveredWallet[], done: boolean) => void, options: DiscoveryOptions = {}): () => void {
  let wallets: readonly DiscoveredWallet[] = [];
  let done = false;
  let stopped = false;
  const listener = (event: Event): void => {
    if (stopped) return;
    const wallet = walletFromAnnouncement((event as CustomEvent<unknown>).detail);
    if (wallet === null) return;
    const next = mergeWallet(wallets, wallet);
    if (next === wallets) return;
    wallets = next;
    onChange(wallets, done);
  };
  target.addEventListener("eip6963:announceProvider", listener);
  target.dispatchEvent(new Event("eip6963:requestProvider"));
  const setTimer = options.setTimer ?? ((callback: () => void, ms: number) => setTimeout(callback, ms));
  const clearTimer = options.clearTimer ?? ((handle: unknown) => clearTimeout(handle as ReturnType<typeof setTimeout>));
  const timer = setTimer(() => {
    if (stopped) return;
    done = true;
    const legacy = target.ethereum;
    if (wallets.length === 0 && isEip1193Provider(legacy)) wallets = mergeWallet(wallets, fallbackWallet(legacy));
    onChange(wallets, done);
  }, options.fallbackDelayMs ?? DEFAULT_FALLBACK_DELAY_MS);
  return () => {
    stopped = true;
    clearTimer(timer);
    target.removeEventListener("eip6963:announceProvider", listener);
  };
}
