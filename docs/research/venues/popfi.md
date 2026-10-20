# PopFi (Solana perps / binary options) - venue spec

Researched 2026-10-19. Verdict: **skip (appears dead)**.

## Summary
- PopFi was a Solana perpetuals + binary-options platform (Pyth oracle, "up to 200x synthetic leverage"). [H: DefiLlama API description]
- DefiLlama flags it `deadUrl: true`, TVL has been 0 since early July 2024; domain popfi.io (twitter handle PopFi_io) does not resolve in DNS today. Treat as defunct. [H]
- Even when live, the "binary options" were price-direction options on crypto assets against a house wallet (PDA "PDAHouseWallet"), not event/prediction markets. No overlap with political/sports/macro event contracts. [M: inferred from DefiLlama description + adapter reading house-wallet PDA]

## Liveness evidence
- `GET https://api.llama.fi/protocol/popfi` (2026-10-19): `deadUrl: true`, `url: ""`, category Derivatives, chain Solana, listedAt 2023-12-29 (1703850808). [H]
- TVL series: first point 2023-12-29 ~$107.9k; peak ~$220k on 2024-03-18; last non-zero $98.7k on 2024-07-02; latest point (2026-10-19) $0. [H] Fixture: docs/research/fixtures/popfi/defillama-protocol-popfi-trimmed.json
- `dig`/curl: popfi.io, www.popfi.io, app.popfi.io, docs.popfi.io: "Could not resolve host". [H, 2026-10-19]
- DefiLlama web page https://defillama.com/protocol/popfi returned HTTP 403 to WebFetch. [H]
- WebSearch budget was exhausted in this session, so no independent news/tweet confirmation of shutdown. [gap]

## Spec fields
- Kind / market model: perps + short-dated binary (price up/down) options vs a house/pool wallet; no order book evidence, no outcome tokens documented. NOT FOUND (searched: DefiLlama metadata, adapter code; official docs unreachable).
- Chain / collateral: Solana; TVL held in SOL in the program house-wallet PDA. Program ID AfjPnJz75bJiMKYeManVmPVQEGNcSaj9KeF6c5tncQEa. [H: DefiLlama-Adapters projects/popfi/index.js]. Audit PDF (Dec 2023) linked from DefiLlama. [H link only, not read]
- Read API: none found. NOT FOUND (searched: DefiLlama, popfi.io domains, adapter repo). On-chain program account reads only, in theory.
- Trade path: none usable; frontend gone. Solana wallet via PayBox could in theory sign program instructions, but no live program/UI/IDL confirmed. [L]
- Fees, resolution (Pyth price feed settlement per description [M]), geo/ToS/automation: NOT FOUND (docs unreachable).
- Liquidity: $0 TVL (DefiLlama, 2026-10-19); volume NOT FOUND. Peak $220k TVL 2024-03-18.
- Event overlap: crypto price only (historic); would not be an independent arbitrage leg of any value.
- Shared liquidity: house/pool model, own liquidity; moot.
- Adapter priority: skip.

## Sources
- https://api.llama.fi/protocol/popfi [H]
- https://defillama.com/protocol/popfi (403, not readable) [-]
- https://github.com/DefiLlama/DefiLlama-Adapters/blob/main/projects/popfi/index.js [H]
- DNS/HTTP probes of popfi.io hosts, 2026-10-19 [H]

## Open questions
- Official shutdown announcement (twitter @PopFi_io) not verified; could revisit if search budget refills.
