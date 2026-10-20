// Public surface of the read terminal, for the route file and for tests.
import "./terminal.css";

export { TerminalView } from "./TerminalView";
export { ObserverPane } from "./ObserverPane";
export { TerminalServicesProvider, createTerminalServices, useTerminalServices, type TerminalServices, type TerminalServicesOptions } from "./services";
export { PageSession, setTerminalTokenSource, SESSION_STORAGE_KEY, type PairOutcome, type PairReason, type StorageLike } from "./session";
export { parseLine, normalizeLine, describeCommand, COMMAND_NAMES, COMMAND_HELP, MAX_LINE_CHARS, type Command, type CommandName, type ParseResult, type ParseRefusal } from "./grammar";
export { TERMINAL_TOOLS, isTerminalTool, type TerminalTool } from "./tools";
export { DaemonClient, DaemonError, isDaemonError, type DaemonDeps, type ToolCallResult } from "./client";
export { runEventStream, drainFrames, STREAM_STATES, type StreamState, type StreamDeps, type StreamHandlers } from "./stream";
export { observerReducer, INITIAL_OBSERVER, type ObserverState, type ObserverAction, type ObservedItem, type AuditRow } from "./observer";
export { execute, type ExecContext, type Outcome, type CallRecord } from "./execute";
