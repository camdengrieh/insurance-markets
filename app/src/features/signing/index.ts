// Public surface of the signing inbox and Signature Card, for the route file and for tests.
import "./signing.css";

export { SigningView, isOpenItem, type SigningFeed, type SigningViewProps, type OpenCardRequest } from "./SigningView";
export { SignatureCard, type SignatureCardProps } from "./SignatureCard";
export { SignatureCardDialog, CARD_DIALOG_TITLE, CARD_DIALOG_LEDE, type SignatureCardDialogProps } from "./SignatureCardDialog";
export { SigningServicesProvider, createSigningServices, useSigningServices, type SigningServices, type SigningServicesOptions } from "./services";
export { SigningClient, type DecisionBody, type ReconcileResult } from "./client";
export {
  evaluateCard,
  copyGate,
  signGate,
  MIN_SECONDS_LEFT,
  GATE_REASONS,
  GATE_REASON_TEXT,
  S2_ENABLED_IN_THIS_BUILD,
  type ApprovalMode,
  type CardCheck,
  type CardEvaluation,
  type CheckId,
  type CheckStatus,
  type EvaluateContext,
  type GateReason,
  type GateResult,
  type SignGateInput,
  type Verification,
} from "./card";
export { signingReducer, INITIAL_SIGNING, ordered, type SigningState, type SigningAction } from "./store";
