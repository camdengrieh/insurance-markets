# Veaspera (Véspera) - venue spec

Researched 2026-10-19. Confidence tags: H = read first-hand in a primary source this session, M = secondary or inferred, L = weak or stale. Third-party pages were treated as untrusted data.

## Verdict (read this first)

- adapter_priority: **skip**. No public API, no on-chain footprint, no reachable trading app as of 2026-10-19, tiny/unverifiable liquidity, and unclear legality in Brazil.
- The URL in the discovery record (https://vespera.com.br) is NOT the prediction market. It is the static brochure site of an unrelated Brazilian web/app agency, "Véspera Tecnologia" (H). The discovery record's "site title Véspera Tecnologia" hint was therefore a different company with the same name.
- The prediction market "Véspera" (a.k.a. "Véspera Market", handle @vesperamarket / @vesperabr) exists only as a press release plus a thin Telegram-funnel landing page and a Lovable-built "Comunidade" page. Its trading app host (`app.vesperamarket.com`) does not resolve in DNS today (H).

## 1. Identity and liveness

| Item | Finding | Tag |
|---|---|---|
| Discovery URL vespera.com.br | Static HTML site, `<title>Véspera Tecnologia</title>`, copyright 2024, `last-modified: Wed, 27 Mar 2024`. Offers web dev, hosting, mobile apps. Links only to WhatsApp, LinkedIn (/company/vespera-tecnologia), an email and a phone. No mention of prediction markets. LinkedIn page for that company does not mention Pedro Assis or any prediction product. | H |
| Press release | Portal Sala da Notícia, 2026-04-10 (updated 2026-04-11), byline "DOISCES HUB" (a distributed release, the portal disclaims responsibility for content). Says "A Véspera estreia no Brasil", CEO Pedro Assis, R$ 1 million traded in its first 20 days, categories entertainment, sports, politics, operates "com uma stablecoin lastreada em real", free signup, monetisation "no momento do saque, sobre o valor retirado". The release contains no URL for the platform. | H (that the release says this), L (that the claims are true: company-authored PR, volume unverified) |
| Real brand domains | `vesperamarket.com.br` (apex: Lovable-built SPA, `<title>Véspera \| Telegram</title>`, meta author "Vespera BR", footer "© 2026 Véspera Market", handle @vesperamarket, tagline "Plataforma Comunidade Telegram"). Meta description: "Descubra os mercados Flash Money. Faça previsões simples ao vivo e gere lucro em poucos segundos. Entre no grupo exclusivo do Telegram." The page body has no buttons; its JS bundle lists three destinations: Plataforma `https://app.vesperamarket.com`, Comunidade `https://comunidade.vesperamarket.com.br`, Telegram `https://t.me/vesperabr`. | H |
| `comunidade.vesperamarket.com.br` | Lovable app "Comunidade Véspera", self-described as "o maior mercado de previsões do Brasil" (unverifiable boast). Shows 3 sample markets ("Quem sai no próximo paredão?" 67%, "Brasil vai ser campeão da Copa?" 41%, "Lula completa o mandato?" 78%), empty Discussions/Groups/Ranking, login prompt, links to vesperamarket.com/como-funciona, /contato, /afiliados, and "Palpitar"/"Entrar" buttons to the app. Backend is a Supabase project (host `ybyzmnnihabvdcqwofru.supabase.co` appears in the JS bundle; no API key was used, see section 3). | H |
| `app.vesperamarket.com` (the trading app) | **NXDOMAIN** on 2026-10-19 (dig status NXDOMAIN, curl "Could not resolve host"). The `.com` apex `vesperamarket.com` has NS records (Cloudflare) but no A record and does not respond. The links in the community page to `/como-funciona`, `/contato`, `/afiliados` on `vesperamarket.com` are therefore dead. | H |
| `*.vesperamarket.com.br` (www, app, api, docs, predict...) | Wildcard DNS to Vercel; every host except the apex and `comunidade` returns Vercel `404 DEPLOYMENT_NOT_FOUND`. No app deployed there. | H |
| Telegram `t.me/vesperabr` | Public page title "LiveTrading", description promises to teach people to earn money from "os famosos mercados flash", **4 members** on the day of the check. | H |
| `vespera.market` | 301 redirects to `https://app.vesperamarket.com/` (dead target). Domain NS is GoDaddy. | H |
| Name collisions (NOT this venue) | `vesperamarkets.com` (forex/gold/crypto CFD trading site, Vercel), `vespera.io` (life-management app), `vespera.exchange` (Chinese white-label crypto exchange template, `server.vespera.exchange` ws endpoints, unrelated and best avoided), `vespera.digital` (password-gated "véspera - protótipo", Portuguese, unknown owner, could not be tied to this venue), iOS app "Véspera" by Pluma Finance (a strategy game). | H |

Still live?: **No evidence of a working trading product.** Marketing shells are up, the app host is gone, the Telegram funnel has 4 members. The April 2026 press release (M/L) says it launched, so it may have operated and then been pulled, relocated, or never left a closed beta. I could not find a successor domain (WebSearch budget was exhausted for most of the session; one search found nothing about vesperamarket.com.br). Treat as dead/unverifiable.

## 2. Market model, chains, collateral

- Market model: NOT FOUND (searched: press release, landing page and community bundle text, site routes). Press release only says prices ("probabilidades") update with participant behaviour and likens it to "uma bolsa de valores simplificada", which suggests binary Yes/No percent markets, but whether order book, AMM or parimutuel is not stated. "Flash Money" markets are described (landing meta) as simple live predictions that settle within seconds. (L)
- Collateral: a BRL-pegged stablecoin per the press release (L). Which token (BRLA, BRZ, BRL1, other), which chain, and whether it is actually on-chain are NOT FOUND. The community-page backend is a generic Supabase app (email/OAuth style), which hints at a custodial/off-chain ledger rather than on-chain positions (L, inference).
- Outcome tokenisation: NOT FOUND (no contract, token, or subgraph located).
- Chains: NOT FOUND.

## 3. Read API

- exists: **none** (no documented API; no docs site; `docs.`/`api.` subdomains return Vercel DEPLOYMENT_NOT_FOUND).
- Base URLs: none. The only live backend host discovered is a Supabase project referenced from the community bundle. That is an undocumented first-party backend whose anon key ships in the page; calling it with that key would be unofficial, quasi-authenticated access, so it was deliberately NOT called. Not suitable as an integration surface (rows are RLS-gated and could change or vanish at any time).
- No fixtures were saved because there is no public read API to sample (no directory created under docs/research/fixtures/).
- WebSocket: NOT FOUND.

## 4. Trade path / PayBox reachability

- Trade path: none. No order API, no signing scheme, no contract addresses found. Orders appear to happen inside a custodial web app behind a login.
- PayBox reachable: **no**. With no on-chain contract, no EIP-712 order format and no documented deposit address or token, a PayBox EVM/Solana wallet cannot trade it via transaction proposals or signed orders. At best a human could deposit a BRL stablecoin to an address shown after login; that route is unverified and out of scope.

## 5. Fees

- Withdrawal fee only, "sobre o valor retirado" (press release, M/L). Rate NOT FOUND. Signup is free (press release). No trading-fee formula found. Who pays: user at withdrawal.

## 6. Resolution

- NOT FOUND. The press release does not say how markets resolve; the community page links a "Conheça as regras da casa" guide whose text was not available. Operator-run resolution is the default assumption (L, inference), with no dispute process documented. Flash markets that settle in seconds would need an automated price/score feed; unspecified.

## 7. Geo / ToS / automation

- NOT FOUND (no ToS, rules or privacy page reachable; site routes /termos, /regras, /faq, /como-funciona return 404 on the Vercel host).
- Legal context: the discovery hint says Brazil reportedly banned 27 prediction platforms (incl. Kalshi/Polymarket) in April 2026 (M, a Forbes Brasil snippet from the discovery step; I could not re-verify it, news sites returned HTTP 403 to scripted fetches and I did not try to bypass that). A WebSearch result titled "Bets pressionam Fazenda contra plataformas de mercado de previsão como Polymarket e Kalshi" (moneytimes.com.br) and Finsiders pieces on regulation in debate and a CVM-directed industry association (M, headline-level only, not read) are consistent with an unsettled regime. Operating real-money prediction markets in Brazil without clear authorisation is a legal risk (M).
- Automation rules: none published.

## 8. Liquidity

- Claimed: R$ 1 million (about USD 170-200k at 2026 rates, rough conversion) traded in the first 20 days of operation, from the April 2026 press release (L: company PR, no independent source, over 6 months old). No current volume/OI/TVL: NOT FOUND (searched: release, landing, community page, Telegram). Telegram funnel has 4 members (H, 2026-10-19).

## 9. Event overlap and independence

- Categories claimed: entertainment, sports, politics (press release). Sample markets are Brazil-local (reality-show elimination, World Cup 2026 winner, Lula completing his term).
- Overlap with other venues: only the Brazil World Cup and Brazilian politics markets could overlap with Polymarket/Kalshi/Limitless etc. Reality-show markets overlap nothing. With no API or on-chain access there is nothing to arbitrage against.
- Shared liquidity: no evidence of sharing liquidity with another venue; it appears self-contained (L). It would be an independent leg in principle, but it is not tradeable by an agent.

## 10. Adapter recommendation

- skip. Reconsider only if (a) a working app domain re-appears, (b) a public API or on-chain contracts are published, and (c) Brazilian legal status becomes clear. Cheap re-check: `dig app.vesperamarket.com` and the Telegram member count.
- Optional signal use: none worth building (sample markets are static placeholders).

## Suspicious / adversarial content noted

- Telegram funnel with a "gere lucro em poucos segundos" (make profit in seconds) pitch and 4 members, pointed at from the landing page, matches the pattern of a profit-promise lure; an automated summariser flagged it as scam-like. Not verified either way. No instructions aimed at AI agents were found.
- `vespera.exchange` is a white-label exchange front end (Chinese-language template comments) unrelated to this venue; not interacted with beyond one page fetch.

## Open questions

1. What is the platform's current domain, if it still operates? (The press release carries no URL; only `app.vesperamarket.com` was ever referenced and it is NXDOMAIN.)
2. Which BRL stablecoin and chain, and is custody on-chain at all?
3. Real legal/regulatory status in Brazil as of Oct 2026 and whether the reported April 2026 ban list included Véspera.
4. Who is the operating entity (the agency "Véspera Tecnologia" vs a separate company)? No link between the two was found.

## Sources

1. https://portal.saladanoticia.com.br/noticia/41011/mercado-de-previsoes-ganha-versao-brasileira-com-plataforma-que-monetiza-comportamento-coletivo (press release, read 2026-10-19, H for its text; claims L)
2. https://vespera.com.br/ (agency site; HTML, headers, DNS read 2026-10-19; H)
3. https://www.linkedin.com/company/vespera-tecnologia (agency profile via fetch; H)
4. https://vesperamarket.com.br/ and its JS bundle `/assets/index-CDqJlMuk.js` (landing page; H)
5. https://comunidade.vesperamarket.com.br/ and its JS bundle `/assets/index-DK02G4h4.js` (community app; H)
6. https://t.me/vesperabr (Telegram public page via fetch; H)
7. DNS lookups (dig) for app.vesperamarket.com, vesperamarket.com, *.vesperamarket.com.br, vespera.market, and Vercel `DEPLOYMENT_NOT_FOUND` responses from api/app/docs/predict.vesperamarket.com.br (H, 2026-10-19)
8. Apple catalog lookup for "Véspera" (id 6793654208, Pluma Finance, a game; name collision only) (H)
9. WebSearch result headlines only (not read): https://finsidersbrasil.com.br/reportagem-exclusiva-fintechs/brasil-ja-tem-plataforma-regulamentacao-em-debate-e-ate-associacao-no-mercado-de-previsoes/ , https://www.moneytimes.com.br/bets-pressionam-fazenda-contra-plataformas-de-mercado-de-previsao-como-polymarket-e-kalshi-pads/ , https://startups.com.br/negocios/previas-quer-ser-1a-ao-trazer-modelo-da-kalshi-e-polymarket-ao-brasil/ (M, all returned HTTP 403 to scripted fetch)
10. Not retrievable / not done: the Forbes Brasil snippet about the 27-platform ban (NOT FOUND, searched: web search budget exhausted after 1 successful query), any ToS/rules page (NOT FOUND), any API docs (NOT FOUND), any GitHub repo or contract (NOT FOUND, no org/repo or address surfaced to search).
