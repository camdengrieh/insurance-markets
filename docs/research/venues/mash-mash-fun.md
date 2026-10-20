# Mash (mash.fun) - venue spec

Researched 2026-10-19. Read-only; no accounts, no signing, no POSTs. No fixtures saved (no API response could be confirmed).

## Verdict
Adapter priority: **skip** (signal-only at most). Sports "perps" (scalar index/stat markets) on a Solana Drift v2 fork. No official public API or developer docs found, docs link is dead, prod order-book host refused TLS from here, volume tiny (~$1M cumulative as of Jan 2026, company claim), and scalar sports-stat indices do not map to binary prediction-market outcomes.

## Liveness [M]
- https://mash.fun/ and https://app.mash.fun/ return HTTP 200, title "MASH | Sports Perps on Solana" (fetched 2026-10-19) [H]. A live HTML shell does not prove the markets are active or have liquidity.
- Prediction Index lists "Mashdotfun": Solana, scalar, status live, volume n/a (fetched 2026-10-19) [H that it says this; M that it is true].
- News: Dec 2025 added Team Indexes / Shirts / Mash Index football markets; Jan 2026 added player props and claimed $1M total traded volume [M, press-release style, secondary].
- No news of shutdown found; also no 2026 news after January found (NOT FOUND: any volume/status data after Jan 2026; searched: web search extended x3). Treat status as "site up, activity unverified".
- Front-end contains a maintenance-mode check against a "zeno" API `/status` [H, from JS bundle].

## Kind and market model [M/H]
- kind: onchain-other. "Sports perps": scalar, leveraged long/short positions on team/player stat indices (team points for goals, clean sheets, corners; shirt-number index; "Mash Index" action metric; player props). Sports covered per press: soccer, American football, basketball, baseball, cricket [M].
- Mechanism: the app bundle sets `DRIFT_PROGRAM_ID="MashGQTqcKDZAMevJKST9RYqJTL2Ae9NpcSuCE9WYqK"`, uses Drift-style `DlobEndPoints`, perp/spot market lists, `JIT_PROXY`, Pyth/Switchboard oracle fields, i.e. a fork of Drift Protocol v2 (central limit order book via off-chain DLOB + AMM/vAMM + JIT liquidity) [H that the strings exist in https://app.mash.fun/assets/index.hUcflL4w.js; M on the inference "Drift v2 fork"]. Market list is pulled from `<DLOB>/markets/chain` [H].
- Outcomes are not tokenised: positions are account state inside the program, not SPL tokens [M, inferred from Drift architecture].
- Bundle also contains a devnet test market "US Electoral Votes for Trump" and "Total Goals" markets (devnet defaults only) [H].

## Chains and collateral [M]
- Solana only. USDC collateral/settlement (AirdropBee guide, updated 2026-01-18, third-party) [M]. Also an "MLP" liquidity vault accepting USDC [M].
- Wallet onboarding via Dynamic + Turnkey embedded wallets and Solana wallets [H, bundle strings].

## Read API
- exists: **unofficial-only / on-chain** (no official public API documented).
- Docs: the site links https://docs.mash.fun/s/home but `docs.mash.fun` does not resolve in DNS (curl: could not resolve host; WebFetch ENOTFOUND, 2026-10-19) [H]. NOT FOUND: developer docs, OpenAPI, SDK, GitHub org/repo (searched: site bundle, gh search repos "mashdotfun", gh search code for the program ID, web search).
- Hosts seen in front-end code [H]: `https://dlob.prod.mash.trade` (mainnet DLOB; route `/markets/chain` confirmed in code), `https://dlob.devnet.mash.trade`, `https://zeno.devnet.mash.trade` (+ `/ws`, `/status`, `/public/v1/query/get_attestation`). Prod and devnet DNS resolve to a Traefik ingress.
- Probe result: all GETs to `https://dlob.prod.mash.trade/*` fail at TLS handshake with "tlsv1 alert internal error" (alert 80; no certificate served) with LibreSSL curl, Homebrew curl 8.x and openssl s_client, 2026-10-19 [H]. Cause unknown (decommissioned vhost, IP/geo filter, or SNI allowlist). No response shapes confirmed, so no fixtures.
- On-chain: if the Drift fork is intact, market/oracle/user accounts are readable via Solana RPC using Drift's account layout (program above). Not verified (would need JSON-RPC POST, which was out of scope) [L].
- Auth/limits/websocket: NOT FOUND.

## Trade path
- Programmatic: Solana transactions against the Drift-fork program (place_perp_order etc.) signed by a Solana key, plus a DLOB/zeno backend for matching. No documented API-key or signed-order REST path. NOT FOUND (official). [M/L]
- Account creation and deposit are required first; account creation was not attempted.

## PayBox reachability
- paybox_reachable: **partial** at best. PayBox supports Solana wallets and Solana transaction/plugin flows, but Mash has no PayBox plugin and no documented instruction set/IDL; an EVM-only wallet (Base/Ethereum/BNB/Arbitrum/Polygon) cannot trade it. Would need a Solana credential and a hand-built Drift-style instruction set. [M]

## Fees [L]
- Official formulas NOT FOUND. Third-party: referrers get 50% of fees from referred users, referred users get a 10% fee discount; points program tied to volume and fees paid; perp-style funding/liquidation applies [M/L, AirdropBee].

## Resolution mechanism [L]
- Scalar index values derived from game stats, settled in USDC. Source of stat data, oracle (Switchboard/Pyth fields exist in the bundle; a `crossbar.switchboard.xyz` reference and an attestation endpoint on the zeno host suggest attested off-chain stat feeds) and dispute process: NOT FOUND. Operator-controlled oracle/index risk is high; being perp-style there may be no terminal "resolution", only index marks.

## Geo / ToS / automation
- Front-end contains a message that the service is "not available to persons in {{jurisdiction}} as you are in a sanctioned jurisdiction" and a ToS acknowledgement on deposit [H, bundle strings]. Full geo list and automation/API rules: NOT FOUND (docs unreachable).
- Regulatory: a 2026 explainer says sports perps are unapproved and contested by CME [L, secondary, via search summary].

## Liquidity [L]
- ~$1M cumulative traded volume, company claim, reported 2026-01-16 (hipther.com headline; body not retrievable) [M/L]. No TVL/OI/volume after January 2026 found; Prediction Index shows volume n/a. Assume thin.

## Event category overlap
- Soccer/NFL/NBA/MLB/cricket match-level stats, but expressed as stat indices (goals, corners, shirt numbers, player props), not win/lose binaries. Little direct overlap with binary venues; only crude hedges (e.g. total-goals index vs. over/under markets elsewhere). No politics/crypto/macro on prod (devnet-only "Trump electoral votes" test market).

## Shared liquidity
- Own order book + vAMM + MLP vault; independent of other prediction venues. Shares only code lineage with Drift (separate deployment, separate liquidity) [M].

## Suspicious content
- None observed. Bundle and pages contained no instructions to AI agents.

## Open questions
- Is dlob.prod.mash.trade still serving (any region)? Is the program account active on mainnet and does it have open interest?
- Does the app expose a public REST/WS price feed or a replacement for the dead docs site?
- Is activity after Jan 2026 meaningful?

## Sources
- https://mash.fun/ and https://app.mash.fun/ (HTML, 2026-10-19) [H]
- https://mash.fun/assets/index.zZ9bGmLR.js and https://app.mash.fun/assets/index.hUcflL4w.js (front-end bundles, URLs/strings only) [H]
- https://predictionindex.xyz/ecosystem (entry "Mashdotfun") [H/M]
- https://europeangaming.eu/portal/latest-news/2025/12/04/197836/mash-fun-adds-new-sports-perps-markets/ (403 on direct fetch; content via search summary only) [M]
- https://hipther.com/gaming-and-entertainment-europe/2026/01/16/105307/mash-fun-expands-crypto-sports-betting-with-player-props-hits-1-million-in-trading-volume/ (headline only) [M/L]
- https://airdropbee.com/mash-airdrop/ (third-party, updated 2026-01-18, airdrop "Rumor") [L/M]
- https://docs.mash.fun/s/home (does not resolve) [H, negative]
