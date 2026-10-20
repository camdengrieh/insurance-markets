import type { RouteMeta } from "../ui";
import { PortfolioView } from "../features/portfolio/PortfolioView";
import "../features/portfolio/portfolio.css";

export const route: RouteMeta = {
  id: "portfolio",
  path: "/portfolio",
  title: "Portfolio",
  nav: { label: "Portfolio", order: 30 },
  availability: "any",
};

export default function PortfolioScreen() {
  return <PortfolioView />;
}
