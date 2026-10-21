// Public surface of the read terminal, for the route file and for tests.
import "./terminal.css";

export { TerminalView, type TerminalFeed } from "./TerminalView";
export { ObserverPane, openItemCount, OPEN_ITEM_STATES } from "./ObserverPane";
export { Dock, pairingWords, STANDALONE_STRIP_TEXT, NOT_WATCHING_TEXT, type DockProps } from "./Dock";
export { DockActionsProvider, useDockActions, type DockActions } from "./dock-context";
export { PairingNotice, EXPIRED_TEXT } from "./PairingNotice";
export { usePairing, CHECKING, type Pairing, type PairingOptions, type PairingServices } from "./usePairing";
export { TerminalServicesProvider, createTerminalServices, useTerminalServices, type TerminalServices, type TerminalServicesOptions } from "./services";
export { PageSession, setTerminalTokenSource, SESSION_STORAGE_KEY, type PairOutcome, type PairReason, type StorageLike } from "./session";
export { parseLine, normalizeLine, describeCommand, COMMAND_NAMES, COMMAND_HELP, MAX_LINE_CHARS, type Command, type CommandName, type ParseResult, type ParseRefusal } from "./grammar";
export { TERMINAL_TOOLS, isTerminalTool, type TerminalTool } from "./tools";
export { DaemonClient, DaemonError, isDaemonError, type DaemonDeps, type ToolCallResult } from "./client";
export { runEventStream, drainFrames, STREAM_STATES, type StreamState, type StreamDeps, type StreamHandlers } from "./stream";
export { observerReducer, INITIAL_OBSERVER, type ObserverState, type ObserverAction, type ObservedItem, type AuditRow } from "./observer";
export { execute, type ExecContext, type Outcome, type CallRecord } from "./execute";
