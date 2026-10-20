# 15. Relationships between prediction markets: taxonomy, LP formulation, literature and evidence

Task key: `taxonomy-literature`. Written 2026-10-19 (harness date). All live reads were taken on the machine clock of **2026-10-18, 18:10 to 18:30 UTC** (one calendar day behind the harness date, same convention as docs/research/08). Read-only: public unauthenticated GETs only, no accounts, keys, signing or PayBox calls. Third-party text is treated as untrusted data.

Confidence tags: **H** first-hand (primary source read this session, or my own measured data), **M** secondary or inferred, **L** weak or stale. Anything older than six months at 2026-10-19 (before 2026-04-19) is flagged **STALE?**.

Builds on, and does not edit: `docs/research/10-aggregation-landscape.md` (matching pipeline, fee tables, gates), `docs/research/08-venues-polymarket-kalshi.md` (venue APIs, rules, fees), `docs/research/09-venues-onchain-clob.md` (native cross-venue hooks). Where I re-verified a claim from those files I say so.

---

## 0. Findings in brief

1. **One formalism covers all eight relation types.** Define the joint state space of everything the contracts can resolve to, including void states; each contract is a payoff vector over states. A price vector is arbitrage-free iff it lies in the convex hull of the payoff vectors. Kroer et al. (EC 2016): "Arbitrage-free prices are exactly the convex combinations of valid payoff vectors" (H, PDF text extracted locally and read in the relevant sections). Zhai and Shi (SSRN 7587019, 2026): "prices outside the convex hull of admissible payoff vectors admit arbitrage" and optimal portfolios come from integer programming (H, abstract via Crossref; full text not read). Section 4 gives the LP, the fee-adjusted and depth-aware versions, and a worked example.
2. **Only some relations are risk-free in payoff space, and only if the contract texts really coincide.** Within one market and one resolver (YES+NO, a negRisk partition, a ladder inside one event) the payoff identity holds by construction. Across venues or across events (types a, d, f) the identity is a judgement about rule text, source, cutoff and void payoff, and the 2026 incident record (section 8) shows it failing by up to 98 cents per share.
3. **Historically the money was in single-event partitions, not in clever logic.** Re-adding the figures in Saguillo et al. (H, my arithmetic): negRisk partitions $29.0M (73%), single YES/NO "conditions" $10.6M (27%), cross-market combinatorial arbitrage about $0.095M (0.24%) of the headline $39.59M, over 2024-04 to 2025-04 with zero fees (**STALE?**, pre-fee regime).
4. **2026 edge is thin, fast and fee-sensitive.** Durations: median 16 s (negRisk CLOB, Gebele-Mutzel-Matthes 2026), 3.6 s (single-market) and 16 s (combinatorial) on NBA (Cheng et al. 2026). My snapshot (section 6.3, 2026-10-18 18:11 UTC, 492 complete negRisk events on Polymarket): 8 events (1.6%) had a gross top-of-book gap below 1, 4 of them positive after taker fees; adjacent-rung ladder violations were rare (Polymarket 3 of 3,651 quoted pairs in within-event ladders, 2 of 271 cross-event implication pairs; Kalshi 0 of 7,274).
5. **Cross-venue gaps are real but dominated by semantic non-fungibility and lock-up.** 2 to 4 percent execution-adjusted deviations (Gebele and Matthes 2026), Polymarket-Kalshi spreads about 3 cents on average and 7 cents sustained before the 2024 election call, BTC threshold contracts 5.6 to 11 points away from option-implied digital prices with a roughly 4 hour half-life (Portnaya 2026, small **STALE?** sample).
6. **Resolution divergence is the dominant risk and I could measure it.** First-hand from both venues' public APIs: Khamenei "out" markets paid **$1.00** on Polymarket (UMA, two disputes, final 2026-03-04) and **$0.02** on Kalshi (death carve-out, scalar settlement); a Polymarket "new shutdown by Feb 14" market paid **NO** while Kalshi's "shut down on Feb 14" paid **YES**. Among the 1,000 highest-volume closed Polymarket markets with end date in 2026, **7.6% (16.2% of volume)** had at least one UMA dispute; disputed markets closed a median 100 h after their end date versus 3.6 h undisputed.
7. **Regulatory context verified.** CFTC Division of Enforcement advisory, Release 9185-26, 2026-02-25: real, and silent on automated trading, bots, market makers and arbitrage (H). March 2026 Polymarket/Kalshi integrity changes: both announced 2026-03-23 (M, law-firm summary). The only explicit automation rule I found is Polymarket US Rulebook (2026.09.30) Rule 5.2(i): automated systems "must implement pre-trade risk controls including order throttles, price collars, and kill switches" (H). No 2026 rule targeting cross-venue arbitrage found.
8. **Search limitation.** The session's shared WebSearch budget ran out after my first successful query (it surfaced arXiv 2605.00864 and 2604.24147 and confirmed 2601.01706), so everything else was discovered by direct fetches of known URLs, venue APIs, arXiv and Crossref metadata and Wikipedia reference lists. That biases the incident list toward what could be verified from primary APIs, and I list what I could not reach (section 11).

---

## 1. Method, sources and limits

- Papers: arXiv abstract and HTML pages; PDFs downloaded to the scratchpad and text-extracted with my own stdlib script (`pdftext.py`, FlateDecode streams). Crossref (`api.crossref.org/works`) used only to verify that a citation exists and read its registered abstract. The arXiv `export` API was used only to look up titles and IDs. After the one search that succeeded, no search engine was used (the budget error said not to work around it, and I did not).
- **How pages were read.** arXiv HTML and abstract pages, the CFTC, Venable, Federal Reserve, Becker, Bloomberg Law, Decrypt, CoinDesk, OddsShopper, Convex Lake and integrity.polymarket.com pages went through the WebFetch tool, which returns a model-written extraction for my prompt, not raw text. Polymarket and Kalshi docs, all venue and Deribit APIs, Crossref, the arXiv API and Wikipedia wikitext were fetched verbatim with curl. I re-asked the questions that carry load-bearing numbers and cross-checked against the earlier repo notes (doc 10 read Gebele and Matthes and Saguillo et al. directly), but extracted figures from those pages are best treated as H-minus. Text I parsed myself (the Kroer et al., Saguillo et al., FEDS and CFTC 26-08 PDFs; the Polymarket US Rulebook) and the curl responses are verbatim.
- Venue data: Polymarket Gamma (`/events/keyset`, `/events/slug`, `/markets/keyset`), CLOB `/book`; Kalshi public `/events`, `/series`, `/markets`, `/historical/markets`; Deribit public `get_book_summary_by_currency`. Throttled to at least 300 ms between calls per host; approximate request counts per host over the whole task: Polymarket Gamma about 85, Polymarket CLOB about 160, Kalshi about 45, Deribit 1, arXiv API about 30, Crossref about 25, Semantic Scholar 4 (one 429, not retried), Wikipedia raw pages 5, docs sites a handful (all far below the 600 cap).
- Blocked or unreachable (not worked around): Business Insider, Washington Post, Forbes, Gambling Insider (403 or blocked), SSRN full text (403), UCD working paper PDF (403), Federal Register (bot redirect), Kalshi rulebook.
- Own scripts (scratchpad, not in the repo): `lp.py` (exact LP), `example.py` (worked example), `snapshot.py`, `poly_ladders.py`, `live_case.py`, `btc_family.py`. The solver and example are reproduced in Appendix A so the repo carries them.

---

## 2. Formal framework

**States.** Let `Omega` be the finite set of joint states the contracts in scope can resolve to. Include void and ambiguous states explicitly (venue cancels, 50-50, last-traded-price settlement, death carve-out, "resolves to Other"). Splitting a real-world outcome into several states is how rule differences enter the maths.

**Contracts.** Contract `j` has payoff `A[w][j]` in state `w`, with `A` in `{0,1}` for ordinary binary resolution and a fraction for void payoffs (Polymarket "Unknown/50-50": each token redeems for 0.50, H in doc 08; Kalshi scalar settlement, H below).

**Prices.** A YES contract has best bid `b_j` and best ask `a_j` (decimal, per share, payout 1). Selling YES at `b` is the same position as buying NO at `1-b` when the venue's NO book mirrors the YES book. I checked this first-hand: for the Polymarket market "Will there be a Hormuz agreement and the Republicans win the Senate?" the YES token book and NO token book showed identical sizes at mirrored prices (YES bids 0.015/0.013/0.012 at 117.52/62.47/200.0 versus NO asks 0.985/0.987/0.988 at the same sizes; one market, three levels, 2026-10-18 18:15 UTC, **H for this sample**). Kalshi's REST fields behave the same (fixture: `yes_ask 0.98`, `no_bid 0.02`, `yes_bid 0.01`, `no_ask 0.99`). So each market is **one contract with a bid and an ask**; counting both the "sell YES" and "buy NO" routes as separate liquidity would double count.

**No-arbitrage test.** A trade vector `x` (net shares per contract) is an arbitrage if its payoff `A x >= 0` in every state and its cost is negative (or payoff is positive in some state at zero cost). By the separating-hyperplane (Farkas) argument, no arbitrage exists iff there is a probability vector `pi` over `Omega` with `b_j <= E_pi[A_j] <= a_j` for every `j`. Equivalently the mid-price vector lies in the marginal polytope `M = conv{A[w][.]}`. This is the statement in Kroer et al. (H quote above) and in Abernethy-Chen-Wortman Vaughan ("the set of reachable prices is ... the convex hull of the security payoffs", H, abstract). For a **cost-function market maker** (LMSR) the largest guaranteed profit against the maker equals the Bregman divergence from the maker's state to `M` (Kroer et al., Proposition 2.4, H); for a **limit-order book** the same quantity is the LP of section 4, because trade costs are piecewise linear.

**Why the hull formulation matters here.** Every relation in the taxonomy is a way of deleting states from `Omega`. A ladder deletes the states in which a higher threshold is crossed without the lower one; an implication deletes "A and not B"; mutual exclusion deletes "A and B". The constraint on YES prices in each row of the taxonomy is the projection of that state deletion onto price space.

---

## 3. Taxonomy of relationships

Notation: `a_i`, `b_i` best ask and bid of YES in contract `i`; `fee_i` per-share fee of a taker fill at the relevant price; `E` = event.

### 3.0 Overview table

| Type | Relation (formal) | Price constraint (YES prices) | Risk-free in payoff space? | Dominant residual risk |
|---|---|---|---|---|
| (a) Identical event across venues | `A[w][i] = A[w][j]` for all `w` incl. void | `p_i = p_j`. Executable edge: `b_i - a_j - fee_i - fee_j > 0` (sell on i, buy on j); complement form: buy YES on i and NO on j, edge `1 - a_i - a_j^NO - fees` | **Only if rule text, source, cutoff, tie rule and void payoff are identical.** Usually they are not. | Resolution source, clock, void payoff, oracle (UMA vs exchange), dispute lock |
| (b1) Complement in one market | `YES + NO = 1` state-wise | `a^YES + a^NO >= 1`, `b^YES + b^NO <= 1` (mirrored books make crossing impossible) | **Yes** (single contract, single resolver) | Venue/custody, fees, stale prints mistaken for prices |
| (b2) Mutually exclusive, exhaustive (ME-E) set in one event (negRisk, bucket partition) | exactly one of `n` contracts pays | `sum a_i >= 1 >= sum b_i`; long-all-YES edge `1 - sum a_i - sum fee_i`, short edge `sum b_i - 1 - sum fee_i` | **Yes if the set is exhaustive under the rules** (default rule, "No X" outcome) and one resolver pays all legs | Void/50-50, dispute lock (median +100 h), `n` fees, partial fills, placeholder/Other drift |
| (b3) ME but not exhaustive, or with a movable "Other" | at most one pays | `sum b_i <= 1` only; `sum a_i >= 1` is **not** required | Short basket only; long basket **not** riskless | Treating ME as exhaustive; augmented negRisk "Other" redefinition |
| (c) Nested ladders | thresholds `k1<k2`: `{X>k2} subset {X>k1}`; date `T1<T2`; bucket = ladder difference | `p(k1) >= p(k2)`; `p(T1) <= p(T2)`; `p(bucket[k1,k2)) = p(k1)-p(k2)` | **Yes inside one source/clock**; tie atoms and per-rung resolution can break it | Rung-specific rules, "announced" vs "occurred", boundary ties, separate UMA processes per rung |
| (d) Implication / subset | `A subset B` | `p_A <= p_B`; edge `b_A - a_B - fees > 0` | Only if the implication holds in the **contract text**, incl. edge states; one-directional | Real-world intuition vs rule text; timing; cross-venue oracle |
| (e) Joint / conditional | `C = A and B` | `max(0, p_A+p_B-1) <= p_C <= min(p_A,p_B)` (Frechet-Hoeffding) | Yes if all legs resolve on the same facts at the same time | Different resolution times, void semantics of conditionals, RFQ last look, 3 fees |
| (f) ME across different events | `A and B = empty` | `p_A + p_B <= 1` (plus `>= 1` if also exhaustive) | Like (d): only if exclusivity is in the text | LLM-inferred exclusivity (13 of 1,576 confirmed in Saguillo et al.), overlap/void |
| (g) Correlated factor, no hard constraint | none | none; statistical only | **No** (relative value) | Basis risk, regime change, spurious correlation |
| (h) Cross-asset | payoff identity only approximately | `p_PM approx e^{rT} * (-dC/dK)` (digital from calls); Fed markets vs futures-implied; sports vs vig-free odds | **No** (reference-price, clock, smile and margin basis) | Reference index mismatch, timing mismatch, longshot premium, margin, ties/pushes |

### 3.1 (a) Identical event across venues

- **Definition.** Contracts `i` (venue V) and `j` (venue W) such that `A[w][i] = A[w][j]` in **every** state of the joint space, including void and ambiguous ones. This is a much stronger statement than "same headline".
- **Constraint.** Mid prices should coincide up to frictions. Executable edge for selling on V and buying on W is `b_i - a_j - fee_i - fee_j - lock - reserve`. The complement form (buy YES on V and NO on W) pays exactly 1 iff the two venues resolve identically; cost `a_i + a_j^NO < 1`.
- **Example (structure).** "Fed holds at the 2026-12 FOMC": Polymarket (UMA, "consensus of credible reporting") versus Kalshi (exchange-determined from named source agencies). Real mirrored pairs exist by construction on some venues: Predict.fun returns `polymarketConditionIds[]` and `kalshiMarketTicker`; Probable exposes `/markets/polymarket/{id}`; Limitless markets carry `metadata.isPolyArbitrage` and settle by "external venue parity" (all H, doc 09). Gebele and Matthes find about 8% of Polymarket markets have an equivalent counterpart elsewhere versus about 2% for Kalshi (H).
- **Detection signals.** Native cross-reference ids; identical entity ids, threshold, timestamp and resolution source; embedding retrieval (top-20 neighbours contain over 99.9% of verified relations, H, Gebele and Matthes); two-pass LLM comparison; deterministic gate with rule-hash pinning (doc 10 section 4); price gap larger than fees.
- **Failure modes (each with first-hand evidence in section 8).** Different source or station (NYC temperature); different clock (Kalshi 10-11 AM ET snapshot versus Polymarket 11:59 PM ET); state versus event semantics ("shut down on Feb 14" versus "new shutdown by Feb 14"); death or other exception clauses (Kalshi last-traded-price settlement versus Polymarket "removed from power" paying 1); different void payoffs; early close (`can_close_early`); clarifications edited after trading; funding islands and non-atomic execution.
- **Risk class.** Not risk-free in general. Treat as a hedge with a resolution-risk reserve unless the pair carries an approved rule-hash mapping.

### 3.2 (b) Complement and mutually exclusive exhaustive sets within an event

**(b1) YES + NO = 1.**
- Constraint: `a^YES + a^NO >= 1` and `b^YES + b^NO <= 1`. On venues whose NO book mirrors the YES book (Polymarket checked; Kalshi fields) a violation would be a crossed book that the matching engine resolves immediately, so it is not a tradeable edge. Reported "single-condition" gaps are therefore artefacts of non-synchronous prints or VWAP carry-forward, or real but fleeting: Saguillo et al. flag `|1 - VWAP sum| > 0.02` using block-level VWAPs with last prices carried forward up to 5,000 blocks and untraded tokens priced at 0 (H); Cheng et al. find 7 executable in-game single-market episodes out of 3,042 NBA markets (H).
- Failure modes: using last-trade or `outcomePrices` rather than ladders (doc 10 notes XO inactive markets returning Yes 0.881 and No 0.58); fee on both legs.

**(b2) ME-E set in one event (negRisk, bucket partitions).**
- Constraint: `sum_i a_i >= 1 >= sum_i b_i`. Long edge `1 - sum a_i - sum fee_i`; short edge `sum b_i - 1 - sum fee_i` (equivalently buy every NO: `n-1` guaranteed). Polymarket's negRisk adds an atomic conversion: one NO in any market converts into one YES in every other market (H, docs.polymarket.com/concepts/negative-risk, fetched 2026-10-18). Gebele, Mutzel and Matthes (2026) show the conversion is **one-directional before settlement** (NO-to-YES yes, YES-to-NO only at settlement), so violations that would need the missing YES-to-NO path (their "YES-side", which at the boundary is exactly the long basket `1 - sum a_i - fees > 0`) can only be closed by buying complete baskets and holding them to settlement, while "NO-side" violations (buy NO, convert, sell the YES legs) can be closed before settlement. Their CLOB sample has 2,098 positive YES-side episodes versus 36 NO-side; the paper calls the comparison descriptive (H, re-read to confirm the definitions).
- Examples measured live (section 6.3): General Mills Q2 organic net-sales-growth buckets (6 outcomes, rule: if the metric is missing, resolves to the lowest bracket, so exhaustive by rule); OpenAI IPO closing market cap (7 outcomes including "No IPO by December 31, 2027"); Bitcoin vs Gold vs S&P 500 in 2026 (3 outcomes).
- Detection: Gamma event `negRisk` true, `negRiskAugmented` false, all markets `acceptingOrders`, read each market's `description` for the default rule; Kalshi `mutually_exclusive` true (this flag does **not** say exhaustive; see b3).
- Failure modes: `n` taker fees (a 4-way set at 0.30/0.28/0.22/0.18 costs $0.0292 of fees per set at rate 0.04, so the gross 2-cent gap becomes -0.9 cents net, consistent with doc 10 example C); void or 50-50 outcomes (410 of 99,283 protocol-resolved Polymarket conditions, 0.41%, paid 50-50, arXiv 2610.00183, H); UMA dispute lock-up (section 7); thin legs (the 1.5%+ bucket of General Mills had no bid).

**(b3) ME but not exhaustive, or with an "Other".**
- Only `sum b_i <= 1` is guaranteed. Example: Kalshi `CONTROLS-2026` (Senate control: Democratic party 0.62/0.63, Republican party 0.38/0.39, `mutually_exclusive: true`, fixture event) is ME but a third outcome exists, so asks summing to 1.02 are not a violation and bids summing to 1.00 are tight. Of 186 Kalshi ME events with 3 or more active markets in my snapshot, 21 had `sum a_i < 1`; **none of those is an arbitrage unless exhaustive** (section 6.3).
- Polymarket augmented negRisk: placeholders and an explicit "Other" whose definition changes as placeholders are named; docs: "Only trade on named outcomes" (H). Treat the executable set as the named outcomes only and allow the short-basket direction only.

### 3.3 (c) Nested threshold, date and bucket structures

- **Definition.** For a real-valued underlying `X` and thresholds `k1 < k2`: `G_k = 1{X > k}` satisfies `G_k2 <= G_k1` state-wise. For first-passage times `tau`: `D_T = 1{tau <= T}` is nondecreasing in `T`. A bucket `B[k1,k2) = G_k1 - G_k2` (with explicit tie rules). A barrier ladder `H_k = 1{max X >= k}` is nonincreasing in `k` and dominates the terminal ladder: `H_k >= G_k`.
- **Constraints.** `p(G_k1) >= p(G_k2)`; `p(D_T1) <= p(D_T2)`; `p(B[k1,k2)) = p(G_k1) - p(G_k2)`; `p(H_k) >= p(G_k)` for the same `k` and horizon. Executable violation of the first: `b(G_k2) - a(G_k1) - fees > 0` (sell the harder rung, buy the easier).
- **Examples live on 2026-10-18.** Polymarket lists, for the same date and same Binance 12:00 ET resolution instant, both a cumulative ladder ("Bitcoin above ___ on October 19?") and a negRisk bucket partition ("Bitcoin price on October 19?") (H, Gamma). That is type (c) cumulative-versus-bucket on a single venue. Kalshi ladders carry `strike_type` with `floor_strike` or `cap_strike`; the values in my 1,600-event snapshot were `greater` (6,524 markets), `custom` (3,151), `greater_or_equal` (2,067), `structured` (663), `between` (256), `less` (27), `less_or_equal` (3) and missing (1,266), so my Kalshi ladder test is almost entirely about upward thresholds. Polymarket also lists touch ladders ("What price will Bitcoin hit in October?", group titles with arrows) and nested date contracts ("hit in October" versus "hit before 2027").
- **Detection signals.** Same event with a monotone numeric parameter in `groupItemTitle` or `floor_strike`; same normalised question text apart from the number or date; `strike_type`; bucket labels with `<`, `-`, `>`.
- **Measured violation rates (section 6.3).** Polymarket within-event ladders (O/U, barrier, "N+"): 1,527 + 56 + 8 ladders, 3,651 adjacent quoted pairs, 3 gross violations; Kalshi: 873 ladders, 7,274 adjacent quoted pairs, 0 crossed. The Polymarket BTC ladder-vs-bucket LP over 23 price atoms found zero guaranteed profit on 5 of 6 dates and $0.03 gross on 10 shares in the far tail on the sixth. FEDS 2026-010 notes that raw Kalshi distributions need "monotonicity in the CDF" enforced because of "stale or illiquid pricing in the tails" (H), which is the same phenomenon seen from the user side.
- **Failure modes.** Boundary ties (">" versus ">=", "if exactly between two brackets, resolves to the higher bracket" in Polymarket bucket rules; my LP adds exact-equality atoms for this reason); per-rung resolution (each Polymarket rung is its own UMA question, so rungs can in principle settle inconsistently); "announced" versus "occurred" date semantics (the "ends November 12" shutdown rung, section 8); touch versus close semantics (SSRN 7589581 documents "path barriers versus fixed-time measurements" as a payoff-difference class, H abstract).
- **Risk class.** Risk-free inside one source and clock after accounting for tie atoms; date ladders need extra care because the resolving fact is an announcement.

### 3.4 (d) Logical implication and subset relations

- **Definition.** `A => B`, meaning no state has `A` true and `B` false. Constraint `p_A <= p_B`. Edge: sell `A` at `b_A`, buy `B` at `a_B`, profit `b_A - a_B - fees` per share, locked in every state (payoff `1_B - 1_A >= 0`).
- **Examples.** Wins the general election implies wins the nomination (unless a replacement or independent route exists in the text); wins the championship implies reaches the final; finish top 2 implies top 3 implies top 5 implies top 10; make the national-championship game implies make the playoff; "announce a run before 2027" implies "before 2028"; BTC "hit $K in October" implies "hit $K in 2026". I tested eight such families live on Polymarket (ranking ladders, playoff chains, "announce a run" dates, BTC/ETH/SOL touch dates; listed in section 6.3): 271 quoted pairs, 2 gross violations (0.2 c and 1.7 c).
- **Cross-venue subset (strict, one-way).** Gebele and Matthes: the 2024 US election was resolved by Polymarket and Limitless on media-network calls and by Kalshi and Myriad on the inauguration outcome, "a strict subset relation" with "every state in which Trump is inaugurated" inside the set where networks call the race for him (H). This is a type (d) relation across venues, usable in one direction only.
- **Detection.** Saguillo et al. use an LLM to emit per-market outcome tables and a deterministic subset checker; of 46,360 US-election pairs, 1,576 were labelled dependent, 374 passed the checker and **13 were confirmed** by hand (H). Treat LLM output as a candidate generator.
- **Failure modes.** The implication holds in intuition but not in text (withdrawn candidate, replacement nominee, void). Their own conclusion notes weaker dependencies such as "Team A wins the semifinal" and "wins the final" as an open problem; I read this as a text-level condition issue because winning the final does logically imply winning the semifinal if both contracts define the same tournament.
- **Risk class.** Not risk-free unless the implication is proven from the rule text of both contracts.

### 3.5 (e) Conditional and joint structure

- **Definition.** Contracts on `A`, `B` and `C = A and B` (and optionally `A or B`).
- **Constraints.** Frechet-Hoeffding: `max(0, p_A + p_B - 1) <= p_C <= min(p_A, p_B)`; for the union `max(p_A, p_B) <= p_{A or B} <= min(1, p_A + p_B)`. Conditional contract (refund if the condition fails): `p(A|B) = p_{A and B} / p_B` only if the refund is at par and resolves at the same time.
- **Violation trades (verified with my exact LP).** Upper bound: with `C` bid 0.55 above `B` ask 0.50, buy `B`, sell `C`: guaranteed profit 0.05 per share (10 shares: $0.50). Lower bound: with `A` bid 0.70, `B` bid 0.60 and `C` ask 0.25 (`0.70 + 0.60 - 0.25 = 1.05 > 1`), sell `A`, sell `B`, buy `C`: guaranteed profit 0.05 per share. Coherent quotes (`A` 0.60/0.61, `B` 0.50/0.51, `C` 0.30/0.31) gave exactly zero.
- **Venue structures.** Polymarket "Combinatorial Positions" and "Combos": a combinatorial YES "represents a conjunction of legs" settled on Polymarket Protocol V2, quoted by RFQ (400 ms quote window, 10 s acceptance, optional 1 s last look) (H, docs). Kalshi multivariate events (MVE/combo) with RFQ; Nechepurenko (arXiv 2609.17610) counts 7,611,594 MVE market tickers created in seven days, 94.82% in one collection (H). Polymarket also uses negRisk events for joint partitions (live example: "Who wins the Senate, pending Hormuz agreement": 3 markets, sum of asks 0.999, H Gamma).
- **Detection.** Parse the conjunction legs of a combo; compare RFQ quotes with the marginals; scan for A, B and A-and-B listings with the same entities and dates.
- **Failure modes.** Combos are quotes, not resting orders (last look); three legs means three fees; the conjunction may resolve later than a leg; the parlay-pricing literature (ParlayMarket arXiv 2603.22596, LOPMM arXiv 2607.18299) shows market makers price the joint from a shared pairwise-correlation model, so quotes sit inside the bounds by construction.
- **Risk class.** Risk-free in payoff space if all legs resolve on the same facts at the same time.

### 3.6 (f) Mutually exclusive across different events

- **Definition.** Contracts `A` (event 1) and `B` (event 2) with `A and B = empty`. Constraint `p_A + p_B <= 1`; edge `b_A + b_B - 1 - fees` by selling both. If `{A, B, ...}` are also exhaustive, `sum a < 1` is the long-side edge. This generalises (b2) to contracts that sit in different events or on different venues.
- **Examples.** "X wins nomination" in one event and "Y wins nomination" in another; "Fed cuts in December" and "Fed hikes in December"; "Team A wins the final" and "Team B wins the final" listed as separate binary markets; Saguillo et al.'s 11 confirmed negRisk-versus-negRisk pairs.
- **Detection and failure modes.** As (d): exclusivity must be provable from text; "both" and "neither" states (void, tie, co-winners) are the usual leaks; resolution times may differ.
- **Risk class.** As (d).

### 3.7 (g) Correlated-factor relationships without a hard constraint

- **Definition.** Contracts whose payoffs load on a common driver but whose joint support is the full product (no state is deleted). Examples: macro rates versus recession markets; election result versus policy-outcome markets; BTC price ladders versus ETH ladders or equity-index markets.
- **Constraint.** None. In the LP of section 4 the guaranteed profit is zero for any such set, so any trade is a view, not an arbitrage. Position sizing needs a factor model (betas, correlation matrix of price changes), a scenario table and a loss limit.
- **Detection.** Shared tags and entities; rolling correlation and lead-lag of price changes (Ng et al. find Polymarket leads Kalshi in price discovery in the 2024 election window, SSRN 5331995, H abstract); regression of one market's logit on another's. Quotient's calibrated forecasts (doc 12) are a signal here, not a constraint.
- **Failure modes.** Spurious correlation, regime change, thin books, correlation breaking exactly when needed.

### 3.8 (h) Cross-asset links

- **(h1) Digital versus listed options.** A "BTC above K at T" contract is a cash-or-nothing digital, so its fair price is `e^{-rT} * Q(S_T > K) = -dC/dK` (Breeden and Litzenberger 1978, Crossref H for existence) and a call spread of width `h` approximates it with error of order `h`. Evidence: Portnaya (arXiv 2606.19517): mean gap 5.6 points over 214 hourly observations on one Sept-2023 contract, 6.3 points pooled over 287, 11 points versus Deribit, AR(1) half-life about 4 h, largest where option-implied probability is low and maturity long; a delta-hedged proxy stays profitable after conservative costs with marginal precision (H abstract; **STALE?** 2023 sample). Lee, Lee and Lee (SSRN 6748186) treat 113,338 BTC/ETH contracts on Kalshi and Polymarket (Sept 2025 to Feb 2026) as digitals and find Polymarket's variance risk premium about 16 times Kalshi's, attributed to forward-start design (H abstract).
  - My one-snapshot check (section 6.5): Polymarket "Bitcoin above K on Oct 20" mids versus Deribit call-spread digitals interpolated in time: mid minus implied from -0.65 to +2.4 points across 9 strikes, largest in the right tail, with Polymarket richer than the options-implied value at long-shot strikes (0.0055 versus 0.0001 at 90,000).
- **(h2) Fed decision versus fed funds futures.** Diercks, Katz and Wright (FEDS 2026-010, H, read): futures-implied probabilities need a "binomial tree" with two outcomes, Kalshi gives a full distribution; for the September 2025 FOMC futures put a weight of 0.75 on a 25 bp cut that "is likely lumping in weight on lower rate outcomes". Kalshi's modal forecast had zero average error on the day before FOMC meetings (September 2024 drove the difference) and is "an improvement over fed funds futures" on their error metrics. Implication: a Kalshi/Polymarket versus futures trade is a **basis trade** with a model-dependent conversion, not an arbitrage.
- **(h3) Sports versus sportsbooks.** Sportsbook prices embed a margin that must be removed before comparing (standard practice, M: proportional or power scaling, or Shin 1993 whose existence I verified via Crossref); settlement rules (overtime, pushes, void on postponement) differ. I found **no** 2026 empirical paper comparing Kalshi/Polymarket sports prices with vig-free sportsbook lines (searched: arXiv API `abs:sportsbook AND (abs:Kalshi OR abs:Polymarket)` returned nothing; Crossref bibliographic query returned only Nechepurenko's contract-retrieval study). NOT FOUND.
- **(h4) Perps and other listed derivatives.** Polymarket now documents "Perps" (docs index) and Kalshi launched an index perpetual on 2026-10-06 (Wikipedia citing Reuters, M); neither is analysed here.
- **Detection signals.** Same underlying and strike with a time-aligned reference price; implied-minus-listed gap and its sign persistence; half-life.
- **Failure modes.** Reference mismatch (Polymarket BTC uses Binance BTC/USDT 1-minute close at 12:00 ET, H description; Deribit settles to its own index at 08:00 UTC; Dai, Jia and Yu find Binance lands on the same side as the Chainlink-based 5-minute resolution only about 85% of the time, H); time mismatch (16 h in my example); smile and skew; longshot premium (Becker: contracts at 1 cent win 0.43% against an implied 1%, H); margin and capital for the hedge leg; access and fees.

---

## 4. Detecting arbitrage across linked markets as a linear program

### 4.1 Base LP (guaranteed profit, no frictions)

Sets: states `w in Omega`, contracts `j in J`. For each contract an ask ladder `{(a_jl, qa_jl)}` (price, shares) and a bid ladder `{(b_jl, qb_jl)}`. Payoff `A[w][j]` per share held.

Variables: `x_jl in [0, qa_jl]` shares bought at ask level `l`; `y_jl in [0, qb_jl]` shares sold at bid level `l`; `t` the guaranteed profit.

```
maximize   t
subject to t <= sum_j A[w][j] * ( sum_l x_jl - sum_l y_jl )
                 - sum_jl a_jl * x_jl + sum_jl b_jl * y_jl          for every state w
           0 <= x_jl <= qa_jl ,   0 <= y_jl <= qb_jl
```

- `x = y = 0` is feasible with `t = 0`, so `t* >= 0`; **an arbitrage exists iff `t* > 0`**.
- Ladders are convex (asks rise, bids fall), so the LP fills cheapest levels first with no ordering constraints.
- Net shares `n_j = sum_l x_jl - sum_l y_jl` can be negative (short). Short collateral is `1 - b` per share (Polymarket: split a set and sell the YES, i.e. buy NO at `1-b`).
- Do not add separate columns for the NO token: with mirrored books it is the same liquidity (section 2).

### 4.2 Dual and certificate

The dual variables of the state constraints form a probability vector `pi` on `Omega` (they sum to 1 when `t* > 0`). Complementary slackness gives:
- every ask level that is bought satisfies `a_jl <= E_pi[A_j]` (equality if the level is only partly filled);
- every bid level that is sold satisfies `b_jl >= E_pi[A_j]`.

So `pi` is the **coherent price vector** that supports the optimum: `E_pi[A_j]` is where contract `j` "should" trade given all the linked contracts. When `t* = 0` the dual returns a `pi` with `b_j <= E_pi[A_j] <= a_j` on every top-of-book quote, which is an auditable **no-arbitrage certificate**. This is the book-trading analogue of the Bregman projection onto the marginal polytope used for cost-function market makers (Kroer et al.: the maximum guaranteed profit is `D(theta* || theta)`, H).

### 4.3 Fee-adjusted version

Replace asks by `a~_jl = a_jl + phi^B_j(a_jl)` and bids by `b~_jl = b_jl - phi^S_j(b_jl)`. Because the fee depends on the **price level**, not on quantity, the LP stays linear.

- Polymarket (H, docs.polymarket.com/trading/fees, fetched 2026-10-18): `fee = C x feeRate x p x (1-p)`, taker only, makers never charged; category rates Crypto 0.07, Sports 0.05, Finance/Politics/Mentions/Tech 0.04, Economics/Culture/Weather/Other 0.05, Geopolitics 0. The live per-market `feeSchedule.rate` is authoritative (doc 08 found docs and live data disagree for Sports). Docs example: 100 crypto shares at $0.50 cost $1.75 in fees. So `phi(p) = theta_j p (1-p)` per share, maximal at 0.5 and small in the tails.
- Kalshi: trade fee from the fee model rounded up to $0.000001, plus a rounding fee that restores the member's balance grid ($0.01 for non-direct members) and a rebate (H, docs.kalshi.com fee_rounding). The model coefficient `0.07 x M x p(1-p)` is **M** (third-party and a working paper cited on Wikipedia: "0.07 x P x (1-P) per taker contract", sample period; the official PDF was blocked in doc 08). Rounding is order-level, so use `0.07 x M x p(1-p)` per share in the LP and re-price the chosen integer lots with the exact rule afterwards.
- Gross edge needed for an `n`-leg set is at least `sum_i theta p_i (1-p_i)`, at most `theta n / 4`. A cross-venue pair at mid prices needs `theta_P p(1-p) + 0.07 M q(1-q)`; at p near 0.5 on both legs that is 2.7 cents (Politics, Kalshi M=1) before any lock-up or reserve.

### 4.4 Depth-aware version

Done by the level variables: each ladder level is a column with a size bound. Additional practical constraints:
- **Lot and tick constraints** (Polymarket min order 5 shares and tick 0.001 or 0.01; Kalshi integer contracts, tick 0.01 or tapered): integers make it a MILP. Solve the LP, round down lots, re-check the guarantee with exact fee and rounding.
- **Budget:** `sum_jl a~_jl x_jl + sum_jl (1 - b~_jl) y_jl <= K`.
- **Per-leg freshness:** drop levels older than a threshold; a multi-leg book snapshot is never atomic (in my live runs each leg's book was a separate GET about 0.3 s after the previous one, and book `timestamp` values across the four events I priced spanned about 4.5 minutes).
- **NegRisk conversion** (NO in one market to YES in every other, H) is redundant for the hold-to-settlement payoff LP but changes capital: it lets a trader recycle collateral before resolution (Gebele, Mutzel and Matthes). Add it as zero-cost exchange columns only in a capital-constrained variant.

### 4.5 Capital lock, resolution risk and legging

- **Lock cost:** add `lambda_jl = rho x T_j x (a_jl for buys, 1 - b_jl for sells)` to the effective cost, with hurdle `rho` per year and `T_j` the **latest plausible final resolution** including the dispute tail. My measured Polymarket tail (section 7): median +3.6 h after end date if undisputed, +100 h if disputed (p90 +439 h).
- **Resolution risk (robust LP):** add rows for alternative and void states (K voids and refunds at last price; UMA 50-50; source disagreement). The LP then maximises the **worst case across all rows**; in the worked example this wipes out the edge (section 4.7, case D). A cheaper approximation is a per-cross-venue-leg haircut.
- **Legging risk:** execution is non-atomic ("each of the above trades is non-atomic; thus, there is always some risk", Saguillo et al., H). Model it as extra scenario rows in which only a prefix of the legs fills, and sequence the least liquid leg first.

### 4.6 State space size

`|Omega|` is exponential in general. For the taxonomy's structures it stays small: an ME-E set of `n` contracts has `n` atoms (+1 if not exhaustive); a ladder with `K` thresholds has `K+1` interval atoms plus `K` tie atoms; the BTC ladder-plus-bucket family needed 23 atoms for 22 contracts. Combined structures use constraint generation: solve over a working set of states and add the state in which the current portfolio loses, found by an integer program (Dudik-Lahaie-Pennock EC 2012, as characterised in Kroer et al., M; Kroer et al. EC 2016, H; Zhai and Shi 2026 use integer programming over 1.9M relations, H abstract). With LLM-derived relation tables (Saguillo et al.) the state set is the set of consistent outcome vectors.

### 4.7 Worked numeric example

Three-candidate race, two venues. States: winner is X, Y or Z. Contracts (all synthetic prices, **not live quotes**):

| Contract | Pays in | Asks (price x size) | Bids |
|---|---|---|---|
| X@P | X wins | 0.46 x 30; 0.48 x 100 | 0.44 x 50 |
| Y@P | Y wins | 0.21 x 40; 0.23 x 100 | 0.19 x 50 |
| Rep@P | Z wins | 0.31 x 50; 0.33 x 200 | 0.29 x 100 |
| Dem@K | X or Y wins | 0.66 x 60; 0.68 x 100 | 0.64 x 100 |
| Z@K | Z wins | 0.30 x 25; 0.32 x 100 | 0.28 x 100 |

Fees: venue P taker 0.04 x p(1-p), venue K taker 0.07 x p(1-p). Lock: 8% APY for 30 days = 0.658% of capital. Output of `example.py` (exact Fractions; solver verified, see below):

- **Naive top-of-book covers:** Dem@K + Z@K = 0.96; X@P + Y@P + Z@K = 0.97; X@P + Y@P + Rep@P = 0.98 (gross 4, 3, 2 cents). A pairwise scanner stops at the first, sized at its smallest level (25 shares).
- **(A) Depth-aware, no fees: guaranteed profit $2.50.** Trades: buy X@P 30 @0.46, Y@P 30 @0.21, Rep@P 50 @0.31, Dem@K 60 @0.66, Z@K 25 @0.30 and 15 @0.32; payoff is 90 in every state, cost 87.50. Dual state prices X 0.4700, Y 0.2100, Z 0.3200.
- **(B) With taker fees: $0.4406.** Only Dem@K 60 @0.66, Rep@P 35 @0.31, Z@K 25 @0.30 survive (payoff 60 in every state, cost 57.95 + fees 1.609). Hand check: Kalshi fee 60 x 0.07 x 0.66 x 0.34 = 0.9425; P fee 35 x 0.04 x 0.31 x 0.69 = 0.2995; Kalshi fee on Z 25 x 0.07 x 0.30 x 0.70 = 0.3675. Dual prices X 0.4648, Y 0.2166, Z 0.3186.
- **(C) Fees plus 30-day lock at 8% APY: $0.0820** on 25 sets of Dem@K + Z@K (capital 24.00; the same plan earns $0.2398 before the lock charge).
- **(D) Add three void rows (venue K voids and refunds at last price, Dem 0.65 and Z 0.30, whichever candidate wins): guaranteed profit $0.0000.** Plan (C) re-evaluated in those rows loses $1.01 (25 x (0.95 - 0.96 - 0.0304)). The "arbitrage" in (C) was entirely a bet that venue K does not void.
- The 3 trades that give profit (B) cannot be found by looking at one pair of contracts at a time: they combine a composite contract (Dem) with a single-outcome contract on another venue.

Solver validation (H, own tests): the exact simplex reproduces hand-derived trades in the Frechet examples of section 3.5, passes 40 random cross-checks against brute-force integer enumeration (LP value never below the enumerated optimum), and returns state prices summing to 1 whenever `t* > 0`.

**Second small example (implication with fees).** `N` = "X wins nomination" asks 0.34 x 50 and 0.36 x 100; `G` = "X wins general" bids 0.35 x 40 and 0.33 x 80. Violation `b_G > a_N`: buy N, sell G for 40 shares, gross $0.40; net of a 4% politics fee on both legs the optimum is exactly $0.00.

---

## 5. Literature: what exists and what it actually claims

Verification column: **Crossref** = registered metadata checked; **arXiv** = abstract page read; **read** = body text read (HTML or extracted PDF); **abstract only** = abstract read, body not.

### 5.1 Combinatorial markets and logical arbitrage (theory)

| Citation | Verified how | What it actually claims | Notes |
|---|---|---|---|
| Hanson, "Combinatorial Information Market Design", Information Systems Frontiers 5(1), 2003 | Crossref DOI 10.1023/A:1022058209073 | Combinatorial markets; LMSR background (as cited by Kroer et al., H) | not read; **STALE?** background |
| Hanson, "Logarithmic Market Scoring Rules for Modular Combinatorial Information Aggregation", J. Prediction Markets 1(1), 2007 | Crossref DOI 10.5750/jpm.v1i1.417 | LMSR cost function `C(q) = b ln sum exp(q_i / b)`, bounded loss | abstract not read |
| Fortnow, Kilian, Pennock, Wellman, "Betting Boolean-style", EC 2003 / Decision Support Systems 2005 | Crossref DOIs 10.1145/779928.779946, 10.1016/j.dss.2004.08.010 | Trading securities on logical formulas | abstract not read (elided in Semantic Scholar) |
| Chen, Fortnow, Lambert, Pennock, Wortman, "Complexity of Combinatorial Market Makers" | arXiv 0802.1362 (abstract) | LMSR pricing is hard (class rendered "SP-hard", i.e. #P-hard) for permutation and Boolean markets even under restricted languages; approximation via online permutation learning | **H** abstract |
| Chen and Pennock, "A Utility Framework for Bounded-Loss Market Makers", UAI 2007 | arXiv 1206.5252 (existence) | Cost-function market makers via utility | **M**, abstract not read |
| Abernethy, Chen, Wortman Vaughan, "An Optimization-Based Framework for Automated Market-Making" (EC 2011); "Efficient Market Making via Convex Optimization, and a Connection to Online Learning" (ACM TEAC 2013) | arXiv 1011.1941 (abstract); Crossref DOIs 10.1145/1993574.1993621, 10.1145/2465769.2465777 | Prices from a convex potential defined by optimisation over the **convex hull of the security payoffs**; applies to pair betting (#P-hard with prior mechanisms) | **H** abstract |
| Dudik, Lahaie, Pennock, "A Tractable Combinatorial Market Maker Using Constraint Generation", EC 2012 | Crossref DOI 10.1145/2229012.2229047 | Constraint-generation market maker over linked securities | abstract elided at publisher; characterised through Kroer et al. (arbitrage removal driven by linear constraints on arbitrage-free prices, tighter constraints derived ad hoc), **M** |
| Dudik, Lahaie, Pennock, Rothschild, "A combinatorial prediction market for the U.S. elections", EC 2013 | Crossref DOI 10.1145/2482540.2482601 | Deployed combinatorial election market | not read |
| Kroer, Dudik, Lahaie, Balakrishnan, "Arbitrage-Free Combinatorial Market Making via Integer Programming", EC 2016 | arXiv 1606.02825; **read** (PDF extracted); Crossref DOI 10.1145/2940716.2940767 | "Arbitrage-free prices are exactly the convex combinations of valid payoff vectors"; Frank-Wolfe Bregman projection with an IP oracle; guaranteed profit of any trader at most the Bregman divergence `D(theta*, theta)` from the market state to its projection (Prop. 2.4); pricing arbitrage-free with bounded subsidy is #P-hard in the worst case; tested on 2010 NCAA data, outcome space `2^63`, 88k trades on 5k securities | **H** |
| Othman, Pennock, Reeves, Sandholm, "A Practical Liquidity-Sensitive Automated Market Maker", EC 2010 / TEAC 2013 | Crossref DOIs 10.1145/1807342.1807402, 10.1145/2509413.2509414 | LS-LMSR: liquidity-sensitive LMSR (depth grows with volume; M, from the title and background knowledge) | background, not read |
| Pennock and Sami, "Computational Aspects of Prediction Markets", in Algorithmic Game Theory, 2007 | Crossref DOI 10.1017/cbo9780511800481.028 | Survey | not read |
| Manski, "Interpreting the predictions of prediction markets", Economics Letters 2006 | Crossref DOI 10.1016/j.econlet.2006.01.004 | Prices need not equal mean beliefs | supports caution in (g) and (h); not read (**M**) |

**Nothing in the 2025-26 empirical Polymarket literature that I read uses Bregman or Frank-Wolfe.** I text-searched my extraction of Saguillo et al. for `Bregman`, `Frank`, `Kroer`, `Abernethy`, `LMSR` and found no match; Hanson appears only as a citation for the Policy Analysis Market (**H**, with the caveat that ligatures are dropped in the extraction, which does not affect these words). Claims in circulation that tie "$40M Polymarket arbitrage" to Bregman projections are not supported by that paper; the Bregman/IP machinery comes from Kroer et al. and the relation-to-hull framing from Zhai and Shi.

### 5.2 Empirical work on prediction-market arbitrage and cross-venue pricing

| Citation | Verified how | Data and claim (as read) | Flags |
|---|---|---|---|
| Saguillo, Ghafouri, Kiffer, Suarez-Tangil, "Unravelling the Probabilistic Forest: Arbitrage in Prediction Markets", AFT 2025 (LIPIcs vol. 354, pp. 27:1-27:24, 2025-10-06) | arXiv 2508.03474 v1 (read HTML and extracted PDF); Dagstuhl landing page (H) | 17,218 conditions (8,559 in 1,578 negRisk markets, 8,659 single), markets resolved 2024-04-01 to 2025-04-01. Two types: market rebalancing (within a condition or market) and combinatorial (across dependent markets). 7,051 conditions had at least one opportunity (2,628 negRisk, 4,423 single). Realized profit estimate: "$39,587,585.02, assuming an ε=$1 profit per trade" (quote); top account $2,009,631.76 over 4,049 transactions. Combinatorial: 46,360 US-election pairs, 1,576 labelled dependent, 374 passed the subset checker, 13 confirmed | **STALE?** and pre-fee-schedule (Polymarket charged no per-trade fees then). Detection uses `abs(1 - VWAP sum) > 0.02`, block-level VWAPs with last-price carry-forward; profits inferred from on-chain bid grouping; paper says non-atomic risk exists |
| Gebele and Matthes, "Semantic Non-Fungibility and Violations of the Law of One Price in Prediction Markets", arXiv 2601.01706 (2026-01-05) | read HTML | 102,275 events, ten venues, 2018-2025; about 6% in a cross-platform relation; 1,501 equivalence classes (6,709 relations), 1,645 subset structures (6,421 relations), 1,123 negRisk constructions (2,771 markets); persistent execution-adjusted deviations of 2-4% for the most liquid constructions; deviations kept only if they last at least 30 minutes (Polymarket-Kalshi) or one hour; naive backtest 1,218.66% over 800 days and 15 trades | Data partly **STALE?**; fee assumptions outdated by 2026 schedules; the 1,218.66% is a mechanical backtest, not achievable |
| Gebele, Mutzel, Matthes, "Executable Arbitrage and Market Efficiency in Prediction Markets", arXiv 2608.00666 (2026-08-01) | read HTML | Polymarket negRisk: payoff-space versus protocol-executable no-arbitrage; CLOB panel 32,702 events, 259M trades to 2025-12-31; L2 windows 2026-04-14 to 2026-05-19; about $1.12M profit (about $1.086M converter-enabled, $32K settlement-based); 2,098 positive YES-side vs 36 NO-side CLOB episodes; median durations 16.15 s (YES) and 7.99 s (NO); depth-aware edge definitions | Recent; gas omitted (relayer) |
| Zhai and Shi, "Combinatorial Arbitrage in Prediction Markets", SSRN 7587019 (2026) | Crossref abstract | 1.9M logical relations over more than 255,000 contracts; replay of full-depth Polymarket books; guaranteed profit after spreads and fees 2.2% of committed capital, 3.2% at resolution; opportunities persist longer where relation discovery and execution are more costly | **abstract only** |
| Cheng, Yang, Zou, "Arbitrage Analysis in Polymarket NBA Markets", arXiv 2605.00864 / SSRN 6624718 (2026) | read HTML | 75,088,497 L1 snapshots, 173 NBA games, 2026-02-04 to 2026-03-04; single-market 7 episodes of 3,042 markets, median 3.614 s; combinatorial (moneyline vs spread subset) 290 executable episodes, median 16 s; capped profit $210.19 and $559.59; 76.9% of combinatorial episodes could not use a $100 budget | One month, NBA only, zero fee category, polling lower bound |
| Ng, Peng, Tao, Zhou, "Price Discovery and Trading in Modern Prediction Markets", SSRN 5331995 | Crossref abstract | 2024 election window; Polymarket, Kalshi, PredictIt, Robinhood; Polymarket leads Kalshi in price discovery; significant cross-platform disparities, "implying economically meaningful arbitrage opportunities" | abstract only; **STALE?** (2024 data) |
| Clinton and Huang, "Prediction Markets? The Accuracy and Efficiency of $2.4 Billion in the 2024 Presidential Election", OSF preprint 2025 | Crossref DOI 10.31235/osf.io/d5yx2 | Reported by Nechepurenko (arXiv 2604.24147): on 62 of 65 days Harris and Trump prices "did not sum to $1.00 on at least one major platform" | secondhand (**M**) |
| Stershic and Gujral, "Arbitrage in Political Prediction Markets", J. Prediction Markets 14(1), 2020 | Crossref abstract | PredictIt chronically mispriced vs IEM, large arbitrage profits in 2016, attributed to profit fees and contract limits | **STALE?** (2016-2020 data) |
| Tetlock, "Liquidity and Prediction Market Efficiency", SSRN 929916 (2008) | Crossref abstract | TradeSports: liquidity does not reduce deviations; naive limit orders; favourite-longshot | **STALE?**; background |
| Portnaya, "Do Prediction Markets Match Option Prices? Bitcoin Threshold Evidence from Binance and Polymarket", arXiv 2606.19517 (2026-06-17) | arXiv abstract | See 3.8; gap 5.6 to 6.3 points, Deribit 11 points, AR(1) half-life about 4 h | main contract Sept 2023, **STALE?** sample |
| Lee, Lee, Lee, "Cryptocurrency Prediction Markets through the Derivatives Lens", SSRN 6748186 | Crossref abstract | 113,338 BTC/ETH contracts, Sept 2025 to Feb 2026; Polymarket VRP about 16x Kalshi's; both venues underconfident | abstract only |
| Dai, Jia, Yu, "Settlement Manipulation in Prediction Markets", arXiv 2606.31675 (2026-06-30) | read HTML (first 100k chars) | Polymarket 5-minute BTC contract launched 2026-02-12; Chainlink-based settlement; 821 likely manipulators (1 in 300 of about 243,000 traders) earning about $8.2M in pushed cycles; absent in 15-minute contracts; Binance is on the same side as resolution about 85% of the time | Single-venue, but shows reference-price divergence |
| Nechepurenko, "Contract Retrieval and Payoff Differences across Kalshi and Polymarket", SSRN 7589581 (2026) | Crossref abstract | 30 days: 1,029,600 Kalshi market records vs 1,226 Polymarket ids; a lexical matcher yields 3,117,473 candidate pairs, a field-aware one 1,486,341 relation rows; of a 294-pair sample, 206 show documented payoff differences ("event occurrence versus utterance, winning versus reaching a vote-share threshold, and path barriers versus fixed-time measurements") | abstract only; says it does not estimate venue-wide equivalence |
| Nechepurenko, "Two Models of Event Finality", arXiv 2610.00183 (2026-09-17) | read HTML (first 100k chars) | Polymarket 99,283 protocol payout records, 410 fifty-fifty and 2 other non-binary; Kalshi determination-to-endpoint mean 322.5 s (max 7,133 s) for ordinary markets; cross-venue numeric comparison "remains blocked" | Kalshi-native results |
| Becker, "The Microstructure of Wealth Transfer in Prediction Markets" (Jan 2026; SSRN 7217640) | read blog page; Crossref | Kalshi, 72.1M trades, $18.26B, 2021-06 to 2025-11: takers -1.12%, makers +1.12% average excess return per trade, gross of fees; maker profit attributed to "structural arbitrage" against longshot-preferring takers | maker status is a proxy |
| Diercks, Katz, Wright, "Kalshi and the Rise of Macro Markets", FEDS 2026-010 | read PDF | Kalshi vs SME and fed funds futures; futures need a two-outcome tree; Kalshi mode perfect on the day before FOMC | See 3.8 |
| Burgi, Deng, Whelan, "Makers and Takers: The Economics of the Kalshi Prediction Market", UCD WP25/19 (Sept 2025) | via Wikipedia only (PDF 403) | Reported: favourite-longshot; takers lose 31.46%, makers 9.64% on average; Kalshi fee `0.07 P (1-P)` | **M** |
| Rohanifar, Ahmed, Sultana, "Prediction Laundering", arXiv 2602.05181 | arXiv abstract | Qualitative audit of Polymarket governance | no incident list |
| ParlayMarket (arXiv 2603.22596) and LOPMM (arXiv 2607.18299) | arXiv abstract | Parlay/joint contract market makers priced from a shared pairwise model; Kalshi combo data used | relevant to (e) |

### 5.3 Cross-checks of claims quoted elsewhere in this repo

- docs/research-notes.md: "CFTC advisory (2026-02-25)": **verified** (section 9). "Tightened Polymarket/Kalshi rules (2026-03)": **verified at M** (section 9).
- doc 10 says Saguillo et al. state "All arbitrage opportunities observed are long". **Quote is accurate (Section 6.1)** but applies to the within-condition VWAP detection of Section 6.1; the paper's Section 7 profit tables include selling strategies ($4.68M selling above $1 on single conditions; $17.31M buying NO on negRisk) and a figure caption in Appendix H.1 says "overall shorting has more profit". The two statements are in tension inside the paper; treat "all long" as a statement about the detection stage only (H).
- doc 10 writes the venue as "AFT 2025": **verified** (Dagstuhl LIPIcs vol. 354, 2025-10-06). Wikipedia's reference list gives volume 364; the Dagstuhl page says 354.
- The $39.59M figure: the paper's six rebalancing components add to $39,597,215 (my arithmetic) and the four combinatorial pairs to $95,157; the paper's stated total is $39,587,585.02. The figures do not reconcile exactly (difference $9.6K on rebalancing alone). The paper does not justify `epsilon = $1`.

---

## 6. Empirically documented profit magnitudes

### 6.1 From the literature (with the conditions under which each number was measured)

| # | Magnitude | Sample and conditions | Source | Tag |
|---|---|---|---|---|
| 1 | **$39.59M** realized arbitrage profit estimate (rebalancing parts alone add to $39.60M; combinatorial pairs $0.095M, 0.24% of the total) | Polymarket, 17,218 conditions, resolved 2024-04-01 to 2025-04-01; zero fees; `epsilon = $1` per trade; VWAP detection with last-price carry-forward; profit inferred from on-chain bid grouping | Saguillo et al., arXiv 2508.03474, Sec. 7 | H, **STALE?** |
| 2 | **$2.01M** to the top account over 4,049 transactions; top 10 accounts in Table 1 | same | same | H, **STALE?** |
| 3 | Split of #1: single conditions: buy below 1 $5.90M, sell above 1 $4.68M; negRisk: buy YES $11.09M, buy NO $17.31M, sell YES $0.61M, sell NO $0.004M; combinatorial: $60.2K, $18.5K, $15.8K, $0.6K | same | same | H (my sums) |
| 4 | **$1.12M** (about $1.086M converter-enabled, $32K settlement-based) | Polymarket negRisk, CLOB actor panel (32,702 events, 259M trades) to 2025-12-31; converter matching within 5 blocks; an anomalous cluster of 75 conversions by 3 addresses on 2025-12-12 (381,748 USDC) is excluded from one sub-figure | Gebele, Mutzel, Matthes, arXiv 2608.00666 | H |
| 5 | **2.2%** of committed capital guaranteed after spreads and fees; **3.2%** at resolution | Replay of full-depth Polymarket books against 1.9M logical relations over more than 255,000 contracts, settled portfolios | Zhai and Shi, SSRN 7587019 | H (abstract) |
| 6 | NBA: single-market capped profit **$210.19** (uncapped $4,418.44) over 7 episodes; combinatorial capped **$559.59** (uncapped $2,032.75) over 290 episodes; median yield 101.01 bps; median size about 14.8 synthetic shares | 173 games, 2026-02-04 to 2026-03-04, L1 only, $100 cap, zero-fee category | Cheng, Yang, Zou, arXiv 2605.00864 | H |
| 7 | Cross-venue **2 to 4 percent** execution-adjusted deviations for the most liquid constructions; Polymarket-Kalshi spreads about **3 cents** average, **7 cents** sustained before the 2024 election call | 10 venues, 2018-2025 (Polymarket-Kalshi: only deviations lasting at least 30 min) | Gebele and Matthes, arXiv 2601.01706 | H, partly **STALE?** |
| 8 | 1,218.66% cumulative over 800 days, 15 trades (naive highest-yield equivalent-pair strategy from 2022) | their execution assumptions (Appendix, not read in my fetch) | same | H as reported; **not achievable**, do not use |
| 9 | BTC threshold contracts vs options: **5.6 to 6.3 points** mean gap; **11 points** vs Deribit; AR(1) half-life about **4 h**; hedged proxy profitable after conservative costs, marginal precision | Hourly, 214 and 287 observations; main contract Sept 2023 | Portnaya, arXiv 2606.19517 | H (abstract), **STALE?** |
| 10 | Maker excess return **+1.12%** per trade, takers **-1.12%**, gross of fees | Kalshi, 72.1M trades, $18.26B, 2021-06 to 2025-11 | Becker (Jan 2026; SSRN 7217640) | H |
| 11 | Harris plus Trump did not sum to $1.00 on at least one major platform on **62 of 65** days before the 2024 election | 2024 US election | Clinton and Huang via Nechepurenko arXiv 2604.24147 | M, **STALE?** |
| 12 | PredictIt "large arbitrage profits" in 2016 vs IEM, "non-negligible" 2020 | Fees and contract limits explain | Stershic and Gujral, JPM 14(1) | H abstract, **STALE?** |
| 13 | "Cross-platform arb 2-10%, window shrinking" | Chinese-language compendium of repos | doc 10 (Oceanjackson1 compendium) | L |

Reading across: at 2026 depth the documented per-episode profits are small (NBA: roughly $0.5 to $30 per capped episode; my live negRisk sets: $0 to $11 net of fees on $13 to $1,181 of capital). The large aggregates ($39.6M in 2024-25, $1.1M converter-enabled to end-2025) are sums over many actors and months, and the first was earned with zero fees.

### 6.2 My measurements: method

Script `snapshot.py` plus `poly_ladders.py`, public GETs, timestamps in UTC. **Sample limits:** top 1,500 Polymarket events by 24 h volume (not a random sample); top 1,600 open Kalshi events in API order; top-of-book from Gamma `bestBid/bestAsk` (can lag the CLOB by seconds to minutes) and Kalshi `yes_bid/yes_ask`; no depth except where stated; fees from `feeSchedule.rate` (Polymarket) and `0.07 p(1-p)` (Kalshi, M); a snapshot cannot measure persistence except through the re-checks below.

### 6.3 My measurements: top-of-book consistency at 2026-10-18 18:11-18:12 UTC

**Polymarket negRisk sets (type b2).** 1,500 events fetched (15 requests). 781 are negRisk, 258 of them augmented. 492 are complete (non-augmented, at least 3 markets, every market open and accepting orders).

| Statistic (492 complete negRisk events) | Value |
|---|---|
| Full ask quotes on every leg | 492 |
| Full bid quotes on every leg | 170 |
| `sum ask`: min / p10 / median / p90 / max | 0.954 / 1.002 / 1.067 / 3.0 / 26.2 |
| `sum bid`: min / p10 / median / p90 / max | 0.455 / 0.769 / 0.970 / 0.990 / 1.008 |
| Long-all-YES gross gap (`sum ask < 1`) | 8 events (1.6%) |
| ... of which positive after taker fees | 4 (0.8%) |
| Short basket gross gap (`sum bid > 1`) | 2 of 170 |
| ... of which positive after fees | 0 |

The typical event carries a full-set ask overround of about 6.7 cents and a bid shortfall of about 3 cents, so crossing the set costs roughly 10 cents of spread; only the rare tight events cross. The best gaps were small and thin: General Mills Q2 organic net-sales growth 4.6 c (24 h volume about $5.3K); OpenAI IPO market-cap buckets 4.4 c (about $17.7K); Bitcoin vs Gold vs S&P 500 3.0 c (about $1.5K). **Re-check 12 minutes later (18:23 UTC):** 7 of the 8 still had `sum ask < 1` (the Resident Evil box-office set had flipped to 1.008); fee-adjusted positives were OpenAI 3.2 c, General Mills 0.01 c, BTC/Gold/S&P 0.23 c. **Re-check 28 minutes after the snapshot (18:38 UTC):** 6 of the 8 still had `sum ask < 1` (the Los Angeles temperature set for October 19 had flipped to 1.029 and Resident Evil stayed at 1.008); fee-adjusted positives were OpenAI 3.0 c, BTC/Gold/S&P 0.23 c and General Mills 0.01 c. Sample size is 8 events and 28 minutes, so it says only that the long-dated sets persisted while the two short-dated ones (resolving within 13 days) closed.

**Polymarket within-event ladders (type c).** Parsed `groupItemTitle`: touch ladders (arrow prefix), O/U ladders (outcome 0 is "Over"), and "N+" ladders. 1,527 O/U ladders, 56 barrier ladders, 8 N+ ladders; 3,651 adjacent quoted pairs; **3 gross violations** (a game-total O/U 38.5 vs 39.5 pair of 6 cents, an Uniswap "reach" pair of 2 cents, an ETH "dip" pair of 0.2 cent), all three positive after fees.

**Polymarket cross-event implication chains (type d).** Eight families (Ballon d'Or top 2/3/5/10, EPL top 4 vs top 6, CFB national-championship-game vs playoff, CFB top-4 seed vs playoff, "announce a run" before 2027 vs 2028, BTC/ETH/SOL "hit in October" vs "hit before 2027"). 271 quoted entity pairs, **2 gross violations** (Washington, CFB: 1.7 cents; Luis Diaz, Ballon d'Or: 0.2 cent).

**Kalshi ladders and ME events (types b3, c).** 1,600 open events (8 requests). 873 ladders with at least 3 active markets sharing a close time and direction; 7,274 adjacent quoted pairs; **0 crossed** (`bid_hard > ask_easy`), 1 locked, 4 within one cent, 139 (1.9%) where the harder rung's mid is above the easier rung's (inside the spread). 186 ME events with at least 3 active markets; 93 with full bids; 2 had `sum bid = 1.02` (net negative after fees, one with a minimum bid of 1.7 shares); 21 had `sum ask < 1` but ME is not exhaustive, so not arbitrage.

**Polymarket BTC cumulative ladder vs bucket partition (type c, same source and instant).** For October 19 to 24, "Bitcoin above ___ on October D?" (11 contracts) and "Bitcoin price on October D?" (11 negRisk buckets) were priced from CLOB depth (132 book reads, about 18:18-18:21 UTC) and solved as one LP over 23 states (11 intervals plus exact-equality atoms). **Guaranteed profit was zero on October 19, 20, 21, 23, 24.** On October 22 the LP found $0.03 gross on 10 shares in the 88k-92k tail (buy "above 88,000" at 0.017, sell the 90-92k and above-92k buckets at 0.01 each), $0.0044 after the 7% crypto fee. Interpretation: liquid same-venue ladder/bucket pairs are policed tightly; leftovers are in illiquid tails.

### 6.4 Live depth-aware LP on the flagged negRisk sets (CLOB books, 18:13-18:17 UTC)

| Event | Outcomes | Days to end | Top-of-book `sum ask` (CLOB) | LP gross profit / capital | LP after taker fees / capital | LP after fees and 8% APY lock |
|---|---|---|---|---|---|---|
| General Mills Q2 organic net sales growth | 6 | 65 | 0.977 | $0.755 / $32.95 | **$0.0013** / $13.30 | $0 |
| Bitcoin vs Gold vs S&P 500 in 2026 | 3 | 74 | 0.980 | $22.83 / $1,118.71 | **$2.58** / $1,118.71 (0.23%) | $0 |
| OpenAI IPO closing market cap | 7 | 439 | 0.945 | $44.60 / $1,210.57 | **$10.89** / $1,181.26 (0.92%) | $0 |
| Resident Evil domestic gross by Oct 31 | 7 | 13 | 1.007 | $0 | $0 | $0 |

Reading: depth-aware gross profit is 2.0 to 3.7 percent of capital on the two large sets (2.3% on the thin General Mills set), taker fees remove 76% (OpenAI), 89% (Bitcoin/Gold/S&P) and 99.8% (General Mills) of it, and an 8% APY hurdle over 65 to 439 days removes the rest. The OpenAI set shows the capital-lock effect cleanly: the gross edge (3.7% of capital) is smaller than the 439-day hurdle (about 9.6%). Caveats: the four books were read sequentially (not atomic); the General Mills and OpenAI sets are exhaustive only through their stated default rules (read in the `description`); quoted fee rates came from each market's `feeSchedule`.

### 6.5 Cross-asset snapshot (type h1): Polymarket "Bitcoin above K on Oct 20" vs Deribit

Deribit `get_book_summary_by_currency` (BTC options) at 2026-10-18 18:19:42 UTC, BTC underlying about 81,060 (81,067 and 81,102 on the two expiries used). Digital value from call spreads of width 1,000 on mark prices converted to USD, interpolated in time between the 2026-10-20 08:00 UTC and 2026-10-21 08:00 UTC expiries to Polymarket's 16:00 UTC (weight 1/3 on the later expiry). Polymarket mid versus implied digital: 74k 0.990 vs 0.989; 76k 0.978 vs 0.971; 78k 0.939 vs 0.922; 80k 0.735 vs 0.742; 82k 0.355 vs 0.344; 84k 0.095 vs 0.071; 86k 0.0165 vs 0.0125; 88k 0.0075 vs 0.0025; 90k 0.0055 vs 0.0001. Mean (Polymarket minus options-implied) +0.75 points over 9 strikes, concentrated in the right tail (longshot premium); inside the bid-ask spread at 74k-80k. **One snapshot, 9 strikes, 16 hours of interpolation, different reference indices (Binance 1-minute close vs Deribit index): illustrative only.**

---

## 7. Persistence, half-life, capital lock and resolution timing

| Evidence | Value | Source / sample | Tag |
|---|---|---|---|
| Single-market (YES+NO) episodes | median 3.614 s; 7 of 3,042 markets | Cheng et al., NBA 2026-02/03, polling cycle 3.6-5.5 s (so durations are upper bounds) | H |
| Combinatorial (moneyline vs spread) episodes | median 16 s; 17.2% last 4 s or less | same | H |
| negRisk CLOB violations | median 16.15 s (YES side, n=253), 7.99 s (NO side, n=5); 366 of 624 episodes (58.7%) censored by window edges | Gebele, Mutzel, Matthes, 2026-04-14 to 2026-05-19 | H |
| negRisk AMM-era (FPMM) violations | about 40 episodes open beyond 50 minutes, some longer than a day | same (51 outcome sets, 235 markets) | H |
| Cross-venue deviations | kept only if at least 30 minutes (Polymarket-Kalshi) or 1 hour (general); "many market pairs show arbitrage available nearly all the time", others "almost never" mainly because fees absorb the gap | Gebele and Matthes | H |
| Prediction market vs option-implied | AR(1) half-life about 4 h | Portnaya (2023 sample) | H, **STALE?** |
| Where discovery is costly | opportunities "persist longer and attract less observed participation" | Zhai and Shi | H (abstract) |
| My top-of-book negRisk gaps | 7 of 8 gross gaps still open after 12 minutes and 6 of 8 after 28 minutes; the two that closed were the short-dated sets (resolving within 13 days); the long-dated OpenAI set stayed at about 5.6 c gross | section 6.3, n=8 | H, tiny sample |
| UMA dispute incidence | **76 of 1,000** (7.6%) highest-volume closed Polymarket markets with end date in 2026 had at least one dispute in `umaResolutionStatuses`; **16.2%** of their $20.08B volume; 64 (6.4%) had two or more disputes (second dispute goes to the UMA vote per Polymarket docs, doc 08) | Gamma `/markets/keyset?closed=true&end_date_min=2026-01-01&order=volumeNum`, 10 pages, closed 2025-10-30 to 2026-10-18, 2026-10-18 18:25 UTC | H (selection: top by volume) |
| Dispute rate by theme and rank | geopolitics-keyword markets 27.0% (n=148; 50.9% of their volume), other 7.0% (n=445), sports-style 1.2% (n=407); top-100 by volume 20%, ranks 101-300 9%, ranks 301-1,000 5.4% | same sample, my regex classifier | H for counts, M for the classification |
| Delay from scheduled end to close | undisputed median **3.6 h** (p90 34.8 h, n=649); disputed median **100.1 h** (p90 439.1 h, n=54). Only markets with `closedTime >= endDate` are counted, so early-resolving markets are excluded | same sample | H |
| Polymarket void rate | 410 of 99,283 protocol-resolved conditions (0.41%) paid 50-50 | arXiv 2610.00183 | H |
| Kalshi determination-to-endpoint | mean 322.5 s, max 7,133 s (ordinary); mean 9.7 s (MVE) | arXiv 2610.00183 | H |
| Kalshi settlement timer | `settlement_timer_seconds` 30 on a sampled sports market, 3,600 on Senate control (fixtures) | docs/research/fixtures/kalshi | H |

**Capital-lock rule of thumb.** Charge `rho x T` on deployed capital where `T` is the **latest plausible** resolution on both venues, weighted: `T = T0 + P(dispute) x Delta`. With my 2026 numbers `P(dispute)` is 7.6% across the sample but very uneven: 27.0% (40 of 148) for markets whose question matches a crude geopolitics keyword regex (Iran, ceasefire, Ukraine, Israel, Khamenei, Maduro and similar), 7.0% (31 of 445) for the remainder, 1.2% (5 of 407) for sports-style questions; and it rises with volume rank (20% in the top 100, 9% for ranks 101-300, 5.4% for ranks 301-1,000). `Delta` is about 4 days at the median and 18 days at p90 for disputed markets (the table above). The keyword split is my own crude classifier, so treat the thematic rates as indicative. Gebele and Matthes show annualised yields fall with horizon, so the highest APYs sit in the shortest sets.

---

## 8. Resolution-divergence incidents

Legend for "venue evidence": **both** = I read the resolution/outcome on each venue's own public API or documentation; **one** = only one venue verified; **sec** = secondary report.

### 8.1 Verified cross-venue divergences (2025-2026)

| ID | Date | Event | What each venue did | Divergence | Evidence | Lesson |
|---|---|---|---|---|---|---|
| **R1** | 2026-02-28 to 2026-03-04 | Khamenei "out as Supreme Leader" after his death in strikes | **Polymarket** "Khamenei out ... by February 28?" resolved **YES (1.00)**: rule says removed from power if he "resigns, is detained, or otherwise loses his position or is prevented from fulfilling his duties"; UMA history `proposed, disputed, proposed, disputed`; closed 2026-03-04 01:05 UTC; volume $131.1M. "by March 31?" YES ($63.2M); "by June 30?" YES ($8.2M); "by January 31?" NO ($49.7M). **Kalshi** `KXKHAMENEIOUT` "leave office before 2026-03-01" settled **scalar at $0.02** (last traded price 0.09 after the news; 27.96M contracts); "before 2026-04-01" 0.29; "before 2026-07-01" 0.45; "before 2026-09-01" 0.51 (all `result: scalar`, `finalized`, settled 2026-03-01 03:19 UTC). Kalshi `rules_secondary`: "If Ali Khamenei leaves solely because they have died, ... payouts ... based upon the last traded price (prior to the death)" | Same real-world event, **$1.00 vs $0.02** on the nearest horizon (Feb 28 vs "before Mar 1"); later horizons $1.00 vs 0.29 to 0.51 (windows differ by about a day) | **both (H)** | Death clauses are a rule-text axis (`condition_scope`) that embeddings will miss. The same Kalshi death clause is on the Maduro series text. Complaint *Risch v. KalshiEX*, No. 2:26-cv-02390 (C.D. Cal.), filed 2026-03-05, about a $54M market; Kalshi's CEO said on March 1 that fees and net losses on that market would be reimbursed (Bloomberg Law summary, H as reported); about $2.2M reimbursed (Wikipedia citing Business Insider, M) |
| **R2** | 2026-02-14/15 | US government shutdown, "Feb 14" | **Polymarket** "another-us-government-shutdown-by-february-14" (UI title "Government shutdown on Saturday?"): YES only if OPM announces a **new** shutdown by Feb 14 11:59 PM ET; "A continuation, without any reopening, of the partial government shutdown which began on January 31, 2026, will not qualify" -> resolved **NO**, single proposal, closed 2026-02-15 07:08 UTC, $13.6M. **Kalshi** `KXGOVTSHUTDOWN-26FEB14` "Will the US government be shut down on Feb 14, 2026?": YES if "at least partially shut down due to a lapse of appropriations at 10:00 AM ET" -> **YES** (29.96M contracts traded; settled 2026-02-14 15:33 UTC) | State-based vs new-event semantics | **both (H)** | "Same headline" markets differ on state vs event; both are correct under their own text. A rule-hash gate or `outcome_kind` field is needed |
| **R3** | 2025-11 (shutdown end) | Shutdown "ends" ladder | Polymarket "ends November 12" rung (resolves on the OPM announcement) traded to 97 c, then about 1 c at midnight because the OPM page still showed a lapse; the Nov 13 rung paid $1.00. About $13.1M traded on the Nov 12 rung, about $30M across the ladder. Kalshi settled from an OPM page snapshot at about 10-11 AM ET | Different clocks and announcement vs occurrence; "both settled correctly under their own published rules" | **sec (M)**: OddsShopper 2026-08-15 and Convex Lake 2026-09-23 agree; no primary read | Date ladders (type c) are announcement-based, not event-based. **STALE?** (Nov 2025) |
| **R4** | 2026-01-31 | Shutdown "by Jan 31" | Both YES. Polymarket ("by January 31, 2026, 11:59 PM ET", OPM page, $157.3M) went through two disputes and closed **2026-02-04 00:35 UTC**; Kalshi `KXGOVSHUT-26JAN31` (OPM notice that the government "at least partially shut down on January 31, 2026 at 11:00 AM ET"; 60.6M contracts) closed 16:00 UTC and settled **2026-01-31 17:00:58 UTC** | Same payout, **about 3.3 days later** on Polymarket | **both (H)** for outcomes and dates | Payout agreement does not imply timing agreement; lock cost differs |
| **R5** | ongoing | NYC daily high temperature | Kalshi resolves on NOAA's Central Park station, Polymarket on LaGuardia (Gebele and Matthes, Sec. 2.3; their only ex-post consistency exception); Convex Lake: agreement 32.4% in NYC vs 61.8% in Miami over 102 resolved city-days | Different stations "frequently record different temperatures" | paper H; blog M; doc 10 saw Kalshi `settlement_sources` change over time | Re-read `settlement_sources` at every refresh |
| **R6** | 2024-11 | US presidential election | Polymarket and Limitless: media network calls; Kalshi and Myriad: inauguration | Strict subset relation (type d); payouts equal in the realised state | H (Gebele and Matthes Sec. 5.5) | Timing and subset, not payout, risk. **STALE?** |

### 8.2 Calibration cases where the venues agreed (so the list is not read as "venues always differ")

- **Maduro, Jan 2026.** Polymarket "Maduro out by January 31, 2026?" resolved YES on a single proposal (closed 2026-01-03 12:14 UTC, $11.0M) and "Maduro in U.S. custody by January 31?" YES after two disputes (closed 2026-01-07). Kalshi `KXMADUROOUT` "leave office before ..." (Feb, Mar, Apr, May, Jun 2026) all settled YES 1.00 on 2026-01-04 (the November 2025 contract: NO). Both read capture as leaving office; Kalshi's death clause was not triggered. (H, both.)

### 8.3 Single-venue oracle incidents that create hedge risk for anyone long the other leg

| Date | Case | Facts | Tag |
|---|---|---|---|
| 2025-07-01 | Polymarket "Zelenskyy wear a suit" (UMA) | Rule: "consensus of credible reporting"; NATO appearance 2025-06-24 described by many outlets as a suit; initial YES proposal disputed; UMA finalised **NO** on 2025-07-01; Decrypt reports over $237M volume, CoinDesk (2025-07-07, before finality) over $160M and the YES price falling from 0.19 to 0.04; critics: token-weighted voting; a similar May market with a near-identical outfit was also ruled insufficient. Kalshi not mentioned in either article. Myriad listed a meta-market on Polymarket's decision | H as reported, **STALE?** (more than 6 months) |
| 2025-03 | Polymarket Ukraine-themed market (UMA) | CoinDesk 2025-07-07 refers to "a similar dispute in March over another Ukrainian-themed market" with manipulation claims against large UMA holders; doc 10 recorded the minerals market (about $7M) as resolved YES via a large holder's votes (M, The Block, The Defiant) | M, **STALE?** |
| 2026 base rate | Polymarket UMA disputes | 7.6% of the top 1,000 closed markets by volume, 16.2% of volume; examples (all with two or more disputes unless noted): MicroStrategy sells any Bitcoin by May 31, 2026 ($375.8M, resolved NO); US forces enter Iran by April 30 ($269.0M, YES); US x Iran ceasefire extended by April 22 ($203.6M, NO, 3 disputes); US x Iran permanent peace deal by June 15 ($177.4M, YES); US government shutdown Saturday ($157.3M, YES); Netanyahu out by March 31 ($104.2M, NO); even macro markets: "no change in Fed rates after the April 2026 meeting" ($76.9M, YES, one dispute) | H |
| 2025-11-14/15 | Polymarket Myrnohrad capture bet | ISW map advance removed after the bet closed; data provider accused Polymarket of misuse (Meduza, 404 Media via Wikipedia) | M |
| 2026-06 | Polymarket changing terms | WSJ: "a track record of changing the terms of wagers, even after bets have been made" (via Wikipedia) | M |
| 2026-02 onward | Polymarket 5-minute BTC | Chainlink-based settlement; Binance lands on the same side about 85% of the time; settlement-time pushes flip outcomes (Dai, Jia, Yu) | H |

### 8.4 Taxonomy of divergence causes seen

1. **Exception clauses** (death, cancellation, postponement): R1.
2. **State vs event semantics:** R2.
3. **Clock and announcement vs occurrence:** R3, R4, Jan 2026 shutdown pair in doc 10/OddsShopper.
4. **Different named source:** R5.
5. **Subset by resolution trigger (call vs inauguration):** R6.
6. **Oracle design:** UMA token vote (disputes, 4+ day lock-ups) vs exchange determination (minutes).
7. **Reference index (Chainlink vs Binance vs Deribit index).**
8. Nechepurenko's labelled classes in 206 sampled pairs: "event occurrence versus utterance", "winning versus reaching a vote-share threshold", "path barriers versus fixed-time measurements".

---

## 9. Regulatory and exchange-rule context (2026)

### 9.1 Verification of the claims in docs/research-notes.md

| Claim | Result | Evidence |
|---|---|---|
| CFTC advisory dated 2026-02-25 | **Verified, H.** CFTC Division of Enforcement, Release 9185-26, "CFTC Enforcement Division Issues Prediction Markets Advisory", 2026-02-25. Issued after two KalshiEX matters handled by Kalshi's own program (a candidate trading on his own candidacy, May 2025, $2,246.36 and a 5-year suspension; a YouTube channel editor, Aug-Sep 2025, $20,397.58 and a 2-year suspension). Lists insider trading (misappropriation, Section 6(c)(1) and Reg. 180.1), pre-arranged noncompetitive trading and wash sales (Sections 4c(a)(1), (2)(A), Reg. 1.38(a)), disruptive trading (4c(a)(5)), fraud and manipulation; restates that DCMs have an independent duty under the CEA Section 5(d) core principles to keep audit trails, run surveillance and enforce rules. **Does not mention** algorithmic or automated trading, bots, market makers, or cross-venue or arbitrage activity (re-read this session) | cftc.gov/PressRoom/PressReleases/9185-26 |
| "March 2026 Polymarket/Kalshi rule changes" | **Verified, M.** Per Venable (2026-04): Kalshi and Polymarket announced measures on **2026-03-23**, Kalshi's hours after Polymarket's; Polymarket's rulebook footnoted as dated 2026-03-20. Polymarket bars trading on information obtained in breach of "a preexisting duty or obligation of trust or confidence owed to another person" and trading by people who can influence the outcome. Kalshi added technological guardrails against politicians trading their own campaigns and athletes trading their leagues. Venable does **not** discuss wash trading, spoofing, bots, market making or arbitrage. Polymarket's `integrity.polymarket.com` (H, read): lists "Spoofing, Wash trading, Fictitious transactions, Self-dealing, Front-running, Information misuse, Attempted manipulation, Disruptive practices, Fraud"; the page cites April 23, 2026 CFTC and DOJ announcements and links the Polymarket US Rulebook dated 2026.04.21; it is silent on automated trading | venable.com/insights/publications/2026/04/kalshi-and-polymarket-move-to-curb-insider |
| (extra) CFTC DMO Staff Advisory 26-08, 2026-03-12 | **M/H partial.** PDF read (text partially extractable): "DCM Core Principle 3 requires a DCM to only list for trading contracts that are not readily susceptible to manipulation" and footnote 26: "A statement that a contract will settle based upon a consensus of yet-to-be-determined sources may not be sufficient to satisfy the requirements of DCM Core Principle 3." That footnote bears directly on Polymarket-style "consensus of credible reporting" wording if it were listed on a DCM, and on the cross-venue source-risk analysis here | cftc.gov/csl/26-08/download |
| (extra) CFTC ANPRM, 2026-03-12 | **H** (press release 9194-26; 91 FR 12516; 45-day comment window): scope is core principles, contrary-to-public-interest contracts and cost-benefit. The press release does not mention manipulation, surveillance, market makers or automated trading. **Full Federal Register text not read** (bot redirect) | cftc.gov/PressRoom/PressReleases/9194-26 |

### 9.2 Automation and market-making rules that bear on an arbitrage or market-making operator

- **Polymarket US Rulebook (2026.09.30; 84 pages; downloaded and text-extracted; H).** Rule 5.2(i): "Participants utilizing automated trading systems must implement pre-trade risk controls including order throttles, price collars, and kill switches." Rule 5.2(h): participants must keep an electronic audit trail sufficient to reconstruct trading. Rule 5.3(b): order-rate limiter. Rule 7.2: prohibitions include (n) fictitious transactions or orders that create "a false, misleading, or artificial appearance of activity", (o) trading during the closing/reference-price period "with the intent to move, fix, or artificially influence the settlement price", (p) buying and selling "in the same product and expiration month" to avoid bona fide market risk is a wash trade, while "opposing positions of the same expiration may be used to close positions before expiration"; the rulebook also bars intentionally matching one's own orders across accounts under common control. Chapter 4: designated **Market Makers** with obligations and benefits (financial incentives, reduced fees, different position accountability levels).
  - Relevance: a cross-venue arbitrage is not a wash trade (different products and venues), but running both legs on one venue through several accounts, or a creator trading its own market (the plan's "self-trading always allowed" decision, doc 10 section 7), hits (p) and the common-control matching rule. Rule (o) matters for any strategy that pushes settlement references (compare Dai, Jia, Yu on 5-minute BTC contracts).
- **Polymarket (global).** Docs openly document a **Market Making** guide, Maker Rebates, Liquidity Rewards, a Builder Program, and **Combos RFQ for market makers** (docs.polymarket.com index, H). Explicit bot clause in the Terms: NOT FOUND (doc 08: Terms page client-rendered). Geoblock: United States close-only (doc 08, H).
- **Kalshi.** Docs expose **RFQ** (REST, FIX, WebSocket; "makers" quote, requester accepts, maker confirms), **FIX API**, tiered rate limits earned by trading volume (up to Prime and Prestige), a **Get Incentives** endpoint for market-specific rewards, and API-key access levels "Premier or Market Maker" (docs.kalshi.com llms.txt and rate_limits, H). Developer Agreement v1.1 (2023) restricts caching/aggregating data and "facilitating trading ... by other members" (doc 08; **STALE?**). Kalshi's own rulebook: not reachable (bot challenge).
- **Regulator view of arbitrage or market-making specifically:** NOT FOUND in the CFTC advisory, ANPRM press release, DMO advisory (partial) or Venable summary. The live exposures are insider/MNPI, wash and pre-arranged trading, manipulation of settlement references, venue terms on bots and data use, eligibility and geoblocking.
- **State and federal litigation context (M, Wikipedia reference lists):** CFTC suing several states for exclusive jurisdiction, state bans and injunctions (Massachusetts, Nevada, Ohio, Minnesota), country blocks of Polymarket; out of scope here, but they bear on funding and on whether a venue can be reached from a given jurisdiction at all.

---

## 10. Design implications for the aggregation layer

1. **Represent every relation as a payoff matrix over a state set, not as a pair rule.** Keep relation `type` in `{identical, complement, partition, ladder, bucket, date_ladder, touch_vs_terminal, implication, joint, exclusive, factor, cross_asset}`; the LP of section 4 consumes any of them uniformly, and the dual gives a no-arbitrage certificate for logging.
2. **Add void and alternative-resolution rows per venue** (UMA 50-50; Kalshi scalar/last-price; XO VOIDED, doc 10) and report both the plain and the robust guaranteed profit. In my worked example the robust value is zero.
3. **Tier the output by risk class.** `risk_free_payoff_space` only for (b1), (b2) with a verified default rule, and (c)/(e) within one source and clock; everything cross-venue (a, d, f) is a **hedge with reserve** unless the pair has an approved rule-hash mapping and `divergence_axes == []` (doc 10 gates). (g) and (h) are relative-value signals, never arbitrage.
4. **Measured base rates argue for cheap pre-filters.** Within one venue, liquid ladders and ladder/bucket pairs are almost always consistent (Polymarket 3 of 3,651 pairs; Kalshi 0 of 7,274). The money, such as it is, sits in (i) negRisk and bucket partitions with 2 to 4 percent depth-aware gross edge that fees and lock-up usually remove, (ii) illiquid tails, (iii) cross-venue pairs where rule differences dominate. Scan negRisk sets first, ladders second.
5. **Lock-up and dispute tail belong in the objective.** Use `T = T0 + P(dispute) x Delta` with per-category dispute rates (geopolitics-keyword questions 27% vs sports-style 1.2% in my crude split). Do not rely on the 2-cent Saguillo bound; break-even gross spreads in 2026 are 2.0 to 3.5 cents at mid prices (doc 10) before lock-up.
6. **XO.** XO's negRisk is always false (doc 08) and its resolver is MANUAL/MODRA (doc 10), so any XO-versus-X pair is `settlement_source` divergent by default; within XO the only native relations are (b1) and user-built ladders. XO's ~9 active markets means (b2)/(c) scanning inside XO has almost no surface; its value is as a fair-value target for cross-venue hedges flagged as such.
7. **Quotient as signal.** Use it for (g) factor views and for ranking candidate pairs, not as a constraint.
8. **Event hygiene.** Re-read `description`, `umaResolutionStatuses`, `settlement_sources`, `rules_secondary` and `can_close_early` on every refresh; auto-suspend a pair when any changes (Polymarket can alter terms, WSJ via Wikipedia; Kalshi can edit `rules_secondary`).

### 10.1 What already ties related markets together (cross-reference to doc 10, mapped to this taxonomy)

All rows are **M** unless noted: they restate doc 10's reading of vendor docs and repos (I did not re-read them, and no third-party code was run). The question is which relation types each one implements and whether any solves the joint LP.

| Tool | Relation types it labels or searches | Execution realism | Gap against this taxonomy |
|---|---|---|---|
| pmxt Router (MIT client; hosted matcher) | `identity, complement, subset, superset, overlap, disjoint`; `fetchMatchedMarketClusters`, `fetchRelatedMarkets`, `fetchHedges` | Read-only; `getExecutionPriceDetailed` is a single-venue float VWAP walker with no fees | (a), (d), (f) labels only; no ladders, buckets or joint states; matcher is a black box |
| Oddpool (SaaS) | `outcome_kind` includes `range_bin, threshold_above, threshold_below, will_happen_by_date, spread`; `basis_class`, `divergence_axes` `{timing, source, condition_scope}`, `fungible` flag; `/arbitrage/current` cross-venue YES+NO with per-level fees and two-leg ask-ladder walk (top 25 levels) | Explicitly "does not model slippage from latency, partial fills, or order-placement minimums" | Best schema for (a) and its failure modes; two-leg complement only; no partitions or lock-up |
| Predictefy (beta SaaS; the only one listing XO) | `clusters` with an uncalibrated similarity score, `discrepancies`, `fetchArbitrage` with an executable-label gate list | Gate list is the best published checklist | Same limits as Oddpool; XO lane unproven |
| Prediction Hunt, Kairos | `matching-markets` groups with `/arb` and `/ev`; Kairos merges Kalshi, Polymarket and Predict.fun books into one NBBO ladder | Method undisclosed | (a) only |
| oracle3 (Apache-2.0 repo) | `implication, exclusivity, complement, same_event, event_sum` returning baskets with per-leg fees | Its own assumptions: relation correctly specified; "capital locked until resolution is not charged a cost" | Covers (b2), (d), (f); no void rows, no lock cost, no depth LP |
| polyclaw (Apache-2.0 repo) | LLM contrapositive hedges with coverage tiers (T1 at least 95%) | Tiers below 100% are hedges | (d) as partial hedges |
| Academic: Saguillo et al. (LLM outcome tables), Gebele and Matthes (semantic alignment), Zhai and Shi (1.9M relations plus IP) | (a), (b2), (d), (f); Zhai and Shi cover the general logical case | Zhai and Shi replay full-depth books | Research code, not a service; Zhai and Shi's full text not read |

**Finding (M, from doc 10 plus the above):** nothing I found both (i) registers the platforms with rule-level payoff metadata (resolver, void policy, fee model, tick, close semantics) and (ii) solves a joint-state LP with depth, fees, lock-up and void rows. Closest are Oddpool's schema for (i) and Zhai and Shi's method for (ii). Venue-level directories (pmxt `COMPLIANCE.md` lists 15 venues, Predictefy serves 16, DefiLlama's prediction-market category, the "Awesome-Prediction-Market-Tools" README) enumerate platforms but carry no payoff semantics; see docs/research/10 and the venue-census work for those lists.

---

## 11. NOT FOUND, unverified items and open questions

- **NOT FOUND (searched: arXiv API abstracts, Crossref bibliographic queries, venue docs):** an empirical paper comparing Kalshi/Polymarket sports prices with vig-free sportsbook odds; any 2026 regulatory text addressing cross-venue arbitrage or automated market making as such; a peer-reviewed measurement of Polymarket-versus-Kalshi persistence/half-life in 2025-26 (the nearest are the 30-minute persistence filter in Gebele and Matthes and the 4-hour option-gap half-life in Portnaya).
- **Unverified (reached only through snippets or secondary lists):** the Wikipedia/Business Insider figure of about $2.2M reimbursed by Kalshi; Wikipedia's claim that Kalshi "froze" about $54M (the Bloomberg Law summary of the complaint says $54M market, H as reported); WaPo, Business Insider, Forbes and Gambling Insider articles (blocked); Gambling Insider on the Polymarket "Venezuela invasion" market left unsettled in Jan 2026 (could not read; L).
- **R1 compares near-identical, not identical, windows** (Polymarket "by February 28 / March 31 / June 30" against Kalshi "before March 1 / April 1 / July 1 / September 1"); I did not check other leaders or other death-clause series beyond Maduro, Khamenei and Netanyahu.
- **Kalshi fee coefficient 0.07** and maker-fee rules remain M (official PDF blocked in doc 08).
- **Search budget:** one successful WebSearch, then "budget used up"; everything not first-hand is flagged.
- Open questions for the project: (1) does XO publish a `VOIDED` payoff that can be modelled as a state row (doc 10 says a refund path exists in market rules; the numeric payoff is per market); (2) which Kalshi series carry the death clause (Maduro and Khamenei do; Netanyahu uses "last fair price as determined in the sole discretion of the Exchange"); (3) a machine-readable `exception_clauses` field in the pair registry.

---

## 12. Sources

**Papers and datasets (URLs fetched or verified):**
- https://arxiv.org/abs/2508.03474 and https://arxiv.org/html/2508.03474v1; PDF text-extracted; https://drops.dagstuhl.de/entities/document/10.4230/LIPIcs.AFT.2025.27
- https://arxiv.org/abs/2601.01706 and https://arxiv.org/html/2601.01706v1
- https://arxiv.org/abs/2608.00666 and https://arxiv.org/html/2608.00666v1
- https://arxiv.org/abs/2605.00864 and https://arxiv.org/html/2605.00864v1 (SSRN 6624718 via Crossref)
- https://arxiv.org/abs/2606.19517; https://arxiv.org/abs/2606.31675 and https://arxiv.org/html/2606.31675
- https://arxiv.org/abs/2610.00183 and https://arxiv.org/html/2610.00183; https://arxiv.org/abs/2609.17610; https://arxiv.org/html/2604.24147; https://arxiv.org/abs/2602.05181; https://arxiv.org/abs/2603.22596; https://arxiv.org/abs/2609.06005 (read, not relevant to arbitrage)
- https://arxiv.org/abs/1606.02825 (PDF text-extracted); https://arxiv.org/abs/1011.1941; https://arxiv.org/abs/0802.1362; https://arxiv.org/abs/1206.5252 (existence)
- Crossref records: 10.2139/ssrn.7587019, 10.2139/ssrn.5331995, 10.2139/ssrn.929916, 10.2139/ssrn.7589581, 10.2139/ssrn.6748186, 10.2139/ssrn.6624718, 10.2139/ssrn.7217640, 10.5750/jpm.v14i1.1796, 10.31235/osf.io/d5yx2, 10.1145/2229012.2229047, 10.1145/2465769.2465777, 10.1145/1993574.1993621, 10.1145/2940716.2940767, 10.1145/2482540.2482601, 10.5750/jpm.v1i1.417, 10.1023/a:1022058209073, 10.1145/779928.779946, 10.1016/j.dss.2004.08.010, 10.1145/1807342.1807402, 10.1145/2509413.2509414, 10.1017/cbo9780511800481.028, 10.1016/j.econlet.2006.01.004, 10.1257/0895330041371321, 10.1086/296025, 10.2307/2234240, 10.1016/j.jcorpfin.2025.102800
- https://www.federalreserve.gov/econres/feds/kalshi-and-the-rise-of-macro-markets.htm and https://www.federalreserve.gov/econres/feds/files/2026010pap.pdf (text-extracted)
- https://www.jbecker.dev/research/prediction-market-microstructure

**Regulatory and rules:** https://www.cftc.gov/PressRoom/PressReleases/9185-26 ; https://www.cftc.gov/PressRoom/PressReleases/9194-26 ; https://www.cftc.gov/csl/26-08/download (PDF, partial text) ; https://www.venable.com/insights/publications/2026/04/kalshi-and-polymarket-move-to-curb-insider ; https://integrity.polymarket.com/ ; https://polymarketexchange.com/files/legal/latest/rulebook (Polymarket US Rulebook 2026.09.30, text-extracted) ; https://news.bloomberglaw.com/securities-law/kalshi-sued-over-death-carveout-in-iran-leader-prediction-market

**Venue docs and APIs (public GET):** https://docs.polymarket.com/llms.txt, `/trading/fees.md`, `/concepts/negative-risk.md`, `/trading/market-making.md`, `/trading/positions/combinatorial.md`, `/trading/combos/overview.md`; Gamma `https://gamma-api.polymarket.com/events/keyset`, `/events/slug/{slug}`, `/markets/keyset`; CLOB `https://clob.polymarket.com/book`; https://docs.kalshi.com/llms.txt, `/getting_started/{market_settlement,rfqs,fee_rounding,rate_limits}.md`; Kalshi `https://api.elections.kalshi.com/trade-api/v2/{events,series,markets,historical/markets}`; Deribit `https://www.deribit.com/api/v2/public/get_book_summary_by_currency`.

**Press and blogs (M):** https://www.oddsshopper.com/articles/prediction-markets/kalshi-vs-polymarket-settlement-rules (2026-08-15, Dave Loughran); https://convexlake.com/blog/cross-venue-arbitrage-settlement-risk (2026-09-23); https://decrypt.co/329210/polymarket-rules-no-237m-bet-zelenskyys ; https://www.coindesk.com/markets/2025/07/07/polymarket-embroiled-in-usd160m-controversy-over-whether-zelensky-wore-a-suit-at-nato ; Wikipedia article texts for Kalshi, Polymarket, Prediction market (reference lists only; claims tagged M).

**Repo context read:** docs/plan.md, docs/research-notes.md, docs/research/08, 09, 10, 12 (grep), fixtures `kalshi/markets_list.json`, `kalshi/event_controls_2026.json`, `polymarket/gamma_events_keyset.json`.

**Scripts (scratchpad `<scratch>/taxonomy-literature/`):** `lp.py`, `example.py`, `snapshot.py`, `poly_ladders.py`, `live_case.py`, `btc_family.py`, `pdftext.py`, `arxiv_lookup.py`, `crossref.py`; result files `snapshot_raw.json`, `live_case.json`, `btc_family.json`, `poly_closed_top1000.json`. Not copied into the repo (no fixtures path was authorised).

**Suspicious / embedded-instruction content:** none found in the pages and API responses read. Third-party text was only quoted or summarised.

---

## Appendix A. Exact LP solver (`lp.py`, standard library only)

Tested as described in section 4.7. Save as `lp.py` and run with `python3 -I`. `-I` ignores the script directory, so the example below inserts it on `sys.path`.

```python
from fractions import Fraction as F

def simplex_max(c, A, b):
    """maximize c.x s.t. A x <= b, x >= 0, with b >= 0. Returns (value, x, duals) exactly."""
    m, n = len(A), len(c)
    # tableau rows: [A | I | b]; last row: [-c | 0 | 0]
    T = [list(map(F, A[i])) + [F(1) if k == i else F(0) for k in range(m)] + [F(b[i])] for i in range(m)]
    z = [-F(v) for v in c] + [F(0)] * m + [F(0)]
    basis = [n + i for i in range(m)]
    while True:
        # Bland: smallest index with negative reduced cost
        enter = next((j for j in range(n + m) if z[j] < 0), None)
        if enter is None:
            break
        # ratio test (Bland tie-break by smallest basis index)
        best = None
        for i in range(m):
            if T[i][enter] > 0:
                r = T[i][-1] / T[i][enter]
                if best is None or r < best[0] or (r == best[0] and basis[i] < basis[best[1]]):
                    best = (r, i)
        if best is None:
            raise ValueError('unbounded')
        _, row = best
        piv = T[row][enter]
        T[row] = [v / piv for v in T[row]]
        for i in range(m):
            if i != row and T[i][enter] != 0:
                f = T[i][enter]
                T[i] = [a - f * bb for a, bb in zip(T[i], T[row])]
        f = z[enter]
        z = [a - f * bb for a, bb in zip(z, T[row])]
        basis[row] = enter
    x = [F(0)] * n
    for i, bi in enumerate(basis):
        if bi < n:
            x[bi] = T[i][-1]
    duals = z[n:n + m]          # reduced costs of slacks = dual values of the constraints
    return z[-1], x, duals

def solve_arb(payoff, books, fee_buy=None, fee_sell=None, lock=None):
    """payoff[w][j]: payout per share of contract j in state w (Fractions or numbers).
    books[j] = {'asks': [(price, size), ...], 'bids': [(price, size), ...]}
    fee_buy(j, p) / fee_sell(j, p): per-share fee at price p.  lock(j, p, side): per-share capital-lock cost.
    Returns dict(value, trades, state_prices)."""
    W, J = len(payoff), len(books)
    fee_buy = fee_buy or (lambda j, p: F(0))
    fee_sell = fee_sell or (lambda j, p: F(0))
    lock = lock or (lambda j, p, side: F(0))
    cols = []   # (j, side, price, size, effective cost/proceeds)
    for j, bk in enumerate(books):
        for p, q in bk.get('asks', []):
            p = F(p); cols.append((j, 'buy', p, F(q), p + fee_buy(j, p) + lock(j, p, 'buy')))
        for p, q in bk.get('bids', []):
            p = F(p); cols.append((j, 'sell', p, F(q), p - fee_sell(j, p) - lock(j, p, 'sell')))
    n = len(cols) + 1                      # last variable is t
    # constraint per state: t - sum_j A[w][j]*(x-y) + sum cb*x - sum cs*y <= 0
    A, b = [], []
    for w in range(W):
        row = []
        for (j, side, p, q, c) in cols:
            a = F(payoff[w][j])
            row.append((-a + c) if side == 'buy' else (a - c))
        row.append(F(1))
        A.append(row); b.append(F(0))
    for k, (j, side, p, q, c) in enumerate(cols):   # bound rows x_k <= q
        row = [F(0)] * n; row[k] = F(1); A.append(row); b.append(q)
    obj = [F(0)] * (n - 1) + [F(1)]
    val, x, duals = simplex_max(obj, A, b)
    trades = [(cols[k][0], cols[k][1], cols[k][2], x[k]) for k in range(len(cols)) if x[k] != 0]
    return {'value': val, 'trades': trades, 'state_prices': duals[:W]}

def fmt(x, nd=4):
    return f'{float(x):.{nd}f}'
```

## Appendix B. Worked example driver (`example.py`)

```python
#!/usr/bin/env python3
"""Worked example for the LP in docs/research/15: three-candidate race across two venues.
Synthetic books (NOT live quotes). Run: python3 -I example.py
"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from fractions import Fraction as F
from lp import solve_arb, fmt

names = ['X@P', 'Y@P', 'Rep@P', 'Dem@K', 'Z@K']
# states: winner = X, Y, Z   (Rep pays when Z wins; Dem pays when X or Y wins)
payoff = [
    #  X@P Y@P Rep@P Dem@K Z@K
    [1, 0, 0, 1, 0],   # X wins
    [0, 1, 0, 1, 0],   # Y wins
    [0, 0, 1, 0, 1],   # Z wins
]
d = F
books = [
    {'asks': [(d('0.46'), 30), (d('0.48'), 100)], 'bids': [(d('0.44'), 50)]},     # X@P
    {'asks': [(d('0.21'), 40), (d('0.23'), 100)], 'bids': [(d('0.19'), 50)]},     # Y@P
    {'asks': [(d('0.31'), 50), (d('0.33'), 200)], 'bids': [(d('0.29'), 100)]},    # Rep@P
    {'asks': [(d('0.66'), 60), (d('0.68'), 100)], 'bids': [(d('0.64'), 100)]},    # Dem@K
    {'asks': [(d('0.30'), 25), (d('0.32'), 100)], 'bids': [(d('0.28'), 100)]},    # Z@K
]
venue = ['P', 'P', 'P', 'K', 'K']
FEE = {'P': d('0.04'), 'K': d('0.07')}          # taker coefficient: fee/share = coef * p * (1-p)
fee = lambda j, p: FEE[venue[j]] * p * (1 - p)
LOCK_APY, DAYS = d('0.08'), 30
lock_rate = LOCK_APY * DAYS / 365
lock_buy = lambda j, p, side: lock_rate * p
lock_sell = lambda j, p, side: lock_rate * (1 - p)   # collateral posted when selling
lock = lambda j, p, side: lock_buy(j, p, side) if side == 'buy' else lock_sell(j, p, side)

def show(title, r):
    print('\n' + title)
    print('  guaranteed profit (min over states): $' + fmt(r['value'], 4))
    for j, side, p, q in r['trades']:
        print(f"    {side:4s} {names[j]:6s} @ {fmt(p, 2)}  x {fmt(q, 2)} shares")
    print('  state prices (dual):', ', '.join(f'{s}={fmt(v, 4)}' for s, v in zip(['X', 'Y', 'Z'], r['state_prices'])))

# 0. naive top-of-book arithmetic (cheapest complete cover of the three states)
cover1 = d('0.66') + d('0.30')                 # Dem@K + Z@K
cover2 = d('0.46') + d('0.21') + d('0.30')     # X@P + Y@P + Z@K
cover3 = d('0.46') + d('0.21') + d('0.31')     # X@P + Y@P + Rep@P
print('top-of-book covers: Dem@K+Z@K =', cover1, ' X@P+Y@P+Z@K =', cover2, ' X@P+Y@P+Rep@P =', cover3)

r_gross = solve_arb(payoff, books)
show('(A) depth-aware, no fees', r_gross)
r_fee = solve_arb(payoff, books, fee_buy=fee, fee_sell=fee)
show('(B) depth-aware, taker fees (P 0.04, K 0.07 x p(1-p))', r_fee)
r_lock = solve_arb(payoff, books, fee_buy=fee, fee_sell=fee, lock=lock)
show('(C) fees + capital-lock hurdle (8% APY, 30 days) ', r_lock)

# (D) add resolution-risk states: venue K voids and refunds at last price (Dem 0.65, Z 0.30) while P resolves normally
void_rows = []
for k, winner in enumerate(['X', 'Y', 'Z']):
    row = list(payoff[k])
    row[3] = d('0.65'); row[4] = d('0.30')
    void_rows.append(row)
r_void = solve_arb(payoff + void_rows, books, fee_buy=fee, fee_sell=fee, lock=lock)
print('\n(D) fees + lock + K-voids-at-last-price states added (6 states)')
print('  guaranteed profit: $' + fmt(r_void['value'], 4))
for j, side, p, q in r_void['trades']:
    print(f"    {side:4s} {names[j]:6s} @ {fmt(p, 2)}  x {fmt(q, 2)} shares")
# quote the worst-case state of plan (C) when evaluated in the void states
tr = r_lock['trades']
def state_pnl(rowpay):
    pnl = F(0)
    for j, side, p, q in tr:
        sign = 1 if side == 'buy' else -1
        pnl += sign * q * (F(rowpay[j]) - p - (fee(j, p) if side == 'buy' else -fee(j, p)) )
    return pnl
print('\n  plan (C) re-evaluated in void-on-K states (no lock cost):')
for k, winner in enumerate(['X', 'Y', 'Z']):
    print(f'    winner={winner}, K voids: P&L = $' + fmt(state_pnl(void_rows[k]), 4))
print('  plan (C) in normal states:')
for k, winner in enumerate(['X', 'Y', 'Z']):
    print(f'    winner={winner}: P&L = $' + fmt(state_pnl(payoff[k]), 4))
```

---

## Verification (2026-10-19)

Adversarial re-check of this file by an independent verifier (machine clock 2026-10-18 about 18:40 to 19:20 UTC; public unauthenticated GETs only, throttled; no third-party code run). Working files: `<scratch>/verify-taxonomy-literature/` (`dualcheck.py`, `livecheck.py`, `kladder.py`, `umastats.py`, `lpfuzz.py`, `appx/`). Tags as above. Nothing above this section was edited.

### V0. What was re-derived and held up (primary source or re-run)

- **Worked example (section 4.7), all four cases and the second implication example.** The Appendix A/B code, extracted verbatim from this file and run in a clean directory, prints exactly $2.5000 / $0.4406 / $0.0820 / $0.0000 and the -$1.0102 void-row loss. Hand check of (A): 30+30+50+60+25+15 shares cost 87.50, payoff 90 in every state. Independent weak-duality bound (my own code, any probability vector gives an upper bound on the LP value): (A) bound 2.5000 equals the primal; (B) bound 0.4412 at pi = (0.4648, 0.2166, 0.3186) vs primal 0.4406; (C) bound 0.0832 vs 0.0820 (bounds are grid-limited to 4 decimals, so the primal is optimal to within 0.002). Fee hand check 0.9425 + 0.2995 + 0.3675 = 1.6094. 25 random 3-state instances: `enumerated integer optimum <= LP <= dual bound` held in all (19 had positive LP value), so no solver bug found. The no-arbitrage dual certificate (section 4.2) was re-checked on the coherent Frechet quotes: state prices sum to 1 and b <= E[A] <= a on all three quotes.
- **Kroer et al. (arXiv 1606.02825).** Text extracted from the PDF by my own script: "Arbitrage-free prices are exactly the convex combinations of valid payoff vectors." is verbatim; Proposition 2.4 reads "the guaranteed profit of any trader is at most D(mu* || theta) where mu* is the Bregman projection ... this profit is achieved by any trade"; abstract gives #P-hard in the worst case, NCAA 2010, outcome space 2^63; "88k trades on 5k securities" is in the introduction.
- **Saguillo et al. (arXiv 2508.03474, AFT 2025).** HTML parsed: $39,587,585.02 with `epsilon = $1`; top account $2,009,631.76 over 4,049 transactions; 17,218 conditions (8,659 single, 1,578 negRisk markets with 8,559 conditions); 7,051 conditions with an opportunity (2,628 + 4,423); 46,360 pairs, 1,576 dependent, 374 checked, 11 + 2 = 13 confirmed; "All arbitrage opportunities observed are long"; Appendix H.1 caption "overall shorting has more profit". Strategy sums re-added: negRisk 11,092,286.31 + 612,188.83 + 4,264.33 + 17,307,113.81 = 29,015,853; single 5,899,287 + 4,682,075 = 10,581,362; rebalancing total 39,597,215 (9.6K above the stated total); combinatorial 60,236.71 + 18,472.31 + 15,818.53 + 629.16 = 95,157. VWAP method: one-block average, last price carried forward up to 5K blocks (2.5 h), otherwise price 0. Text search: zero hits for Bregman, Frank, Kroer, Abernethy, LMSR; Hanson appears only as ref [13], the Policy Analysis Market. Dagstuhl landing page: LIPIcs vol. 354, 27:1-27:24, 2025-10-06.
- **Gebele-Mutzel-Matthes (2608.00666).** 2,098 YES-side vs 36 NO-side episodes; median 16.15 s (253 YES) and 7.99 s (5 NO); $1.12M = $1.086M + $32K; 32,702 events and 259M trades; 75 conversions / 381,748 USDC excluded cluster; FPMM panel 51 sets / 235 markets; L2 window 2026-04-14 to 2026-05-19; the adapter supports only NO-to-YES before settlement.
- **Cheng-Yang-Zou (2605.00864).** 173 games, 2026-02-04 to 2026-03-04, 75,088,497 snapshots; 7 episodes across 3,042 markets, median 3.614 s, capped $210.19 / uncapped $4,418.44; 290 combinatorial episodes, capped $559.59 / uncapped $2,032.75, median yield 101.01 bps; 76.9% of episodes could not deploy the $100 budget; median combinatorial duration 16 s, 17.2% lasting 4 s or less; Polymarket zero-fee category for NBA.
- **Gebele-Matthes (2601.01706).** 102,275 events, about 6% cross-listed, 1,501 / 1,645 / 1,123 structure counts, 99.9% recall at k = 20, 1,218.66% over 800 days and 15 trades, 30-minute persistence filter, "approximately $0.03 ... up to $0.07", strict-subset election construction, NYC Central Park vs LaGuardia, 8% vs 2% listing share.
- **Other literature.** Zhai-Shi (Crossref abstract: 1.9M relations, more than 255,000 contracts, 2.2% / 3.2%), Ng et al., Nechepurenko SSRN 7589581, Lee-Lee-Lee, Becker (72.1M trades, takers -1.12%, makers +1.12%, gross of fees), Portnaya (5.6 / 6.3 / 11 points, AR(1) half-life about four hours, September 2023 contract), Dai-Jia-Yu (821 of about 243,000, $8.2M, launch 2026-02-12, 85% same-side), Nechepurenko 2610.00183 (410 fifty-fifty of 108,638 linked / 99,283 resolved; mean 322.50 s, max 7,133 s; MVE 9.676 s), Nechepurenko 2604.24147 quoting Clinton and Huang (62 of 65 days). All arXiv IDs and all Crossref DOIs in section 12 resolve to the stated titles and authors.
- **Venue incidents.** Polymarket Gamma `closed=true` re-fetch: Khamenei Feb 28 / Mar 31 YES with `proposed, disputed, proposed, disputed`, closed 2026-03-04 01:05 / 00:58 UTC, $131.1M / $63.2M; Jan 31 NO; "Government shutdown on Saturday?" (Feb 14) text "new federal government shutdown" and resolved NO; Jan 31 shutdown YES closed 2026-02-04 00:35 UTC, $157.3M. Kalshi `/historical/markets`: `KXKHAMENEIOUT-AKHA-26MAR01` scalar 0.0200 (last 0.09), `26APR01` 0.29, `26JUL01` 0.45, `26SEP01` 0.51, `26FEB01` no; `rules_secondary` death clause quoted correctly; `KXGOVTSHUTDOWN-26FEB14` YES (settled 2026-02-14 15:33 UTC); `KXGOVSHUT-26JAN31` YES settled 2026-01-31 17:00:58 UTC (3.3 days before Polymarket); `KXMADUROOUT` Feb to Jun 2026 all YES on 2026-01-04. Risch v. KalshiEX, No. 2:26-cv-02390 (C.D. Cal.), filed 2026-03-05 confirmed via search summaries of the Bloomberg Law report (M).
- **UMA dispute statistics.** I re-pulled the same query (10 pages, `closed=true&end_date_min=2026-01-01&order=volumeNum`): the 1,000 market ids are identical to the researcher's file, and my own code gives 76 disputed (7.6%), 16.19% of $20.078B, 64 with two or more, undisputed median 3.64 h (p90 34.8, n = 649), disputed median 100.06 h (p90 439.1, n = 54), rank buckets 20 / 100, 18 / 200 (9.0%), 38 / 700 (5.4%). My own crude geopolitics regex gives 42 of 159 (26%) vs the notes' 40 of 148 (27.0%).
- **Live snapshot.** Recomputed from `snapshot_raw.json`: 492 complete negRisk sets, 8 with sum(ask) < 1, 4 net-positive on Gamma top of book, 2 of 170 short gross, medians 1.0665 / 0.97. `poly_ladders.py` re-run offline: 3232 + 378 + 41 = 3,651 pairs and 3 violations; 271 cross-event pairs and 2 violations. My own fresh Kalshi pull (1,600 events) reproduces 873 ladders, 7,274 pairs, 0 crossed, 1 locked. My independent greedy complete-set calculation on current CLOB books reproduces Bitcoin/Gold/S&P exactly ($22.83 gross, $2.5753 after fees, $0 after an 8% APY lock) and OpenAI IPO closely ($43.51 / $9.81 / $0 vs the notes' $44.60 / $10.89 / $0; books moved slightly). Default rules read from the three events' `description`: BTC/Gold/S&P (alphabetical tie-break), General Mills (missing metric or no release by 2027-01-31 resolves to the lowest bracket), OpenAI ("No IPO by December 31, 2027") are exhaustive as stated.
- **Mirrored books.** Tested on 7 more markets (top 3 levels both sides, YES vs NO token): all match, so the n = 1 caveat can be lifted to n = 8 markets for Polymarket.
- **Fees and venue docs.** docs.polymarket.com fee table and formula `C x feeRate x p x (1-p)`, maker never charged, geopolitics 0; negative-risk page (NO converts to YES in every other market; "Only trade on named outcomes"); Combos 400 ms / 10 s / 1 s last look; Kalshi RFQ docs (accept then confirm; HVM windows), tiers earned by volume, "Premier or Market Maker" API usage levels, Get Incentives endpoint.
- **Regulatory.** DMO Staff Advisory 26-08 PDF (cftc.gov/csl/26-08/download, 6 pages, fetched and extracted by me): footnote 26 "A statement that a contract will settle based upon a consensus of yet-to-be-determined sources may not be sufficient to satisfy the requirements of DCM Core Principle 3." Polymarket US Rulebook "September 30, 2026", 84 pages: Rule 5.2(i) "Participants utilizing automated trading systems must implement pre-trade risk controls including order throttles, price collars, and kill switches." Venable (2026-03-23 announcements; rulebook footnote 2026-03-20; no mention of automation or arbitrage) and integrity.polymarket.com (nine named practices; links "Polymarket US Rulebook (2026.04.21)"; cites CFTC release 9217-26 of 2026-04-23; silent on automation) re-read.

### V1. Corrected items (partly right; replacement text given)

1. **"Edges last seconds" (Findings 4, verdict, key numbers).** In Gebele-Mutzel-Matthes the 16.15 s and 7.99 s medians are over only the 258 CLOB episodes whose duration could be measured. Of the 624 observed CLOB episodes, 366 (58.7%) span a whole 50-minute observation window and are excluded from the duration curves; in the FPMM panel about 40 episodes stayed open beyond 50 minutes and some longer than a day (paper, Section 5.2; the hour-stratified sampling design is why the paper calls CLOB persistence hard to assess). Replacement: "short episodes last seconds, but a majority of observed negRisk CLOB episodes outlasted the observation window; long-dated sets are open for tens of minutes or longer." My re-check agrees: the OpenAI set was still at sum(ask) 0.944 at about 18:55 UTC, 44 minutes after the snapshot.
2. **"4 of 8 gaps positive after fees; 6 of 8 persisted 28 minutes" (section 6.3, key numbers).** Those counts use Gamma `bestAsk`. The Resident Evil set read 0.993 on Gamma at 18:11 but 1.007 on CLOB books at 18:13-18:17 (`live_case.json`), so it was never executable and its "closure" in the 12-minute re-check is Gamma lag, not an arbitrageur. On CLOB books, two sets are clearly net-positive (OpenAI, Bitcoin/Gold/S&P), General Mills is +$0.0013 on $13 (zero for practical purposes) and Resident Evil is zero. Replacement: "8 Gamma-flagged gaps; on CLOB re-reads 3 stayed below 1 (2 clearly net-positive after fees, 1 at about zero)".
3. **"All eight relation types reduce to one test" (verdict, Finding 1).** Only types (a) to (f) are payoff constraints that delete states. Types (g) and (h) carry no hard constraint (the body says so: LP value zero, relative value only). Replacement: "types (a)-(f) reduce to the hull test; (g) and (h) are signals and have zero guaranteed profit by construction."
4. **Kroer Proposition 2.4 scope (summary fact 1).** The proposition is stated for the paper's general cost-function market maker (any bounded-loss cost C with conjugate R), with the Bregman divergence of that cost function; LMSR is one instance. "Against an LMSR maker" is narrower than the source.
5. **Becker 1-cent figure (section 3.8 failure modes).** "Contracts at 1 cent win 0.43% against an implied 1%" is the taker-side result; the blog states makers on the same contracts win 1.57%. Replacement: "taker purchases of 1-cent contracts win 0.43% (maker side 1.57%)."
6. **Cheng et al. size statistic (section 6.1 row 6).** The paper gives an average executable size of about 14.79 synthetic shares (abstract: "average executable size of just 14.8 shares"), not a median.
7. **Deribit comparison wording (section 6.5, key numbers "tail strikes richest").** From the notes' own table the largest absolute gaps are at 84k (+2.4 points) and 78k (+1.7); at 86k to 90k they are only +0.4 to +0.54 points. The tail premium is large only in relative terms (0.0055 vs 0.0001). Mean +0.75 and the -0.65 to +2.4 range check out.
8. **Digital-option formula in the section 3.0 table, row (h).** `p_PM approx e^{rT} x (-dC/dK)` contradicts section 3.8 ("fair price is e^{-rT} Q(S_T > K) = -dC/dK"). A YES price is the present price of a $1 payoff, so `p approx -dC/dK`; the `e^{rT}` version is the undiscounted risk-neutral probability. Immaterial for hours-to-days horizons (under 0.1 point at 5%), wrong for long-dated contracts.
9. **Lock-up charge (sections 4.5, 6.4).** The 8% APY x scheduled end date is a worst-case, state-independent charge, and the 8% hurdle is an assumption, not a sourced figure. For OpenAI the event resolves on the first-day IPO close, possibly well before the 2028-01-01 scheduled end; the full 439 days applies only in the "No IPO" state. "$0 after lock" is therefore a conservative bound, not an expected value. A measured settlement wedge exists (see V3 item 1) and should replace the arbitrary hurdle.
10. **Kalshi fee coefficient (section 11, "stays M").** docs.kalshi.com fee_rounding worked example: signed revenue -$0.055000 and model fee $0.00363825; 0.07 x 0.055 x 0.945 = 0.00363825 exactly. That is strong support for the 0.07 x p(1-p) form for a one-contract taker fill (inferred from a worked example, not a stated formula; upgrade M to H-minus for the per-contract taker case).
11. **Regulatory completeness (section 9, Finding 7).** The section lists the February advisory, the March ANPRM and DMO 26-08 but omits the **CFTC proposed rule of 2026-06-10** (267 pages; Federal Register document 2026-11854 dated 2026-06-12 per CRS LSB11441; The Block, 2026-06-10). Secondary summaries say it concerns Rule 40.11 contrary-to-public-interest determinations (sports, terrorism, war, assassination), lists manipulation risk, settlement ambiguity and insider leakage as factors against listing, and does not address market makers, automated trading, arbitrage or wash trading. So "no 2026 regulator text addresses arbitrage or automated market making" survives at M, but "regulatory context verified" was incomplete. Also: the ANPRM was issued 2026-03-12 and published 2026-03-16 (91 FR 12516), RIN 3038-AF65, comments due 2026-04-30 (Dechert, DWT, Willkie summaries).
12. **NOT FOUND "Venezuela invasion" item (sections 8, 11).** Partly findable: Polymarket "Will the U.S. invade Venezuela by January 31, 2026?" closed 2026-02-01 07:41 UTC with `outcomePrices ["0","1"]` (NO) and `umaResolutionStatuses ["proposed"]` (no dispute); the Dec 31, 2025 market closed 2026-01-01 NO. Quartz, DeFiRate and Gambling Insider headlines (not read in full, L/M) describe the January withholding and a "No" settlement on about $10.5M to $11M. A second venue's resolution is still NOT FOUND.
13. **Dispute base rate for the lock-up model (section 7, design implication 5).** The 7.6% (and 27% / 1.2% split) is a top-by-volume rate, as flagged. A whole-population figure exists: Nechepurenko arXiv 2609.15368 counts 1,604 disputes against 159,447 proposals and 184,148 request creations over Polymarket's full adapter history (about 1.0% of proposals; dispute events, not distinct markets). Use both: roughly 1% overall, 7.6% for the top 1,000 by volume, 20% for the top 100.

### V2. Unverifiable by me

1. **cftc.gov primary pages** (9185-26, 9194-26) returned HTTP 429 and a Cloudflare challenge to me; not worked around. Release 9185-26 date (2026-02-25), the practices listed and the absence of any automation, bot, market maker or arbitrage mention were confirmed only through the A&O Shearman summary and a search snippet (M); the researcher's first-hand read is not contradicted. The release number 9194-26 is not confirmed; the date, FR citation and comment window are (item V1.11).
2. **Burgi-Deng-Whelan numbers** (takers -31.46%, makers -9.64%; fee `0.07 P(1-P)`): the CESifo abstract has no figures and I could not extract the PDF text. Stays M. The sign convention in the notes is ambiguous and should be checked against the paper before use, because Becker finds makers positive.
3. **The thematic dispute classifier** (geopolitics 27.0% n = 148, sports-style 1.2% n = 407, other 7.0% n = 445) is not among the saved scripts, so it cannot be re-run. My approximate regex corroborates the geopolitics rate (26%) and the sports rate (4 of 632 for a looser sports pattern), not the exact counts.
4. **Zhai-Shi full text, Dudik et al. abstracts, Wikipedia-sourced items** (Kalshi index perpetual 2026-10-06, WSJ "changing terms", Business Insider $2.2M reimbursed) were not re-read; they stay M or L as tagged. The OddsShopper figures ($13.1M on the Nov 12 rung, about $30M ladder, 97c peak, Kalshi 11:00 AM ET) and Convex Lake (32.4% NYC vs 61.8% Miami over 102 city-days, 97c to about 1c) match their pages (M).
5. **XO statements** in section 10 (negRisk always false, MODRA, about 9 active markets) rest on docs 08 and 10 and were outside this check.

### V3. Missed relevant material (additions, not errors in what is written)

1. **Gebele and Matthes, arXiv 2605.31431 (2026-05-29), "When Certainty Is Not Worth It: Capital Lock-Up and Settlement Discounting in Prediction Markets"**: recovers an annualized settlement wedge (ASW) term structure from near-certain Polymarket contracts and finds that negRisk conversion compresses it. Directly relevant to the lock-up term in section 4.5 and a data-based replacement for the 8% hurdle.
2. **Execution atomicity on Polymarket.** Shen et al. arXiv 2606.16852 (2026-06-15) count 2,037,304 reverted `matchOrders()` transactions ("ghost fills", up to 24.3% of transactions in peak hours); Chen, Long, Su arXiv 2609.17902 (2026-09-15) measure 1.8M reverts over 2025-08-12 to 2026-05-22. Section 4.5's legging-risk row should add a leg-revert state for off-chain-matched, on-chain-reverted fills, and "arbitrage-bot hunting" is one of the documented attack uses.
3. **Resolution mechanics.** Nechepurenko arXiv 2609.15368 and 2609.15373 ("Resolution Is Not Settlement", Parts I and II) give population-level oracle states (requests, proposals, disputes, resets) and the 410 fifty-fifty vectors the notes already cite.
4. **Intra-venue YES+NO persistence.** Tsang and Yang arXiv 2603.03136 (2026-03-03, 2024 election data, STALE?): half-life of deviations from the YES+NO identity falls from several hours (early 2024) to well under a minute (October to November 2024) on a five-minute AR(1). Consistent with section 3.2 (b1).
5. **Parlay pricing.** Moshrefi arXiv 2607.14430 (2026-07-15): Kalshi cross-game parlays are systematically overpriced relative to the product of leg prices, increasingly with leg count; relevant to type (e) and to the "quotes sit inside the bounds" remark.
6. Sportsbook comparison: the academic NOT FOUND stands (my arXiv searches for Kalshi/Polymarket with sportsbook, bookmaker, Pinnacle, DraftKings returned nothing relevant). Only vendor claims exist, e.g. OddsPapi: de-vigged Pinnacle vs Polymarket median 0.59 points and Kalshi 0.75 points (unverified methodology, L).

### V4. Code review

No material bug found in `lp.py`, `example.py`, `snapshot.py`, `poly_ladders.py`, `live_case.py` or `btc_family.py`. Checked: row signs for buy and sell columns in `solve_arb`; sell-side lock charged on `1 - p`; `state_pnl` in `example.py`; ladder directions (down barrier reversed, `less` ladders compare bid of the lower cap against ask of the higher); BTC atom payoffs (`above` strict, `gt` includes the boundary, buckets half-open). Minor, no fix made: `snapshot.py` uses `vals[n // 2]` (upper median) so the 492-event median ask prints 1.067 where the arithmetic median is 1.0665; the file under `docs/research` still states 1.067, which is rounding-equivalent. Process gap: the UMA-statistics script and the thematic classifier were not saved, so section 7 is reproducible only for the headline counts (which I reproduced independently).

Verifier verdict: citations, quotes and first-hand numbers are reliable (every numeric claim I re-derived matched or matched within rounding; the corrections above concern scope, framing, one Gamma-vs-CLOB mismatch and omitted sources). The items that need rewording before decisions rely on them are V1.1 to V1.3, V1.9, V1.11 and V1.13.
