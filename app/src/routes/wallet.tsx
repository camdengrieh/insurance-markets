import type { RouteMeta } from "../ui";
import { WalletView } from "../features/wallet/WalletView";
import "../features/wallet/wallet.css";
import "../features/portfolio/portfolio.css";

export const route: RouteMeta = {
  id: "wallet",
  path: "/wallet",
  title: "Wallet",
  nav: { label: "Wallet", order: 40 },
  availability: "any",
};

export default function WalletScreen() {
  return <WalletView />;
}
