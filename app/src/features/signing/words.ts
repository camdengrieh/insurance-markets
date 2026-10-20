// Fixed app wording for the signing screen. Nothing here quotes the daemon, the relay, a venue or a market: a
// state or a kind is a closed value from the contract, and its words are written here.

import type { InboxState } from "@bridge/contract";
import { SAFETY_NOTICES } from "@shared/relay/contract";

import type { Tone } from "../../ui";
import type { Verification } from "./card";

export const KIND_TEXT: Readonly<Record<string, string>> = Object.freeze({
  userop: "Account operation (user operation)",
  order: "Order",
  auth: "XO login",
  create: "Market creation",
});

export const STATE_TEXT: Readonly<Record<InboxState, { readonly text: string; readonly tone: Tone; readonly explain: string }>> = Object.freeze({
  prepared: { text: "Prepared, not yet shown", tone: "info", explain: "The relay made this item. Nobody has looked at it on a card yet." },
  shown: { text: "Shown on a card", tone: "info", explain: "This card was shown. Nothing has been signed through this screen." },
  signed: { text: "Signed", tone: "warn", explain: "A signature exists. The agent submits it; this page never does." },
  submitted: { text: "Submitted", tone: "warn", explain: "It was sent to XO. Wait for the result." },
  accepted: { text: "Accepted", tone: "ok", explain: "XO accepted it." },
  rejected: { text: "Rejected", tone: "neutral", explain: "It was rejected. Rejecting here marks the card and stops this screen's use of the item; it does not cancel anything the relay already holds." },
  expired: { text: "Expired", tone: "neutral", explain: "Its time ran out. Ask the agent to prepare a new one." },
  ambiguous: { text: "Ambiguous: do not resend", tone: "danger", explain: "The result of sending is not known. Do not send it again. Check the status by its hash instead." },
});

export const VERIFICATION_TEXT: Readonly<Record<Verification, { readonly title: string; readonly tone: Tone; readonly explain: string }>> = Object.freeze({
  verified: {
    title: "Rebuilt here and matches",
    tone: "ok",
    explain:
      "This page rebuilt the digest, both tags, the order terms and every line of the summary from the decoded fields, with the same digest code the relay uses, and they match what the relay sent. That catches an item that was altered on the way. It does not catch a flaw both share, and it says nothing about whether a hostile agent should be trusted.",
  },
  viewer_only: {
    title: "Viewer only: the digest is not independently derivable",
    tone: "warn",
    explain:
      "The relay sent no decoded block, so this page cannot rebuild the digest. It is showing the relay's summary exactly as sent and has not verified it. Compare it with what PayBox shows before approving anything.",
  },
  failed: {
    title: "A check failed: do not sign",
    tone: "danger",
    explain: "At least one check below failed. Signing and copying are switched off for this item. Ask the agent to prepare a new one, and look at why this one differs.",
  },
});

export const FRESHNESS_TEXT = Object.freeze({
  fresh: "Enough time left",
  short: "Too little time left to approve",
  expired: "Expired",
});

// The two-tag wording (dapp-design 5.3, M4-12). What PayBox actually shows is not recorded yet (DT1), so the words
// say what each tag IS and what to compare, and do not promise what a PayBox window displays.
export const TAG_WORDS = Object.freeze({
  digest:
    "Digest tag: the first 16 hex digits of the digest that will be signed. For a raw intent, PayBox can show only this digest.",
  innerCallData:
    "Inner tag (call data): the first 16 hex digits of the hash of this operation's call data. It changes if the call inside is swapped, even when a window shows only the outer digest.",
  innerTyped:
    "Inner tag (typed data): the first 16 hex digits of the hash inside the Kernel message, which is the order or login hash. A window that decodes typed data shows this hash; it shares no digits with the digest tag.",
  unknownDisplay:
    "What the PayBox window really shows for each kind of intent has not been recorded. Compare whichever of the two tags PayBox shows. If it shows neither, do not approve.",
  limits: "Neither tag defends against a hostile agent. They help against accidents and swapped items.",
});

export const REMINDERS = Object.freeze({
  dedicated: SAFETY_NOTICES.dedicatedCredential,
  approvalMode: SAFETY_NOTICES.approvalMode,
  advisoryCaps: SAFETY_NOTICES.advisoryCaps,
  digestTag: SAFETY_NOTICES.digestTag,
});

export const AUTONOMOUS_BANNER =
  "This credential is in autonomous mode. Caps are advisory: nothing stops the agent from signing without showing you anything. Signing from this page stays off.";

export function requesterText(requestedBy: string): string {
  if (requestedBy === "ui") return "this page";
  if (requestedBy === "terminal") return "the terminal";
  if (/^agent:[0-9a-f]{8}$/.test(requestedBy)) return `agent token ${requestedBy.slice("agent:".length)}`;
  return "unknown";
}

// Groups of four, for reading a tag aloud against another screen.
export function groupTag(tag: string): string {
  return tag.replace(/(.{4})(?=.)/g, "$1 ");
}
