import type { PanelContext } from "./context";
import { DeployPanel, FundPanel, OrderPanel, RedeemPanel, RevokePanel, type PanelHeading } from "./ActionPanels";
import { OrdersPanel } from "./OrdersPanel";

// The order the screen takes things in: get the account ready, fund it, trade, look at orders, then the ways out
// (redeem, revoke). Withdrawal has no panel: its prepare route is not offered to a page, and the decoded template
// for it exists only so a withdrawal item that somehow reaches this screen is checked, never to start one.
export function ActionPanelsInOrder({ ctx, heading }: { readonly ctx: PanelContext; readonly heading?: PanelHeading }) {
  return (
    <>
      <DeployPanel ctx={ctx} heading={heading} />
      <FundPanel ctx={ctx} heading={heading} />
      <OrderPanel ctx={ctx} heading={heading} />
      <OrdersPanel ctx={ctx} heading={heading} />
      <RedeemPanel ctx={ctx} heading={heading} />
      <RevokePanel ctx={ctx} heading={heading} />
    </>
  );
}
