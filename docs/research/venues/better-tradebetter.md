# BETTER (tradebetter) venue spec

Researched 2026-10-19. Tags: H = read first-hand in a primary source this session, M = secondary/inferred, L = weak/stale.

## Verdict

BETTER is NOT a prediction market venue. It is a token-gated copy-trading terminal (plus a planned vault) that routes to Polymarket. It has no markets, no order book, no resolution and no public API of its own. Adapter priority: **skip** for trading/arbitrage. At most it is a thin, unavailable signal source (wallet "Insider Score" derived from Polymarket data we can already read directly).

## Is it still live (2026)?

- Marketing site https://www.tradebetter.app returns HTTP 200 on 2026-10-19 (tradebetter.app 307-redirects to www; Vercel). [H]
- Docs at https://docs.tradebetter.app return 200 (Mintlify). [H]
- BUT every status statement in the docs is dated "as of 6 March 2026" (7 months old, STALE). Terminal "closed beta" was the only live product then; vaults targeted "Q1 2026" and still listed as in progress. No evidence found that the vault shipped. [H for docs text, L for current state]
- terminal.tradebetter.app (the product URL named on the homepage) did NOT resolve in DNS from this machine on 2026-10-19; api.tradebetter.app also does not resolve. [H] Possible the terminal moved or was shut down; unconfirmed.
- Token activity looks dead: GeckoTerminal shows 24h volume $0, no top pools, total reserve about $7.0k (2026-10-19). CoinGecko record last_updated 2026-08-13, market cap about $1.32M, 24h volume about $970, price about $0.0020 vs ATH about 73% higher. [H]
- Verdict: website/docs up, product status unconfirmed and likely dormant. Confidence low-medium.

## Kind and market model

- Kind: aggregator-data / copy-trading front end for Polymarket. Not a venue. [H]
- Market model: none of its own. All trading is on Polymarket's CLOB (binary/categorical order book, conditional tokens on Polygon). [H]
- Signals focus: Polymarket 15-minute BTC/ETH/XRP/SOL up/down markets, whale-size wallet signals, "Insider Score" (z-score over top ~1,000 Polymarket wallets). [H]

## Chains and collateral

- Funding sources: Ethereum mainnet and Base, in USDC, via Enclave.money "Universal Deposit Address"; ends as USDC.e on Polygon for Polymarket. [H]
- $BETTER token on Base: 0x396FfAd9469e3d3E3fc4061B79accE2Ad0Ce4B9E (new contract after 2026-03-10 migration; old 0xa7f7D14618271B720609C45e7AE9E09f7DEA01ae). Token generation 2026-01-21. Supply about 709,001,940. [H: docs whitepaper/roadmap, CoinGecko, GeckoTerminal]
- Access gated by holding $BETTER (100,000 below $10M FDV; Lite Mode half), checked via Privy login. [H]

## Read API

- exists: none. Docs explicitly say: "BETTER does not have a public, complete developer API reference yet" (as of 6 March 2026); telemetry/indexing "may" come later; integration requests via X or Telegram. [H] https://docs.tradebetter.app/api-reference/introduction.md
- NOT FOUND (searched: docs llms.txt, api-reference page, CoinGecko links.repos_url empty, api.tradebetter.app DNS, tradebetter.app openapi.json via redirect only). No GitHub org/repo found. WebSearch budget was exhausted this session so web-wide search for unofficial APIs/repos was not possible.
- Underlying data is available directly from Polymarket's public APIs (covered by another workflow).

## Trade path

- None for third parties. Terminal is a token-gated UI with Privy login and custodial-style deposit address flow; trades placed via Polymarket API on the user's behalf. Polymarket sponsors gas for terminal trades. [H]
- PayBox reachability: no. Nothing to propose or sign against BETTER; the only BETTER-specific on-chain object is the $BETTER ERC-20 on Base (and an Aerodrome $BETTER/WETH pool), which is not a prediction market position. An EVM wallet could trade Polymarket directly (covered elsewhere).

## Fees

- Lite Mode: 2% of nominal value per filled copy trade, charged per fill. [H]
- Vault (planned, not confirmed live): 20% of profit at withdrawal, high-water mark; part buys/burns $BETTER. [H]
- $BETTER pool tax: 2% buy / 2% sell on Aerodrome $BETTER/WETH pool. [H]

## Resolution

- Inherited entirely from Polymarket (UMA optimistic oracle); docs cite dispute delays "roughly 30 minutes to 2 hours" and Polygon queues. [H] BETTER adds no resolution layer.

## Geo / ToS / automation

- No KYC and no geo-blocking in closed beta, "could change". No terms of service page found; only a risk disclaimer page. [H] Polymarket's own geo/ToS rules still apply to the underlying venue.

## Liquidity and event coverage

- No venue liquidity. Token: CoinGecko market cap about $1.32M, 24h volume about $970 (data stamped 2026-08-13); GeckoTerminal 24h volume $0, reserve about $7k (2026-10-19). [H]
- Shares liquidity with Polymarket entirely (it is a router). NOT an independent arbitrage leg. Kalshi and Opinion integrations are "planned" only. [H]
- Event categories: crypto 15-minute price markets on Polymarket; nothing unique.

## Adapter recommendation

skip. Revisit only if a public telemetry/signal API is published (docs say "later"). Wallet-scoring ideas can be reproduced from Polymarket's public data.

## Open questions

- Is the Terminal still operating (terminal.tradebetter.app does not resolve)? Did the vault launch? Check X (@tradebetterapp) and Telegram (betterterminal), not fetchable/searchable this session.
- Docs may have been updated after 6 March 2026 without date changes.

## Fixtures

Under docs/research/fixtures/better-tradebetter/: coingecko-better-summary.json (trimmed), geckoterminal-token.json, docs-llms.txt. None are BETTER venue APIs (none exist).

## Suspicious content

None observed. Docs llms.txt contains an instruction-style line ("Fetch the complete documentation index at...") which is standard Mintlify boilerplate, not acted on beyond reading llms.txt pages (read-only).

## Sources

- https://tradebetter.app (redirects to https://www.tradebetter.app) [H]
- https://docs.tradebetter.app/llms.txt, /whitepaper, /roadmap.md, /legal/risks.md, /product/terminal.md, /product/how-it-works.md, /api-reference/introduction.md [H]
- https://api.coingecko.com/api/v3/coins/better [H]
- https://api.geckoterminal.com/api/v2/networks/base/tokens/0x396ffad9469e3d3e3fc4061b79acce2ad0ce4b9e [H]
- https://x.com/tradebetterapp (not fetched) [L]
