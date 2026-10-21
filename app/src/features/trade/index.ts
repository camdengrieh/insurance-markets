// Public surface of the trade feature: the desk the market modal hosts for XO markets in the Cockpit build, and the
// pure modules (ticket arithmetic, vetting, prepare) other features and tests use.
import "./trade.css";

export { TradeDesk, type TradeDeskProps } from "./TradeDesk";
export { OrderPanel, type TokenChoice } from "./ActionPanels";
export { ClobOrderPanel, type ClobOrderPanelProps } from "./ClobOrderPanel";
export { buildClobTicket, clobMarketFacts, expectedClobQuote, signedFieldsPreview, type ClobTicket, type ClobMarketFacts, type ClobTicketResult } from "./clob-ticket";
export { TradeServicesProvider, createTradeServices, useTradeServices, setTradeFactsSource, type TradeServices, type TradeServicesOptions, type OwnerChoice } from "./services";
export { TradeClient, DaemonError, isDaemonError, type TradeCallResult, type TradeClientDeps } from "./client";
export { TRADE_TOOLS, TRADE_READ_TOOLS, TRADE_PREPARE_TOOLS, isTradeTool, toolClassOf, type TradeTool } from "./tools";
export { ACTION_NEEDS, TRADE_ACTIONS, WRITE_FLAGS, gateFor, gateForCancel, mergeFacts, flagIsOn, type TradeAction, type Gate, type GateInput } from "./facts";
export { renderCalls, RENDERABLE_ACTIONS, type RenderedCall, type RenderResult, type TemplateCode } from "./templates";
export { vetPrepared, type Expected, type VettedItem, type VetFailure, type VetResult } from "./vet";
export { buildTicket, expectedQuote, overOrderCap, type Ticket, type TicketResult } from "./ticket";
export { vetFundingProposal, type FundingIntent, type FundingFailure } from "./funding";
export { prepareDeploy, prepareRevoke, prepareRedeem, prepareOrder, prepareClobOrder, prepareFunding, type PrepareResult } from "./prepare";
export { readAccount, readOrders, type AccountRead, type OrdersRead } from "./reads";
