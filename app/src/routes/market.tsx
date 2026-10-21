import { MarketsView, parseMarketParams } from "../features/explorer";
import type { RouteMeta, RouteProps } from "../ui";

// A deep link to one market (a cold load, a bookmark, a pasted address): the Markets surface, unchanged, with the
// market modal open over its table. The surface renders its own h1 in its hero band (`hero: true`), exactly as at
// "/" and "/markets", so the page looks the same however the modal was opened; the route's title is fixed app text
// for the document title, and the market's own title is shown inside the modal in the untrusted slot.
export const route: RouteMeta = {
  id: "market",
  path: "/market/:venue/:marketId",
  title: "Market",
  hero: true,
};

export default function MarketScreen({ params }: RouteProps) {
  const parsed = parseMarketParams(params);
  return parsed === null ? <MarketsView invalidAddress /> : <MarketsView market={parsed} />;
}
