# Tippr (playtippr.de) - venue spec

Researched 2026-10-19. Verdict: **skip as a trading venue**. It is a free, no-money football tipping app, not a prediction market. Its only possible use is its published "Tippr-KI" match probabilities as a weak, tertiary signal, and that is not worth an adapter. adapter_priority: skip.

Confidence tags: H = read first-hand this session in a primary source; M = secondary or inferred; L = weak or stale.

## Liveness

- [H] playtippr.de returns HTTP 200; footer reads "(c) 2026 Tippr", "Zuletzt aktualisiert: 2026-10-14" (https://playtippr.de). Live as of 2026-10-19.
- [H] Pages carry current-week content (Bundesliga matchday 7, a Serie A fixture on 19 Oct 2026, a Champions League fixture on 21 Oct), so the site is actively maintained (https://playtippr.de/prognosen).
- [H] The Tippr-KI record page is dated "Stand: 14. Oktober 2026" (https://playtippr.de/tippr-ki).
- [H] Wikidata Q140011679 is "Tippr", described as "German football prediction game app", with inception 2026-05 and website playtippr.de. Last modified 2026-06-28 (https://www.wikidata.org/wiki/Special:EntityData/Q140011679.json).

## Kind and market model

- Kind: free social football tipping game ("Tippspiel"), freemium app for iOS and Android with a marketing site. [H]
- Users predict a match score inside private friend groups. Points are awarded for an exact score, goal difference or correct tendency (default 4/3/2, optional joker x2, "probability mode" that boosts underdog picks). [H]
- There are no markets, no order book, no AMM, no parimutuel pool, no outcome tokens, and no prices or odds. Tippr says it has "keine Wettquoten" (no betting odds). [H] (https://playtippr.de FAQ)
- Self-description: "ein Vorhersage-Spiel ohne finanzielle Einsaetze, Geldgewinne oder Wettquoten". [H]

## Chains and collateral

None. No chain, no token, no collateral. Terms of use section 3: "Es wird kein echtes Geld eingesetzt, gewonnen oder ausgezahlt." [H] (https://playtippr.de/nutzungsbedingungen)

## Read API

- exists: **none** (no public developer API).
- NOT FOUND (searched: homepage HTML and links, robots.txt, /nutzungsbedingungen; probed https://playtippr.de/api, /api/prognosen and /openapi.json, all 404; api.playtippr.de returned 521). No developer docs link anywhere on the site.
- The only machine-readable-ish public output is server-rendered HTML for the Tippr-KI forecast pages: https://playtippr.de/prognosen, /prognosen/bundesliga, /prognosen/tipphilfe, /tippr-ki. These are scrape-only. [H]
- Content of /prognosen on 2026-10-19: "200 gerechnete Spiele in 29 Ligen", forecasts frozen before kickoff, for example one Serie A match shown as 31 % / 28 % / 41 % (home / draw / away) and a "punktbester Tipp" score. Also 10,000-run season simulations per league (title, top 4, relegation). [H]
- Per the site, the model is the team's last five games combined with win probabilities from API-Football. It is a derivative of a third-party data feed, not independent price discovery. [H] (https://playtippr.de/tippr-ki)
- Websocket: none found.
- Fixtures: none saved. There is no API response to sample, and the HTML pages are 100-170 KB, over the 50 KB limit.

## Trade path

None. There is no order placement, signing scheme or wallet connect. Users can use the app without an account for basic tipping; there is no wagering. [H]

## PayBox reachability

- paybox_reachable: **no**. There is no on-chain or wager surface, so no EVM or Solana wallet can trade anything. [H]
- There is nothing for a transaction proposal or signed order to act on.

## Fees

No trading fees. Revenue is the optional "Tippr Pro" subscription (2.99 EUR/month, or 9.99 EUR/year with a 14-day trial) and ads, billed via the Apple and Google stores. [H] (https://playtippr.de FAQ)

## Resolution

There is no market resolution. Scores are scored automatically from live data, which the site attributes to API-FOOTBALL. [H] Dispute risk is not applicable.

## Geo, ToS, automation

- Not gambling per its own ToS (section 3). Minimum age is 16 for self-registration. [H]
- Terms last updated 2026-10-14. I found no explicit scraping or automation clause in the terms text. This is weak evidence, since I did a keyword search, not a full legal read. [M]
- robots.txt allows crawling and names many AI crawlers; it disallows only /auth/, /join/, /h/, /t/. [H] (https://playtippr.de/robots.txt)
- No geo-block was seen.

## Liquidity

None. There is no volume, OI or TVL. The site's own usage claims (marketing numbers, not verified): 1,209,002 tips submitted, 7,646 groups, 4.6 stars from 445 App Store ratings, "1.000+ Wettbewerbe", as shown 2026-10-19. [H as to the claim, L as to accuracy] These are social-game metrics with no market meaning.

## Event coverage and arbitrage overlap

- It covers football only: Bundesliga, 2. Bundesliga, DFB-Pokal, Premier League, La Liga, Serie A, Ligue 1, Champions League, Europa League, WM 2026, EM 2028, plus about 29 leagues for forecasts. [H]
- These overlap in subject matter with football match markets on other venues, but there is nothing to arbitrage against because Tippr has no tradable price.
- Possible signal use only: Tippr-KI 1X2 probabilities could be compared with other venues' prices. Its inputs are API-Football win probabilities plus recent form, so it is a derivative signal, likely correlated with bookmaker odds. Its published accuracy for Bundesliga 2025/26 was 45.3 % hit rate over 53 matches, +0.2 pp vs community. [H] This is not a differentiated signal.

## Shared liquidity

Not applicable. There is no liquidity.

## Priority

- adapter_priority: **skip**. It is not a prediction market (no money, no prices, no API, no wallet path). Re-check only if Tippr ever adds a real-money or token market, which would conflict with its stated "no gambling" position.
- Optional P2-style use: if a football-probability signal feed is wanted later, API-Football (the upstream source) or bookmaker-derived odds would be a better source than scraping Tippr HTML.

## Suspicious content

None observed. Only standard page content was read; no instructions aimed at AI agents were seen (robots.txt merely lists crawler user-agents).

## Open questions

- Whether a partner or press API exists, which could only be answered by contacting the operator (not done; read-only research).
- A full legal read of the ToS for automation limits. Only keyword checks were done.
- The WebSearch budget was exhausted, so no independent third-party coverage was checked; the facts above come from the site itself and Wikidata.

## Sources

- https://playtippr.de (homepage, FAQ, footer), fetched 2026-10-19 [H]
- https://playtippr.de/prognosen (Tippr-KI forecasts) [H]
- https://playtippr.de/tippr-ki (track record, method) [H]
- https://playtippr.de/nutzungsbedingungen (ToS, updated 2026-10-14) [H]
- https://playtippr.de/robots.txt [H]
- https://www.wikidata.org/wiki/Special:EntityData/Q140011679.json [H]
