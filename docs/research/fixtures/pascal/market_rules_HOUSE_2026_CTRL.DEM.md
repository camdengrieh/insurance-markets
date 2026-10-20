# House control after 2026 midterms — Democratic Party

This market settles to `1` if the Democratic Party controls the House following the 2026 U.S. House elections scheduled for Nov 3, 2026. Otherwise, this market settles to `0`.

House control means having more than half of the voting members of the U.S. House of Representatives.

If the outcome is ambiguous under these rules, this market remains open until the Speaker of the House is selected after the 2026 U.S. general election. It then resolves according to the party with which the Speaker is affiliated at the time of election to that position.

Determination of which party controls the House will be based on a consensus of credible reporting, or if there is ambiguity, final federal and/or state election authority certification or other final official determination of the 2026 election results.

If any relevant election is postponed, this market will use the result of the postponed election, including any required runoff. If no final official determination of House control exists by 2027-07-31 23:59 UTC, this market settles to `0` unless the Speaker fallback above has already resolved this market to `1`.

This Pascal event omits an explicit `Other` market, so it is not MECE. If the elected Speaker does not caucus with either the Democratic Party or Republican Party, or if another omitted party controls the House, both markets in this Pascal event settle to `0`.

Compare to market slug: `will-the-democratic-party-control-the-house-after-the-2026-midterm-elections` on Polymarket. In order to support liquidity formation this market's resolution criteria have been designed to follow the indicated market. Pascal reserves the right to resolve the market differently in exceptional circumstances, especially in cases where Pascal's technical architecture differs. For example, rewinding trades is impossible on Pascal and will never happen.
