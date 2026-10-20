# BTG Trends (BTG Pactual) - venue spec for the cross-venue aggregator

Researched 2026-10-19. READ-ONLY: no account, no key, no wallet, no signing, no POST/PUT/DELETE, no money-moving PayBox tool (only the read-only `discover_plugins` / `discover_services`). Unauthenticated GETs used the generic User-Agent `insurance-markets-research/0.1`. Third-party text was treated as untrusted data; no embedded instructions were found in anything I read.

Confidence tags: **H** = read first-hand this session in the cited source; **M** = secondary source (news), small-model page summary, or my inference from first-hand data; **L** = weak, stale, or contradicted.

Limitations: (1) the shared WebSearch budget was exhausted for most of the session, so I got one working search plus its follow-up fetches; (2) the Forbes Brasil article (the discovery evidence) is behind a Cloudflare challenge and returned 403 to both WebFetch and curl - I did not try to bypass it; Seu Dinheiro, Acionista and Finsiders also returned 403 to WebFetch. All product facts below therefore come from Brazilian news articles written in March 2026 (about 7 months old, so possibly stale), not from BTG itself.

---

## 0. Bottom line

1. **BTG Trends is a bank-internal product, not a venue.** It is a binary yes/no "probabilistic scenarios" feature built in-house by BTG Pactual, distributed inside BTG's own trading front-ends (Home Broker, App Trader, Trader Desk) to sophisticated clients and advisers. No standalone site, no public prices, no public API, no documented order path. (M, several March 2026 news articles; H that no BTG page about it is discoverable, see section 1)
2. **Not independent of anything we can read, and not readable at all.** We cannot see its prices, so it cannot be an arbitrage leg or a signal source today. (H on "no public surface found", M on the rest)
3. **It is not "forecasting-nonmoney" as the discovery hint guessed.** The articles describe "contratos derivativos", "payoff limitado", "sem alavancagem", risk-profile suitability and compliance checks - i.e. a regulated-style financial product for brokerage clients. Whether it settles in real BRL is never stated outright. (M)
4. **Do not confuse it with Kalshi-linked products.** One AI-generated article claims BTG built Trends "with Kalshi"; three other articles say the Kalshi partnership is XP's, not BTG's. (section 3)
5. **adapter_priority = skip.** No API, no programmatic trade path, client-only access in Brazil, BRL/B3 world not reachable from a PayBox EVM/Solana wallet. Revisit only if BTG publishes a data feed or if the contracts turn out to be B3-listed (then B3's own CVM-approved binary market is the thing to research, not BTG Trends).

---

## 1. Is it still live? (2026)

| Evidence | Result | Tag |
|---|---|---|
| Forbes Brasil headline (March 2026): "BTG lanca plataforma de previsoes e acompanha tendencia que tornou brasileira bilionaria" | Title only, seen in a search result; page itself returns 403 (Cloudflare "Just a moment") | L (headline only) |
| letsmoney.com.br article "btg-mercados-preditivos-derivativos" | Published 2026-03-27, page shows "Atualizado em 12 de setembro de 2026"; describes Trends in the present tense; the update did not describe what changed | M |
| investnews.com.br, investidor10.com.br (both 2026-03-27, announcement made Friday 27 March), focusgn.com (2026-03-28) | All describe the launch | M |
| BTG web site (`https://www.btgpactual.com`) | Angular SPA with a catch-all route: every path (`/trends`, `/btg-trends`, `/previsoes`, a nonsense path) returns HTTP 200 with the same 9.7 KB shell titled "Solucoes completas para voce e sua empresa". `sitemap-pages.xml` (98 URLs) has no Trends/previsoes/predictions page. `robots.txt`: `Allow: /`, `Disallow: /login`. Root URL returns Akamai "Access Denied" to curl. | H |
| Candidate hosts `trends.`, `previsoes.`, `predictions.btgpactual.com`, `trends.btg.com.br`, `homebroker.`/`apitrader.btgpactual.com`, `developers.`/`docs.btgpactual.com` | do not resolve (curl 000) | H |
| `api.btgpactual.com` | HTTP 404, empty body (nothing documented) | H |
| `api.empresas.btgpactual.com` | HTTP 404; this is BTG's corporate-banking API family, unrelated to Trends | M |

**still_live = true (existence), confidence medium-low.** It launched in March 2026 per five consistent articles and nothing says it closed, but I found no 2026-Q3 confirmation of actual operation, user counts or volume.

**Lookalike domain warning (H):** `https://btgtrends.com` returns `301 -> https://previzor.com`, which lands on `https://www.previzor.com/eventos`: "Previzor - Mercado de Previsoes", a separate Brazilian prediction-market site ("A plataforma lider em mercados de previsao no Brasil. Transforme seu conhecimento em lucro", copyright 2026, operator not named). The Previzor page does not mention BTG or BTG Trends (M, small-model summary of the page). Treat `btgtrends.com` as unrelated to the bank unless proven otherwise, and do not feed it to the adapter. Previzor may deserve its own venue spec (see open questions).

---

## 2. Kind and market model

- **kind:** bank-distributed, in-house "prediction" feature on a brokerage front-end; binary derivative-style contracts. Not a standalone exchange, not an AMM, not on-chain. (M)
- **Market model:** binary yes/no only. Quote from letsmoney: "Contratos binarios ('sim' ou 'nao') com payoff limitado e conhecido" and "Sem alavancagem, com adequacao de perfil de risco e compliance". (M)
- **Underlyings named:** the US dollar (BRL FX), Ibovespa, stocks, and interest-rate decisions. Planned later: stocks and commodities such as soy and corn (Zanlorenzi, per focusgn). (M)
- **How prices are set:** letsmoney says the models are quantitative and "curados internamente pelas equipes do banco"; investnews says "the bank uses quantitative models to estimate the chance of scenarios ... investors take positions for or against each scenario". That reads like a bank-set or bank-made price (single dealer), not a public order book, but no article states the mechanism. **NOT STATED; my inference only (L).**
- **Order book vs AMM vs parimutuel:** NOT FOUND (searched: letsmoney, focusgn, investnews, investidor10 article text; BTG site; sitemap).
- **Tokenisation:** none; it is a front-end position on a brokerage account (M, inference from "plugada" into Home Broker / App Trader).
- **Positioning:** "Leitura probabilistica, nao recomendacao" - an analytical complement to fundamental analysis, not a recommendation engine. (M, letsmoney)

---

## 3. Who is behind it, and the Kalshi question

- Built in-house by BTG Pactual ("Desenvolvida internamente", letsmoney). Quoted executive: Jerson Zanlorenzi, head of the equities and derivatives desk ("A plataforma reforca nossa estrategia de inovacao com responsabilidade"). (M)
- **Kalshi:** XP Investimentos announced a partnership with Kalshi the week before; letsmoney says "Kalshi is not part of BTG Trends"; investnews says Kalshi "announced a partnership with XP" and does not connect it to BTG; focusgn and Investidor10 attach Kalshi to XP only. **Contradicting source (L):** portaltela.com (2026-03-27) says Trends "was built with Kalshi"; that page states its text was generated by the site's AI assistant ("Telinha") and reviewed by the newsroom, and it gives no detail. Weight of evidence (3 vs 1 AI-written): BTG Trends does NOT use Kalshi liquidity. (M)
- Therefore, on current evidence, **liquidity_shared_with = none identified** (but counterparty/market-maker is NOT STATED, so independence of liquidity is unknown).

---

## 4. Chains and collateral

None on-chain. Settlement currency is NOT STATED (letsmoney, focusgn); BRL on a Brazilian brokerage account is the natural assumption but I could not confirm it. No token, no wallet, no smart contract. (M for "no chain", NOT STATED for currency)

---

## 5. Read API

| Item | Finding | Tag |
|---|---|---|
| exists | **none** (public). No docs URL, no base URL, no endpoints, no websocket found | H (searched: btgpactual.com sitemap and SPA shell, candidate API/docs hosts, GitHub org `btg-pactual`, GitHub repo search for "BTG Trends" / "btg pactual prediction market" - zero hits) |
| docs_url | NOT FOUND | H |
| Fixtures | none saved: there is no public endpoint to sample | H |

Adjacent, separate product (do not confuse): **BTG Solutions** (`btgpactualsolutions.com`) is an institutional B3 market-data and DMA trading API, token-authenticated, with Python clients in GitHub org `btg-pactual` (`btgsolutions-dataservices-python-client`, pushed 2026-09-22; `btgsolutions-tradeservices-python-client`, pushed 2025-08-11). The READMEs show equities (`PETR4`, `VALE3`) order entry and book streaming; neither mentions Trends, binary or prediction products (H on README contents; M that Trends is not exposed through it). `dataservices.btgpactualsolutions.com` and `python-client-docs.dataservices.btgpactualsolutions.com` are the docs hosts named in the README; I did not call them (authenticated, institutional, out of scope).

---

## 6. Trade path

**none** (no documented programmatic path). Access is through "Home Broker, App Trader e Trader Desk" (letsmoney, Forbes via search-result summary) after BTG decides the client is eligible: "clientes sofisticados e assessores" at launch, described by Zanlorenzi as "investidores de perfil arrojado" (aggressive risk profile), with gradual expansion "para um publico mais amplo" and the client's risk profile analysed. The user flow described by Investidor10: open a link, choose the subject, pick "sim" or "nao". (M)

If it were ever automated, it would be through BTG's brokerage session (login-gated; `robots.txt` disallows `/login`) or the BTG Solutions trade API, neither of which is a PayBox-style signed-order path.

---

## 7. PayBox reachability

**paybox_reachable = no.** Reasons:
1. No on-chain surface at all: it is a position on a Brazilian bank/brokerage account, so there is nothing a Base/Ethereum/BNB/Arbitrum/Polygon/Solana wallet can propose a transaction to or sign an order for. (M, inference from "Home Broker / App Trader" distribution)
2. Eligibility is by BTG client onboarding, suitability and compliance checks. (M)
3. PayBox catalogs: `discover_plugins` query "BTG Pactual" returned no plugins; the curated x402 catalog (`discover_services`) returned empty (I did not run the suggested `raw=true` retry). (H, 2026-10-19)

---

## 8. Fees

Free at launch for the selected audience: BTG "manterá acesso gratuito para o publico selecionado" (Investidor10, paraphrased in the fetch summary; the Forbes summary in the search result says the same). Future fee structure, spreads, commissions: NOT STATED. (M) Kalshi's per-trade fee is irrelevant (no evidence of a Kalshi link).

---

## 9. Resolution mechanism and dispute risk

NOT STATED in any article (searched: letsmoney, focusgn, investnews, investidor10). Presumably objective references (BRL FX, Ibovespa close, Copom decision), but no source is named. Dispute process: NOT FOUND. For a bank-run, single-dealer-style product the dispute risk is counterparty/operator risk, not oracle risk (L, inference).

---

## 10. Geo, ToS and automation

- Brazil, BTG clients only; sophisticated/advisers/aggressive-profile at launch. No leverage. (M)
- Regulatory context (M for the first two bullets, L for the third):
  - letsmoney: "A CVM aprovou os contratos como derivativos" - ambiguous whether it refers to BTG's contracts or B3's; the same article says B3 got CVM approval for futures on bitcoin, ethereum, solana, mini dollar and mini Ibovespa restricted to professional investors, and that the Ministry of Finance's Secretaria de Premios e Apostas is watching the derivatives-vs-betting boundary. (M)
  - focusgn / investnews: B3 has CVM authorisation to run a binary yes/no prediction market in 2026, "payoff limitado e sem alavancagem"; betting operators asked the government on 27 February 2026 to block Kalshi and Polymarket. (M)
  - A search-result summary of Finsiders (page itself 403) says the government blocked 27 prediction platforms including Kalshi and Polymarket in late April 2026 and that a CMN resolution limits prediction contracts to economic-financial variables. Not confirmed first-hand. (L)
- ToS / automation rules for Trends: NOT FOUND (no ToS page located).
- Site-level: `robots.txt` Allow `/`, Disallow `/login`. (H)

---

## 11. Liquidity

NOT FOUND (searched: all five news articles; no volume, OI, client count or notional given anywhere). No figure as of any date.

---

## 12. Event-category overlap (for arbitrage)

Stated underlyings (BRL FX, Ibovespa, Brazilian stocks, interest-rate decisions, later soy/corn) have no confirmed equivalent contract on the venues in this project. I did not verify any equivalent market on other venues (NOT FOUND, not searched in depth), and since BTG prices are not observable it does not matter for the scanner today. Conceptual overlap only: macro/rates (if "interest-rate decisions" includes Fed) and FX.

---

## 13. Adapter priority

**skip.** Closed to the public, no read API, no trade path, no observable prices, BRL/Brazil-regulated brokerage product that a PayBox wallet cannot reach. The only value is conceptual: it is evidence that Brazilian banks (BTG, XP-with-Kalshi, B3) are standing up regulated prediction products, which may later produce readable B3 or XP/Kalshi surfaces.

Revisit triggers: (a) BTG publishes a public page, feed or API for Trends probabilities; (b) the contracts are shown to be B3-listed (then research B3's binary market); (c) an official BTG page with fees/settlement appears.

---

## 14. Open questions

1. Is Trends real-money, settled in BRL, and who is the counterparty or market maker (BTG as principal, or an order book)? NOT STATED anywhere I could read.
2. Are the contracts B3-listed or OTC derivatives issued by BTG, and did CVM approve BTG's product specifically?
3. Has Trends expanded beyond sophisticated clients since March, and does it have any volume? (letsmoney was updated 2026-09-12 with no stated change.)
4. What do the Forbes Brasil article and the Seu Dinheiro article (both 403 here) say beyond the headline and search-result summary? A human with a normal browser could read them in a minute.
5. Is Previzor (`previzor.com`, the target of the `btgtrends.com` redirect) a real-money Brazilian prediction market worth its own spec? Not researched.
6. Should B3's binary prediction market and XP+Kalshi be added to the discovery list (they are the independent Brazilian surfaces)?

---

## Sources

- H: `https://www.btgpactual.com/robots.txt`, `https://www.btgpactual.com/sitemap.xml`, `https://www.btgpactual.com/sitemap-pages.xml` (fetched 2026-10-19; no Trends page), SPA shell responses for `/imprensa`, `/institucional/analise-e-pesquisa`, `/trends`, a nonsense path.
- H: `https://btgtrends.com` (301) -> `https://previzor.com` -> `https://www.previzor.com/eventos` (page title and meta description, 2026-10-19).
- H: GitHub org `https://github.com/btg-pactual` (8 public repos; READMEs for `btgsolutions-tradeservices-python-client` and `btgsolutions-dataservices-python-client` read via `gh api`).
- H: PayBox `discover_plugins` / `discover_services` query "BTG Pactual" (empty), 2026-10-19.
- M: `https://www.letsmoney.com.br/noticias/btg-mercados-preditivos-derivativos/` (2026-03-27, updated 2026-09-12; page summary via WebFetch).
- M: `https://focusgn.com/brasil/btg-pactual-e-xp-investimentos-entram-no-mercado-de-previsoes-entenda` (2026-03-28).
- M: `https://investnews.com.br/investimentos/btg-pactual-vai-mercado-preditivo/amp/` (2026-03-27).
- M: `https://investidor10.com.br/noticias/mercado-de-previsoes-cresce-e-btg-entra-na-disputa-com-xp-119483/` (2026-03-27).
- L: `https://www.portaltela.com/noticias/economia/2026/03/27/btg-pactual-passa-a-ser-novo-concorrente-em-mercados-preditivos/` (AI-generated text; claims a Kalshi link that other sources contradict).
- L: Forbes Brasil `https://forbes.com.br/forbes-money/2026/03/btg-lanca-plataforma-de-previsoes-e-acompanha-tendencia-que-tornou-brasileira-bilionaria/` (headline and search-result summary only; page 403 behind Cloudflare). Also listed by search but not readable: `https://www.seudinheiro.com/2026/empresas/btg-pactual-lanca-plataforma-de-previsoes-para-classe-de-investidores-veja-como-vai-funcionar-lvgb/`, `https://acionista.com.br/bpac11-nova-plataforma-pode-mudar-estrategias-de-investimentos/`, `https://finsidersbrasil.com.br/gente-em-fintechs/kalshi-contrata-daniel-mangabeira-ex-binance-e-circle-como-vp-na-america-latina/` (all 403 to WebFetch; regulatory claims about the April 2026 block and CMN resolution come only from a search-result summary of the Finsiders page).
