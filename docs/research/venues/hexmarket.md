# Hexmarket (hexmarket.xyz) - venue spec

Researched 2026-10-19. Read-only: GitHub API reads and DNS/HTTP probes only. No fixtures saved (no live API reachable).

## Verdict

- adapter_priority: skip. Evidence of liveness is absent and evidence of non-liveness is strong. Revisit only if the domain and api host come back.
- Confidence: medium (negative evidence from DNS/HTTP is first-hand but a web search was not possible, see Not found).

## Liveness (2026) - H, first-hand probes 2026-10-19

- `www.hexmarket.xyz` and `hexmarket.xyz` resolve to 192.64.119.105 (registered to Namecheap, Inc. per whois), but HTTPS connections time out after 15 s (twice, plus an earlier 20 s timeout). No HTTP response was ever received. [H]
- `api.hexmarket.xyz` returns NXDOMAIN (dig, SOA authority). `docs.hexmarket.xyz` and `app.hexmarket.xyz` have no A records. Every documented API/WebSocket base URL is therefore unresolvable. [H]
- Zone SOA serial 1774286820 decodes to 2026-03-23 17:27 UTC, i.e. DNS was last edited about 7 months ago. MX is Namecheap email forwarding. [H for the decode; M for the inference that this is parked or abandoned]
- GitHub org `hexmarketxyz` created 2026-03-19, 7 public repos, 2 followers, org profile last updated 2026-03-19. Latest pushes: docs_website 2026-03-21, SDKs 2026-03-24 to 2026-04-03, web_app 2026-04-02. Nothing after 2026-04-03 (about 6.5 months stale). [H, https://github.com/hexmarketxyz and `gh api repos/hexmarketxyz/*/commits`]
- The on-chain program ID in the docs is a placeholder: `HexMktXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX`, with the note "actual deployed address will be published here before mainnet launch". So there is no evidence a mainnet program was ever deployed. [H, docs_website `content/docs/resources/contract-addresses.mdx`]
- API doc examples use obviously fake mints and dates (e.g. mint `HxMk7Rq9...`, `createdAt 2024-01-15`), and the docs link to an unrelated GitHub path (`nicholasgriffintn/hexmarket`). Docs read as templated/pre-launch. [H]

Conclusion: pre-launch or abandoned. Not confirmed live in 2026.

## Kind and market model - H (docs claims, not verified against a live system)

- Kind: hybrid. Off-chain CLOB matching ("hex-api" operator) with on-chain Solana settlement (`settle_trade`) and a Conditional Token Framework. Source: https://github.com/hexmarketxyz/docs_website `content/docs/index.mdx`, `concepts/positions-tokens.mdx`.
- Hierarchy: Event > Market > Outcome. Market types: binary and categorical (exactly one winner). No scalar. Statuses open/closed/resolved/voided.
- Outcomes are SPL token mints (one per outcome), minted by split of USDC (`mint_outcome_tokens`), burned by merge or redeem (1 winning token = 1 USDC). Prices 0.01-0.99, YES+NO = 1.
- Order book per outcome, plus a "merged" book with synthetic cross-outcome orders (BUY NO @ p is SELL YES @ 1-p).

## Chains and collateral - H (docs)

- Solana only. USDC (mint EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v) is sole collateral, held in per-market vault PDAs. Program ID unpublished (placeholder).

## Read API - official-public, but unreachable - H for docs, H for unreachability

- Docs: https://github.com/hexmarketxyz/docs_website (site rendering host unknown; docs domain does not resolve).
- Base: `https://api.hexmarket.xyz/api/v1/` (NXDOMAIN). WebSockets: `wss://api.hexmarket.xyz/ws/market` (public, subscribe by `asset_ids`, max 50 per connection, 10 sub/unsub msgs/s) and `/ws/user` (L2 auth).
- Documented endpoints: `GET /events` (filters tag, status, limit, offset), `/events/:id`, `/markets` (outcomes; fields price, volume24h, totalVolume, liquidity, mint), `/markets/:outcome_id`, `/orderbook/:outcome_id`, `/orderbook/:outcome_id/merged`, `/trades`, `/price-snapshots`, `/tags`, `/comments`, `/positions`, `/balances`, `/orders`. JSON camelCase, UUID ids, limit/offset pagination. Also `/api/v1/price-ticks` seen in web_app commit message [M].
- Rate limits: public per IP, authenticated per wallet; 429 with Retry-After; numeric limits NOT FOUND.
- Docs internally inconsistent on auth (api-reference says `Authorization: Bearer <wallet_pubkey>`; SDK README says L1 Ed25519 + L2 HMAC with api_key/secret/passphrase). Treat all docs as unverified.
- Fixtures: none saved. Unauthenticated GETs could not be made (host does not resolve). The doc example shapes are illustrative only.

## Trade path - H (docs), not usable

- Orders: POST /orders with L2 HMAC headers (key created via the web UI, which needs Privy wallet login) plus a per-order Ed25519 signature over JSON `{outcomeId, side, orderType, timeInForce, price, quantity, nonce}` (nonce monotonic). Vault endpoints for create/deposit/withdraw/submit transactions.
- PayBox reachability: partial in theory (Solana wallet could sign the Ed25519 order message via a wallet-sign tool, and SPL/USDC deposits are ordinary Solana transactions) but an EVM wallet cannot trade it (Ed25519/Solana only), API-key creation needs a web UI session, and nothing is live. paybox_reachable = no. Money-moving/signing tools were not called.

## Fees - H (docs)

- Taker: `fee = price x quantity x fee_bps / 10000` (example 200 bps), deducted from buyer payment at settlement, so it reduces the seller proceeds; maker 0 currently. Cross-outcome match with price sum above 1.00 sends the surplus to the protocol too. `fee_bps` is read from on-chain ProtocolState; actual value NOT FOUND.

## Resolution - H (docs)

- Admin authority calls `resolve_market(market, winning_outcome)` (1/2/N winner, 3 = void). Single centralised admin key; no oracle, no dispute process documented. Void redeems all tokens 1:1 (can pay more than purchase price). High centralisation and dispute risk.

## Geo / ToS / automation - NOT FOUND

- No terms, geo-restriction, or automation policy found in docs or repos (searched docs_website, org profile, SDK READMEs). SDKs explicitly advertise bots and market making. Base is described as US-located (GitHub org location "United States of America") [M].

## Liquidity - NOT FOUND

- No volume/OI/TVL available from any live source (no API, no DefiLlama check possible, search budget exhausted). The only numbers in docs are fake examples.

## Event categories and overlap - M

- Docs mention elections, sports (FIFA World Cup), crypto price ("PriceUpDown" series events with strike price, Binance price ticks in web_app), Fed rate decision. Tags: politics etc. If it were live, overlap would be crypto up/down, politics, sports; but nothing live to arbitrage against.
- Liquidity sharing with another venue: none documented (own CLOB and vaults), so would be independent if it existed.

## Not found

- Live site content, live API response, mainnet program ID, fee_bps value, volume/TVL, ToS/geo, any third-party coverage or press (web search tool budget exhausted; no external listing check done), any activity after 2026-04-03.

## Open questions

- Did the project launch under a different domain? Is the Namecheap-hosted site deliberately down?

## Suspicious content

- None observed. Docs contain no instructions aimed at AI agents. Placeholder program ID and a docs link to an unrelated GitHub user are the only anomalies.

## Sources

- https://github.com/hexmarketxyz (org; created 2026-03-19) [H]
- https://github.com/hexmarketxyz/.github profile/README.md [H]
- https://github.com/hexmarketxyz/docs_website content/docs/{index, hexmarket-101, concepts/*, api-reference/*, trading/fees, market-data/overview, resources/contract-addresses}.mdx [H]
- https://github.com/hexmarketxyz/hexmarket_python_sdk README.md, hexmarket_typescript_sdk src/client.ts, web_app README.md and commit log [H]
- dig/whois/curl probes of hexmarket.xyz, www., api., docs., app. on 2026-10-19 [H]
