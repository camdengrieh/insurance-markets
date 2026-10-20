# Probity (probity.trade) - venue spec

Researched 2026-10-19. Verdict: **skip** (site unreachable over HTTPS, no docs/API/repo found, only a ~$5K-market-cap pump.fun memecoin is verifiable).

## Summary
- [H] CoinGecko lists "Probity" (id `probity`, category "Prediction Markets", "Pump.fun Ecosystem", Solana) with description "decentralized prediction market built on the Solana blockchain". Homepage `https://probity.trade/markets`, X `probity_trade`, Telegram `probity_trade`, no GitHub repo, no whitepaper. Source: https://api.coingecko.com/api/v3/coins/probity (fetched 2026-10-19; data stamped 2026-10-17).
- [H] The only verifiable on-chain artefact is a token, mint `9N9V585yTpmosZacAcXLZWxKJEK7PbaH4RJ8gEKLD9sc` (6 decimals, ~998.6M supply). GeckoTerminal: pump.fun launchpad, graduated 2025-10-21, destination pool on PumpSwap, market cap/FDV ~$5.29K, pool reserves ~$6.57K, **24h volume $0.0** (https://api.geckoterminal.com/api/v2/networks/solana/tokens/9N9V585yTpmosZacAcXLZWxKJEK7PbaH4RJ8gEKLD9sc). CoinGecko 24h volume $1.67, ticker flagged `is_stale: true`, last trade 2026-10-17.
- [H] Site health: `probity.trade` resolves (A 34.57.15.54, GoDaddy nameservers); `http://probity.trade/` answers `301 -> https://probity.trade/` from a Caddy server, but every HTTPS handshake fails with TLS `internal error` alert (curl and WebFetch, also with `--resolve` to the IP). `www.`, `docs.`, `api.`, `app.` subdomains: `www` TLS fails the same way, the others do not resolve. Typical cause is a Caddy that cannot obtain a certificate, i.e. an abandoned or broken deployment [M, inference]. So the product cannot be confirmed live in 2026.

## Required fields
- kind: onchain-other (claimed Solana prediction market); status: unconfirmed, probably dead or never launched [M].
- Market model: NOT FOUND (searched: CoinGecko description, probity.trade fetch failed, no docs host). Cannot say binary/categorical, order book vs AMM.
- Chains/collateral: Solana per CoinGecko [H]; collateral NOT FOUND.
- Read API: none found. No docs URL, no OpenAPI, no GitHub org linked from CoinGecko (`repos_url.github` empty). Guessed hosts `api.`/`docs.` do not resolve. No fixtures of market data exist; the two saved fixtures are token-level only.
- Trade path: none known. A PayBox EVM wallet could not trade it anyway (Solana-only; only a Solana wallet via a program/transaction proposal could, and no program ID or IDL is known).
- Fees, resolution mechanism, dispute risk, geo/ToS/automation: NOT FOUND (site unreachable).
- Liquidity: no market liquidity evidence. Token market cap ~$5.3K (2026-10-17), 24h volume $0 on GeckoTerminal. [H]
- Event overlap: marketing copy only claims "global politics, crypto trends and sports" [H, CoinGecko description]; no actual markets seen.
- Shared liquidity: unknown.

## Not done
- WebSearch was refused (session search budget exhausted), so no corroboration from X/Telegram/news/Solscan program data. If revisited: check the X account `probity_trade`, Solscan token page for the creator wallet and any program interaction, and retry the site after a few days.

## Sources
- [H] https://api.coingecko.com/api/v3/coins/probity (2026-10-19)
- [H] https://api.geckoterminal.com/api/v2/networks/solana/tokens/9N9V585yTpmosZacAcXLZWxKJEK7PbaH4RJ8gEKLD9sc (2026-10-19)
- [H] DNS and HTTP probes of probity.trade (2026-10-19)
- [H] https://api.dexscreener.com/latest/dex/tokens/<mint> returned `pairs: null`

## Fixtures
- docs/research/fixtures/probity/coingecko-token-summary.json (trimmed)
- docs/research/fixtures/probity/geckoterminal-token.json
