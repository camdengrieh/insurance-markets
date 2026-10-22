import type { ContractPin } from "../pins.js";
import { CONDITIONAL_TOKENS, CTF_EXCHANGE, EXCHANGE_IMPLEMENTATION, USDC_E_ADDRESS, XO_CHAIN_ID } from "./constants.js";

// The deployed code of the XO contracts the position, fill and resolution readers use (chain 3223). The addresses
// are the ones constants.ts already pins, and they are the four rows of XO's own contract list (XO Market Docs,
// /documentation/introduction, "Contracts", read 2026-10-22 through the xo-docs MCP: CTF Exchange, Conditional
// Tokens, XO USDC). test/fixtures/chain-bytecode/capture.ts read their code with eth_getCode over XO's public RPC
// on 2026-10-22; XO's explorer served the same bytes for the two that were compared. XO is not on Sourcify:
//   - the exchange implementation's source was verified on XO's explorer (CTFExchange, solc 0.8.28, verified
//     2026-08-10; docs/research/22 section 1), and its ABI is saved in docs/research/fixtures/gaps/userop-templates;
//   - Conditional Tokens has no verified source on any service this repository reads. It is pinned from XO's list
//     and checked three ways instead: its code hash, the presence in its dispatcher of every selector the readers
//     call (test/chain-pins.test.ts), and XO's own outcome token ids deriving from their condition by the Gnosis
//     CTHelpers algorithm (sdk/chain/readers.test.ts).

export const XO_RPC_URL = "https://rpc-mainnet-2.xo.market/";

const LIST = "XO Market Docs, /documentation/introduction, Contracts (read 2026-10-22)";
const READ_ON = "2026-10-22";

function pin(name: string, address: `0x${string}`, codeHash: `0x${string}`, codeSize: number, verified: string, implementation: ContractPin | null = null, source = LIST): ContractPin {
  return Object.freeze({ chainId: XO_CHAIN_ID, name, address, codeHash, codeSize, implementation, source, verified, readOn: READ_ON });
}

export const XO_PINS = Object.freeze({
  conditionalTokens: pin(
    "XO Conditional Tokens",
    CONDITIONAL_TOKENS,
    "0x969a4b4dec9d773dc75c30678c2d7b6cfc2d1350e95d4614c06faf12dc500f1d",
    14771,
    "no verified source; code hash, dispatcher selectors and token-id derivation checked",
  ),
  ctfExchange: pin(
    "XO CTF Exchange",
    CTF_EXCHANGE,
    "0xec8231b78f32f91186fdf98774cc7b2fc96759f22e90fa823f7b1e32f1bedd11",
    130,
    "an ERC-1967 proxy; its slot names the pinned implementation",
    pin(
      "XO CTF Exchange implementation",
      EXCHANGE_IMPLEMENTATION,
      "0x3eb576a95856be56229cd476c355789afa9f17f995fa7011dcb4aeb2d6675bc1",
      19173,
      "CTFExchange source verified on XO's explorer (docs/research/22 section 1)",
      null,
      "the EIP-1967 slot of the pinned proxy",
    ),
  ),
  usdcE: pin("XO USDC", USDC_E_ADDRESS, "0xc2059a483ceeca165dfcc9727922e7c8c7b99710e84eca06cf765c235b133893", 1798, "no verified source; code hash only (it is only ever a derivation input)"),
});
