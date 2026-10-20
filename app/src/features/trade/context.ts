import type { CapabilityFacts } from "../../core/capabilities";
import type { GateInput } from "./facts";
import type { TradeServices } from "./services";
import type { AccountAnswer } from "./tools";

// What every action panel is given: who is asked about, what the account read said, the merged facts, and the inputs
// to the gate. The panels compute their own gate from it, so a panel can never be shown as open by another's state.
export interface PanelContext {
  readonly services: TradeServices;
  readonly owner: string | null;
  readonly account: AccountAnswer | null;
  readonly facts: CapabilityFacts;
  readonly gateInput: GateInput;
  readonly refreshAccount: () => void;
}
