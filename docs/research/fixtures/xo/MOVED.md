# Moved

These captures were byte-identical copies of the recordings the venue reader is tested against. To keep
one fixture set per venue they now live only in the SDK (docs/sdk-and-api-design.md step 3). Same bytes, new place:

- `data-error-400-take-over-max.json` -> `sdk/venues/xo/fixtures/data-error-400-take-over-max.json`
- `data-error-404-market.json` -> `sdk/venues/xo/fixtures/data-error-404-market.json`
- `data-error-404-user-portfolio.json` -> `sdk/venues/xo/fixtures/data-error-404-user-portfolio.json`
- `data-liquidity-rewards-earning-pools.json` -> `sdk/venues/xo/fixtures/data-liquidity-rewards-earning-pools.json`
- `data-liquidity-rewards-market-config.json` -> `sdk/venues/xo/fixtures/data-liquidity-rewards-market-config.json`
- `data-market-by-contract-pulse.json` -> `sdk/venues/xo/fixtures/data-market-by-contract-pulse.json`
- `data-market-by-slug.json` -> `sdk/venues/xo/fixtures/data-market-by-slug.json`
- `data-markets-closed-resolved.json` -> `sdk/venues/xo/fixtures/data-markets-closed-resolved.json`
- `data-markets-list.json` -> `sdk/venues/xo/fixtures/data-markets-list.json`
- `data-markets-search.json` -> `sdk/venues/xo/fixtures/data-markets-search.json`
- `data-pulse-markets.json` -> `sdk/venues/xo/fixtures/data-pulse-markets.json`
- `orderbook-balance-allowance-dummy-address.json` -> `sdk/venues/xo/fixtures/orderbook-balance-allowance-dummy-address.json`
- `orderbook-book.json` -> `sdk/venues/xo/fixtures/orderbook-book.json`
- `orderbook-claimable-dummy-address.json` -> `sdk/venues/xo/fixtures/orderbook-claimable-dummy-address.json`
- `orderbook-error-400-bad-token.json` -> `sdk/venues/xo/fixtures/orderbook-error-400-bad-token.json`
- `orderbook-error-401-orders.json` -> `sdk/venues/xo/fixtures/orderbook-error-401-orders.json`
- `orderbook-error-404-book-unknown-token.json` -> `sdk/venues/xo/fixtures/orderbook-error-404-book-unknown-token.json`
- `orderbook-error-404-market-unknown.json` -> `sdk/venues/xo/fixtures/orderbook-error-404-market-unknown.json`
- `orderbook-fee-rate.json` -> `sdk/venues/xo/fixtures/live-orderbook-fee-rate-zero-type4.json`
- `orderbook-health.json` -> `sdk/venues/xo/fixtures/orderbook-health.json`
- `orderbook-last-trade-price.json` -> `sdk/venues/xo/fixtures/orderbook-last-trade-price.json`
- `orderbook-last-trades-prices.json` -> `sdk/venues/xo/fixtures/orderbook-last-trades-prices.json`
- `orderbook-live-activity.json` -> `sdk/venues/xo/fixtures/orderbook-live-activity.json`
- `orderbook-market-by-condition.json` -> `sdk/venues/xo/fixtures/orderbook-market-by-condition.json`
- `orderbook-markets.json` -> `sdk/venues/xo/fixtures/orderbook-markets.json`
- `orderbook-midpoint.json` -> `sdk/venues/xo/fixtures/orderbook-midpoint.json`
- `orderbook-neg-risk.json` -> `sdk/venues/xo/fixtures/orderbook-neg-risk.json`
- `orderbook-positions-dummy-address.json` -> `sdk/venues/xo/fixtures/orderbook-positions-dummy-address.json`
- `orderbook-price-buy.json` -> `sdk/venues/xo/fixtures/orderbook-price-buy.json`
- `orderbook-price-sell.json` -> `sdk/venues/xo/fixtures/orderbook-price-sell.json`
- `orderbook-prices-history.json` -> `sdk/venues/xo/fixtures/orderbook-prices-history.json`
- `orderbook-spread.json` -> `sdk/venues/xo/fixtures/orderbook-spread.json`
- `orderbook-tick-size.json` -> `sdk/venues/xo/fixtures/orderbook-tick-size.json`
- `orderbook-time.json` -> `sdk/venues/xo/fixtures/orderbook-time.json`
- `orderbook-trading-state.json` -> `sdk/venues/xo/fixtures/orderbook-trading-state.json`
- `orderbook-version.json` -> `sdk/venues/xo/fixtures/orderbook-version.json`

The other files in this folder are research captures that no reader is tested against; they stay here.
