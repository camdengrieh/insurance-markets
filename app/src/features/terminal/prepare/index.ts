// Public surface of the terminal's prepare commands, for the terminal route and for tests.
import "../../trade/trade.css";
import "./prepare.css";

export { PrepareConsole, type PrepareConsoleProps, type ProposalInput } from "./PrepareConsole";
export { PrepareOutcomeView } from "./PrepareOutcomeView";
export {
  PREPARE_VERBS,
  PREPARE_HELP,
  MAX_REDEEM_MARKETS,
  MAX_REDEEM_MARKETS_PER_LINE,
  isPrepareVerb,
  parsePrepareWords,
  routeLine,
  describePrepare,
  type PrepareCommand,
  type PrepareVerb,
  type PrepareRefusal,
  type PrepareParse,
  type RouteResult,
  type Allowance,
} from "./grammar";
export { LINE_ORIGINS, isTainted, retypeFieldsOf, checkRetype, checkProposal, type LineOrigin, type RetypeField, type RetypeKey, type Retyped, type RetypeCheck, type ProposalContext, type ProposalCheck } from "./taint";
export { runPrepare, resolveOwner, marketReaderOver, RUN_REFUSALS, RUN_REFUSAL_TEXT, type RunDeps, type RunInput, type RunOutcome, type RunRefusalCode, type MarketRead } from "./run";
