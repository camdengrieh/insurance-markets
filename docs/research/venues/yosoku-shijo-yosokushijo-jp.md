# Yosoku Shijo (yosokushijo.jp) - venue spec

Researched 2026-10-19. Verdict: **skip** (dead or abandoned, play-money points, no API).

## Summary
- Japanese "prediction market" portal run by Lightup Inc. (株式会社ライトアップ) per ja.wikipedia. Parimutuel style, points redeemable for goods. [M]
- Not a money market and no on-chain component. Nothing to aggregate or arbitrage.

## Liveness (2026-10-19)
- https://yosokushijo.jp resolves to 112.78.112.155 (Sakura Internet shared hosting). TLS cert is CN=*.sakura.ne.jp (expires 2026-11-15), so curl fails with "no alternative certificate subject name matches". [H, curl]
- With cert verification off, the root returns Sakura's generic "さくらのレンタルサーバ" default page body (no site content), and a later request returned HTTP 403 (nginx). http://yosokushijo.jp/ and /robots.txt also return 403. [H, curl]
- www.yosokushijo.jp resolves to 112.78.205.18 but connections time out (20-25s, repeated). [H, curl]
- Internet Archive CDX index: 200 captures of the site in 2010; 302s on yosokushijo.jp in late 2010 to 2011; latest captures seen are 2016 (update.research.php, 302). Nothing after 2016 found. [H, web.archive.org CDX query]
- Conclusion: domain still registered and hosted, but no working site. Last known activity roughly 2016 (stale, >6 months). Status: NOT live as a usable venue. [M, inferred]
- Wikipedia still lists it (revision of 2026-10-09), but the entry has no citation and no date; the article itself is flagged as lacking sources. [H, WebFetch]

## Market model
NOT FOUND for current operation. Per Wikipedia: mainly parimutuel (パリミュチュエル方式), currency exchangeable for goods, also a survey/research portal ("学術的なリサーチ手法で、未来を予測するポータルサイト"). [M]

## Chains / collateral
None. Virtual points. [M]

## Read API
None found. Homepage returns no content; no docs. NOT FOUND (searched: root page, robots.txt, ja.wikipedia, Wayback CDX). WebSearch budget was exhausted this session, so no further web search was done.

## Trade path
None. Not reachable from PayBox (no wallet, no chain).

## Fees / resolution / geo-ToS
NOT FOUND (no readable site). Points are not cash; any prize redemption in Japan would carry gambling-law considerations (unverified, not researched).

## Liquidity
None measurable. NOT FOUND.

## Event overlap / shared liquidity
Unknown; no markets visible. Independent (nothing shared) but irrelevant.

## Adapter priority
skip. Reason: site non-functional (TLS mismatch, 403s, default hosting page), play-money, no API.

## Fixtures
None saved (no API).

## Suspicious content
None found.

## Sources
- https://yosokushijo.jp (curl, 2026-10-19; Sakura default page / 403) [H]
- https://ja.wikipedia.org/w/index.php?title=予測市場&oldid=111325635 [M, uncited entry]
- http://web.archive.org/cdx/search/cdx?url=yosokushijo.jp&matchType=host (capture index only) [H]
