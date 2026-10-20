import type { PanelContext } from "./context";
import { DeployPanel, FundPanel, OrderPanel, RedeemPanel, RevokePanel } from "./ActionPanels";
import { OrdersPanel } from "./OrdersPanel";

// The order the screen takes things in: get the account ready, fund it, trade, look at orders, then the ways out
// (redeem, revoke). Withdrawal has no panel: its prepare route is not offered to a page, and the decoded template
// for it exists only so a withdrawal item that somehow reaches this screen is checked, never to start one.
export function ActionPanelsInOrder({ ctx }: { readonly ctx: PanelContext }) {
  return (
    <>
      <DeployPanel ctx={ctx} />
      <FundPanel ctx={ctx} />
      <OrderPanel ctx={ctx} />
      <OrdersPanel ctx={ctx} />
      <RedeemPanel ctx={ctx} />
      <RevokePanel ctx={ctx} />
    </>
  );
}
