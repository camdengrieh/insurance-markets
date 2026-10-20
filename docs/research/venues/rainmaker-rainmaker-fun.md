# Rainmaker (rainmaker.fun) - venue spec for the cross-venue aggregator

Researched 2026-10-19. READ-ONLY: WebFetch of the public marketing pages, `robots.txt`, `sitemap.xml`, and plain GETs of the homepage, `/terms`, `/disclaimer` (User-Agent `insurance-markets-research/0.1`). No account, wallet, signing or POST. I did NOT probe `/api/` because `robots.txt` disallows it.

Tags: **H** = read first-hand this session (cited); **M** = small-model page summary or my inference; **L** = weak or stale.

Limitation: the shared WebSearch budget was exhausted before my first search, so there is no independent third-party coverage (funding, team, token stats, X account content). Everything below comes from rainmaker.fun itself.

---

## 0. Bottom line

1. **Rainmaker is not a venue.** It is a consumer front-end and autonomous-trading service ("AI sports trader") that places orders on **Polymarket** from the user's own Polymarket wallet. It has no order book, no market creation, no settlement, no collateral of its own (H: homepage "Every trade executes from users' own Polymarket wallets"; "Settled on Polymarket").
2. **Liquidity is 100% shared with Polymarket**, so it can never be an independent arbitrage leg. Polymarket is already covered by the parallel workflow.
3. **No public developer API.** No docs site, no GitHub link, no API pages. Sitemap lists only marketing pages. `robots.txt` disallows `/api/` (H).
4. **Live as of 2026-10-19.** Homepage lists settled signals up to Oct 18, 2026 (H). The product is also moving fast: the homepage is tennis (Backspin+), while other pages (`/how-it-works`, `/track-record`, `/ai-sports-trading`) describe an MLB agent "C9"/"Auto", and the nav shows NFL and Tennis tabs (M/H).
5. **Value to us: signal source only, and weakly.** The track record is self-reported, partially hidden, and open positions are withheld. It could at most be a "who else is trading these Polymarket tennis/MLB markets" crowding indicator (the homepage shows "125 wallets" per signal). adapter_priority = **skip**.

---

## 1. Is it still live? (2026)

| Evidence | Result | Tag |
|---|---|---|
| `GET https://rainmaker.fun/` | HTTP 200, Next.js on Vercel, `date: Mon, 19 Oct 2026` | H |
| Homepage signal list | "Tour events 33 signals, Jul 20 - Oct 18"; latest entry "Golubic vs Hontama, Oct 18, 7:49 PM, 69c fill, +40.0%" | H |
| Homepage headline stats | "Backspin 109-58, 65.3% win rate", "+$126,000 in wins", US Open 52 signals Aug 30 - Sep 14 | H (as claims) |
| `/track-record` (WebFetch) | "38-17 across 55 settled MLB signals (Auto model)", signals since Jun 1 2026, newest Aug 15 | M (page appears to be an older/different cut; inconsistent with the homepage) |
| `sitemap.xml` | `/`, `/track-record`, `/performance`, `/how-it-works`, `/ai-sports-trading`, `/polymarket-ai-trading-bots`, `/retail-onboarding`, `/terms` | H |
| Social | Twitter meta `@rainmakerdotfun`; Discord invite link on page | H |

**still_live = true.** The hint "108-58" is out of date; homepage now reads 109-58 (H).

---

## 2. Kind and market model

- **Kind:** broker/automation front-end ("agent that trades Polymarket for you"). Not a venue.
- **Market model:** whatever Polymarket's is: binary YES/NO outcome tokens (ERC-1155 conditional tokens) on a CLOB; each Rainmaker signal links to a Polymarket market (e.g. `polymarket.com/sports/atp/games?_q=...`) (H for links, M for token model which is Polymarket's, covered elsewhere).
- **Sports covered:** ATP/WTA tennis (Backspin+, live in-play), MLB (C9/Auto, per other pages), NFL tab in the nav (M). Entry prices on the homepage cluster at 52-70c (and one 88-90c), exits via take-profit (TP) or settlement (H).

## 3. Chains and collateral

- NOT FOUND on Rainmaker (searched: homepage text, `/terms`, `/how-it-works`, `/polymarket-ai-trading-bots`, `/ai-sports-trading`). Underlying venue is Polymarket (Polygon, USDC-family collateral per the Polymarket workflow's notes, not re-verified here).
- Funding: "fund with a card or crypto, starting at $20" (M: WebFetch summary of homepage/ai-sports-trading).
- `$RAIN` is a separate **Solana** token (token address labelled "Solana" on the homepage; DexScreener link `dexscreener.com/solana/69au8dkw...`). Perks claimed: lower trading fees, priority fill when a signal fires for many wallets, higher referral cut, "leverage" (H as claims). Leverage is not defined anywhere and the Terms (draft) do not say whether it exists (M).
- Homepage JS bundle references a `PrivyProvider` (H: string in page source), so the login/wallet layer is probably Privy embedded wallets plus a Polymarket wallet (M, inference; not documented).

## 4. Read API

- `exists`: **none**. NOT FOUND (searched: sitemap, robots.txt, homepage links, `/api`, `/docs` returned 404 pages, WebFetch of all marketing pages). `/api/` is `Disallow`ed in robots.txt so I did not probe it. The frontend evidently calls internal JSON endpoints under `/api/` (M, inference), which are not a supported integration surface and robots-disallowed.
- Only machine-readable surface: server-rendered HTML with signal rows (market label, team, entry timestamp, fill price in cents, ROI %, W/L, link to Polymarket market; some rows "hidden to protect proprietary signals"). Saved a stripped text copy as `docs/research/fixtures/rainmaker-rainmaker-fun/homepage-visible-text-2026-10-19.txt` (not an API response).
- Open positions are explicitly excluded from the record "to protect the model's live edge" (M, `/track-record`). So there is no real-time signal feed.
- For actual prices/books/trades/resolution of the same markets, use Polymarket's APIs (Gamma/CLOB/Data), covered by the other workflow.

## 5. Trade path

- For us: **none**. Rainmaker offers no order API. Terms (draft) restrict automated access: "Users may access the Products by automated means only through Strategies deployed in the Application" (§15(j)) and ban reverse engineering/bots (§15(c)-(d)) (M: WebFetch summary of /terms).
- For Rainmaker itself: orders are placed by an agent from the user's Polymarket wallet; "Rainmaker is authorized to trade from it" (H/M). Signing delegation is not documented; the Terms draft has an unfilled placeholder at §3(c) describing a planned "scoped signer that can place orders but not withdraw" (M).
- PayBox reachable: **no** for Rainmaker. A PayBox EVM wallet could trade the same markets only by going to Polymarket directly (CLOB signed orders via EIP-712; separate workflow). Nothing to adapt here.

## 6. Fees

- No public fee schedule. Terms §6 (draft) say fees apply only to "Net Profit of settled winning positions"; no fee on losing positions; fee split on-chain at settlement before funds reach the user; venue, gas and bridging costs are the user's (M). Fee Schedule URL is a bracketed placeholder.
- Homepage $RAIN slider shows "Holder fee 11.5%" at a default 250 on a 0-1000 scale; with the example "$88.50 kept from $100" (H for text, M for interpretation: looks like a ~11.5% performance fee on profit at that holder tier; higher for non-holders). Treat as unverified.
- Polymarket's own taker fees on sports markets still apply to the underlying order (not re-verified here; covered by Polymarket workflow).

## 7. Resolution

Entirely Polymarket's (UMA optimistic oracle / sports resolution rules per the Polymarket workflow). Rainmaker adds no resolution layer. Extra risk: Rainmaker-specific ones are agent mis-execution (Terms §4(d)/§25(f)), and an unrecallable order after revocation (§4(e)).

## 8. Geo, ToS, automation

- No country list. Users must meet each "Supported Venue's" eligibility rules, no VPN/proxy evasion, 18+, sanctions bar; §19 references US rules on leveraged retail commodity products (M, /terms WebFetch).
- Non-custodial claim: "Rainmaker does not hold, custody, control, or take possession of your funds" (M quote of §2).
- Delaware law, binding ICDR arbitration seated in Los Angeles, liability cap greater of $100 or 12 months of fees (M).
- Terms are a **draft with unfilled placeholders** (fee URL, coverage terms URL, signing architecture, revocation timing, tier verification, registered address, last-modified date) (M).
- `robots.txt` disallows `/api/`, `/r/`, `/cashout`, `/level-up`, `/godview`, etc. (H).
- Homepage FAQ "Is Rainmaker legal? Yes." is the company's own claim (H as claim, unverified).

## 9. Liquidity

- Rainmaker volume/TVL/OI: NOT FOUND (searched: all marketing pages; "$126,000 in wins" and "125 wallets" per signal are the only numbers, self-reported, 2026-10-19). Wallet counts per signal on the homepage are about 47-132 for US Open signals (H as claims).
- Real liquidity is Polymarket's.

## 10. Event overlap and arbitrage relevance

Tennis (ATP/WTA match winners) and MLB game winners, in-play. These overlap with Polymarket, Kalshi sports, and sportsbook lines. But Rainmaker is a Polymarket client, so arbitrage exists between **Polymarket and other venues**, not against Rainmaker. **Shares liquidity with Polymarket: yes, entirely.**

## 11. Credibility notes (for the signal-source idea)

- Record is self-reported, hidden rows ("This trade is hidden to protect proprietary signals"), open positions omitted, ROI "summed per-trade", losses counted as -100% (H/M). Treat as marketing, not evidence. Pages disagree with each other (tennis vs MLB headline, 109-58 vs 38-17), probably different time/model cuts.
- Entry prices are mostly 52-62c fills with +30-60% ROI wins (H): looks like a live in-play momentum/mean-reversion strategy on Polymarket tennis. Not needed as an adapter; if wanted, replicate edge from Polymarket's own data.

## 12. Open questions

- Whether Rainmaker uses Polymarket's Builder Program / builder code (would make its volume attributable on Polymarket's builder leaderboard). Not stated on its pages (NOT FOUND).
- Signing architecture (Privy embedded wallet vs Polymarket proxy/Safe plus session signer).
- Whether `/performance` exposes anything beyond what the homepage shows (did not fetch, uncertain if it is JS-only).

## Sources

- https://rainmaker.fun/ (homepage HTML, 2026-10-19) - H
- https://rainmaker.fun/terms (WebFetch summary) - M
- https://rainmaker.fun/disclaimer (fetched, no extractable text) - H
- https://rainmaker.fun/how-it-works, /track-record, /ai-sports-trading, /polymarket-ai-trading-bots, /retail-onboarding (WebFetch summaries) - M
- https://rainmaker.fun/robots.txt, https://rainmaker.fun/sitemap.xml - H
- Fixture: docs/research/fixtures/rainmaker-rainmaker-fun/homepage-visible-text-2026-10-19.txt
