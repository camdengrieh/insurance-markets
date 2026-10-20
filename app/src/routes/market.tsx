import { MarketDetail } from "../features/explorer";
import type { RouteMeta, RouteProps } from "../ui";

// The title is fixed app text (it becomes the h1 and the document title); the market's own title is shown inside
// the page in the untrusted slot.
export const route: RouteMeta = {
  id: "market",
  path: "/market/:venue/:marketId",
  title: "Market",
};

export default function MarketScreen({ params }: RouteProps) {
  return <MarketDetail params={params} />;
}
