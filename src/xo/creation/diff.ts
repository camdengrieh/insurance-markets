// The diff guard for the oracle's rewrites (docs/phase1-gap-closing.md CR5 and CR6, N12; research note 23
// sections 3.4, 8 rule O07 and Verification V2.3).
//
// When XO's oracle answers UPDATE_REQUIRED it publishes a suggested metadata file and a suggested expiry. The
// creator can only accept or decline (`respondToUpdateRequest(conditionId, bool)`): there is no edit. In the
// sampled history the oracle rewrote the rules in 34 of 38 pairs, always emptied the tags, and in 2 of 38
// changed what the market means (a 3 percent threshold became 5 percent; a fixed date was replaced). On top of
// that, accepting applies the suggested expiry, which differed from the on-chain expiry in 22 of 233 cases
// (17 of them earlier, down to 519 days) and is invisible in the JSON.
//
// So acceptance is a change of contract, and this guard decides whether a human has to look. Pure and
// deterministic: it compares FACTS that decide how a market resolves, not prose.
//   - numbers (3% to 5%, 7,429.65 to 7,276.46), dates, clock times and timezones;
//   - comparison wording (at least versus more than, rise versus fall);
//   - named entities (teams, assets, institutions) dropped from the text;
//   - outcome labels and the direction of each outcome rule;
//   - the suggested expiry, against the current expiry and against what the user asked for.
// Additions (a date, a timezone, a void clause, a fallback source, definitions) and tag changes are listed as
// benign. Nothing here reads meaning: a rewrite that passes can still change what a market means, and the
// result says so. A flagged verdict never accepts or declines anything; it only stops a recommendation.
//
// Both files are untrusted text. Nothing in the result repeats them except inside UntrustedContent
// (sanitised, labelled, truncated), and the fixed `describeDiff` lines contain no market text at all.

import { sanitizeUntrusted, type UntrustedContent } from "../../guardrails/untrusted.js";
import {
  entityPresent,
  extractComparators,
  extractDates,
  extractEntities,
  extractNumbers,
  extractTimes,
  squash,
  validateMetadata,
  wordSetOf,
  type DateFact,
  type EntityFact,
  type MetadataCheck,
  type MetadataJson,
  type TimeFact,
} from "./metadata.js";

export type DiffKind = "numbers" | "dates" | "entities" | "outcomes" | "text" | "tags" | "expiry";
export type DiffRisk = "benign" | "meaning_change";

export type DiffCode =
  // meaning changes
  | "original_unreadable"
  | "suggestion_unreadable"
  | "suggestion_fails_checks"
  | "numbers_changed"
  | "dates_changed"
  | "times_changed"
  | "comparator_lost"
  | "entity_lost"
  | "outcomes_changed"
  | "outcome_rule_changed"
  | "expiry_changed"
  | "expiry_earlier_than_intent"
  | "expiry_later_than_intent"
  | "expiry_not_in_future"
  | "expiry_unreadable"
  | "suggestion_inconsistent"
  // benign changes
  | "numbers_added"
  | "dates_added"
  | "times_added"
  | "tags_changed"
  | "title_changed"
  | "description_changed"
  | "rules_reworded"
  | "outcome_rules_reworded"
  | "sources_changed"
  | "image_changed"
  | "category_changed"
  | "subcategories_changed";

export const MEANING_CODES: readonly DiffCode[] = Object.freeze([
  "original_unreadable",
  "suggestion_unreadable",
  "suggestion_fails_checks",
  "numbers_changed",
  "dates_changed",
  "times_changed",
  "comparator_lost",
  "entity_lost",
  "outcomes_changed",
  "outcome_rule_changed",
  "expiry_changed",
  "expiry_earlier_than_intent",
  "expiry_later_than_intent",
  "expiry_not_in_future",
  "expiry_unreadable",
  "suggestion_inconsistent",
] as const);

export interface DiffChange {
  readonly code: DiffCode;
  // Where, as a fixed path ("rules.description", "tags", "expiry").
  readonly field: string;
  readonly kind: DiffKind;
  readonly risk: DiffRisk;
  // Both sides are market or oracle text: sanitised, truncated and labelled untrusted.
  readonly before: UntrustedContent;
  readonly after: UntrustedContent;
}

export interface ExpiryReading {
  // Unix seconds.
  readonly currentS: number;
  // The oracle's suggestedExpiresAt; null when it is 0 (the contract then keeps the current expiry).
  readonly suggestedS: number | null;
  // What the expiry will be if the update is accepted.
  readonly effectiveS: number;
  // What the user asked for when the market was created.
  readonly intendedS: number;
  readonly changed: boolean;
  // effective minus current, in seconds.
  readonly deltaS: number;
  readonly earlierThanIntent: boolean;
  readonly laterThanIntent: boolean;
}

export interface DiffResult {
  readonly verdict: "pass" | "flagged";
  // Meaning changes first, then benign ones, each group in field order.
  readonly changes: readonly DiffChange[];
  readonly flaggedCodes: readonly DiffCode[];
  // Fields whose content differs at all.
  readonly fieldsChanged: readonly string[];
  readonly expiry: ExpiryReading | null;
  // Findings of the suggestion against the deterministic metadata rules (warnings and blocks only).
  readonly suggestionChecks: readonly MetadataCheck[];
  // Share of the rules text that changed, in per-mille of the distinct words (information only).
  readonly rulesRewritePerMille: number;
}

export interface DiffOptions {
  // The market's current on-chain expiry, unix seconds.
  readonly currentExpiresAtS: number;
  // The oracle's suggestedExpiresAt. 0 or null means "no expiry change".
  readonly suggestedExpiresAtS: number | null;
  // The expiry the user asked for at creation. Defaults to the current expiry.
  readonly intendedExpiresAtS?: number;
  // When given, an effective expiry that is not in the future is flagged.
  readonly nowS?: number;
}

export const DIFF_LIMITS_NOTICE =
  "This check is deterministic and covers numbers, dates, clock times, comparison wording, named entities, outcome labels and the expiry. It does not read meaning: a rewrite that passes can still change what the market means, so read the new rules before you accept.";

// ---- helpers ---------------------------------------------------------------------------------------------

const CLIP_CHARS = 400;

function clip(text: string, source: "market-metadata" | "xo-oracle-suggestion"): UntrustedContent {
  return sanitizeUntrusted(text, { maxChars: CLIP_CHARS, source });
}

function listText(items: readonly string[]): string {
  return items.join(", ");
}

function isoSecond(seconds: number): string {
  return Number.isSafeInteger(seconds) && seconds > 0 && seconds < 8.64e12 / 1000 ? new Date(seconds * 1000).toISOString().replace(/\.\d{3}Z$/, "Z") : "invalid";
}

const normalizeLabel = (text: string): string => text.normalize("NFKC").trim().toLowerCase().replace(/\s+/g, " ");

function meaningText(metadata: MetadataJson): string {
  return [
    metadata.title,
    metadata.description,
    metadata.rules.description,
    ...metadata.rules.outcomeRules.map((entry) => entry.rule),
    ...metadata.outcomes.map((entry) => entry.title),
  ].join(" | ");
}

function timesOf(text: string): TimeFact[] {
  const found = [...extractTimes(text)];
  for (const date of extractDates(text)) if (date.time !== null) found.push({ clock: date.time, zone: date.zone });
  return found;
}

function timeKept(original: TimeFact, suggested: readonly TimeFact[]): boolean {
  return suggested.some((fact) => fact.clock === original.clock && (original.zone === null || fact.zone === original.zone));
}

function sourceHosts(sources: readonly string[]): string[] {
  const hosts: string[] = [];
  for (const source of sources) {
    try {
      hosts.push(new URL(source).hostname.toLowerCase().replace(/^www\./, ""));
    } catch {
      hosts.push(source.slice(0, 60));
    }
  }
  return hosts;
}

function sameSet(a: readonly string[], b: readonly string[]): boolean {
  const left = new Set(a);
  const right = new Set(b);
  return left.size === right.size && [...left].every((item) => right.has(item));
}

function rewritePerMille(before: string, after: string): number {
  const a = wordSetOf(before);
  const b = wordSetOf(after);
  if (a.size === 0 && b.size === 0) return 0;
  let shared = 0;
  for (const word of a) if (b.has(word)) shared += 1;
  const union = a.size + b.size - shared;
  return Math.round((1000 * (union - shared)) / union);
}

class Changes {
  readonly items: DiffChange[] = [];
  add(code: DiffCode, field: string, kind: DiffKind, before: string, after: string): void {
    this.items.push({
      code,
      field,
      kind,
      risk: MEANING_CODES.includes(code) ? "meaning_change" : "benign",
      before: clip(before, "market-metadata"),
      after: clip(after, "xo-oracle-suggestion"),
    });
  }
}

function emptyResult(changes: Changes, suggestionChecks: readonly MetadataCheck[]): DiffResult {
  return {
    verdict: "flagged",
    changes: changes.items,
    flaggedCodes: changes.items.map((entry) => entry.code),
    fieldsChanged: [],
    expiry: null,
    suggestionChecks,
    rulesRewritePerMille: 0,
  };
}

function readExpiry(options: DiffOptions): ExpiryReading | null {
  const valid = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value > 0;
  if (!valid(options.currentExpiresAtS)) return null;
  const suggested = options.suggestedExpiresAtS === null || options.suggestedExpiresAtS === 0 ? null : options.suggestedExpiresAtS;
  if (suggested !== null && !valid(suggested)) return null;
  const intended = options.intendedExpiresAtS === undefined ? options.currentExpiresAtS : options.intendedExpiresAtS;
  if (!valid(intended)) return null;
  const effective = suggested ?? options.currentExpiresAtS;
  return {
    currentS: options.currentExpiresAtS,
    suggestedS: suggested,
    effectiveS: effective,
    intendedS: intended,
    changed: suggested !== null && suggested !== options.currentExpiresAtS,
    deltaS: effective - options.currentExpiresAtS,
    earlierThanIntent: effective < intended,
    laterThanIntent: effective > intended,
  };
}

// ---- fact comparison ---------------------------------------------------------------------------------------

function resolutionText(metadata: MetadataJson): string {
  return [metadata.rules.description, ...metadata.rules.outcomeRules.map((entry) => entry.rule)].join(" | ");
}
function labelText(metadata: MetadataJson): string {
  return [metadata.title, metadata.description, ...metadata.outcomes.map((entry) => entry.title)].join(" | ");
}

interface Loss {
  readonly numbers: string[];
  readonly dates: DateFact[];
  readonly times: TimeFact[];
  readonly comparators: string[];
  readonly entities: EntityFact[];
}

function dateMatches(fact: DateFact, other: DateFact): boolean {
  if (fact.key.startsWith("~")) return other.key === fact.key;
  if (fact.year === null) return !other.key.startsWith("~") && !other.key.startsWith("Y") && other.month === fact.month && other.day === fact.day;
  return other.key === fact.key;
}

// The dates of `base` that `against` no longer states. A bare year ("the end of 2026") is satisfied by any
// other date or year of that year that no full date of `base` already used.
function lostDates(base: readonly DateFact[], against: readonly DateFact[]): DateFact[] {
  const lost: DateFact[] = [];
  const used = new Set<number>();
  const bare: DateFact[] = [];
  for (const fact of base) {
    if (fact.key.startsWith("Y")) {
      bare.push(fact);
      continue;
    }
    const index = against.findIndex((other) => dateMatches(fact, other));
    if (index === -1) lost.push(fact);
    else used.add(index);
  }
  for (const fact of bare) {
    const index = against.findIndex((other, position) => !used.has(position) && other.year === fact.year);
    if (index === -1) lost.push(fact);
    else used.add(index);
  }
  return lost;
}

// What `base` states that `against` does not.
function lossOf(base: string, against: string): Loss {
  const againstNumbers = new Set(extractNumbers(against));
  const againstTimes = timesOf(against);
  const againstFamilies = new Set(extractComparators(against));
  const haystack = squash(against);
  const words = wordSetOf(against);
  return {
    numbers: extractNumbers(base).filter((token) => !againstNumbers.has(token)),
    dates: lostDates(extractDates(base), extractDates(against)),
    times: timesOf(base).filter((fact) => !timeKept(fact, againstTimes)),
    comparators: extractComparators(base).filter((name) => !againstFamilies.has(name)),
    entities: extractEntities(base).filter((entity) => !entityPresent(entity, haystack, words)),
  };
}

function unique<T>(items: readonly T[], key: (item: T) => string): T[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const id = key(item);
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

function mergeLoss(a: Loss, b: Loss): Loss {
  return {
    numbers: unique([...a.numbers, ...b.numbers], (item) => item),
    dates: unique([...a.dates, ...b.dates], (item) => item.key),
    times: unique([...a.times, ...b.times], (item) => `${item.clock}|${item.zone ?? ""}`),
    comparators: unique([...a.comparators, ...b.comparators], (item) => item),
    entities: unique([...a.entities, ...b.entities], (item) => item.key),
  };
}

// What `after` states that `before` does not (information for the benign lines).
function additions(before: string, after: string): { numbers: string[]; dates: DateFact[]; times: TimeFact[] } {
  const numbersBefore = new Set(extractNumbers(before));
  const datesBefore = extractDates(before);
  const timesBefore = timesOf(before);
  return {
    numbers: extractNumbers(after).filter((token) => !numbersBefore.has(token)),
    dates: extractDates(after).filter((fact) => !datesBefore.some((other) => other.key === fact.key) && !(fact.key.startsWith("Y") && datesBefore.some((other) => other.year === fact.year))),
    times: timesOf(after).filter((fact) => !timesBefore.some((other) => other.clock === fact.clock && other.zone === fact.zone)),
  };
}

// ---- the guard -------------------------------------------------------------------------------------------

export function diffMetadata(original: unknown, suggested: unknown, options: DiffOptions): DiffResult {
  const changes = new Changes();
  const expiry = readExpiry(options);

  const originalShape = validateMetadata(original);
  if (originalShape.metadata === null) {
    changes.add("original_unreadable", "$", "text", "original metadata", "");
    return emptyResult(changes, []);
  }
  const suggestionShape = validateMetadata(suggested, expiry === null ? {} : { expiresAtS: expiry.effectiveS });
  const suggestionChecks = suggestionShape.checks.filter((entry) => entry.severity !== "info");
  if (suggestionShape.metadata === null) {
    changes.add("suggestion_unreadable", "$", "text", "", `The suggestion is not the nine-key metadata shape (${suggestionShape.blocks} problem(s)).`);
    return emptyResult(changes, suggestionChecks);
  }
  const before = originalShape.metadata;
  const after = suggestionShape.metadata;
  // An expiry that cannot be read is never "unchanged": fail closed.
  if (expiry === null) changes.add("expiry_unreadable", "expiry", "expiry", "", "The expiry values could not be read.");
  if (suggestionShape.blocks > 0) {
    const rules = [...new Set(suggestionShape.checks.filter((entry) => entry.severity === "block").map((entry) => entry.rule))];
    changes.add("suggestion_fails_checks", "$", "text", "", `The suggestion fails ${rules.join(", ")}.`);
  }

  // Which fields differ at all.
  const fieldsChanged: string[] = [];
  const mark = (field: string, differs: boolean): boolean => {
    if (differs) fieldsChanged.push(field);
    return differs;
  };

  const sameTags = sameSet(before.tags.map(normalizeLabel), after.tags.map(normalizeLabel));
  const sameSources = sameSet(before.resolution_sources, after.resolution_sources);
  const sameOutcomeRules = before.rules.outcomeRules.every((entry, index) => entry.rule === after.rules.outcomeRules[index]?.rule);
  const titleChanged = mark("title", before.title !== after.title);
  const descriptionChanged = mark("description", before.description !== after.description);
  const categoryChanged = mark("category", before.category !== after.category);
  const tagsChanged = mark("tags", !sameTags);
  const subcategoriesChanged = mark("subcategories", !sameSet(before.subcategories, after.subcategories));
  const imageChanged = mark("image_url", before.image_url !== after.image_url);
  const rulesChanged = mark("rules.description", before.rules.description !== after.rules.description);
  const outcomeRulesChanged = mark("rules.outcomeRules", !sameOutcomeRules);
  const sourcesChanged = mark("resolution_sources", !sameSources);
  const outcomesChanged = mark("outcomes", before.outcomes.some((entry, index) => normalizeLabel(entry.title) !== normalizeLabel(after.outcomes[index]?.title ?? "")));

  // Facts that decide how the market resolves. Two groups of text are compared differently:
  //   - the RESOLUTION text (rules.description and the two outcome rules) defines the bet: every fact it stated
  //     must still be stated in the suggestion's resolution text. A title that kept the old figure does not
  //     rescue a rules text that dropped it;
  //   - the LABEL text (title, description, outcome titles) may be reworded freely, as long as every fact it
  //     carried is still stated somewhere in the suggestion.
  const resolutionBefore = resolutionText(before);
  const resolutionAfter = resolutionText(after);
  const lost = mergeLoss(lossOf(resolutionBefore, resolutionAfter), lossOf(labelText(before), meaningText(after)));
  const gained = additions(meaningText(before), meaningText(after));
  // The oracle's usual edit changes rules.description alone, so a figure it replaced can still be restated in the
  // title or an outcome rule and look "kept". Within rules.description itself a figure that went away while a new
  // one appeared (that the original never stated anywhere) is a substitution, not a rewording: 10 became 12.
  const ownLoss = lossOf(before.rules.description, after.rules.description);
  const newInRules = additions(meaningText(before), after.rules.description);
  const replaced = {
    numbers: ownLoss.numbers.length > 0 && newInRules.numbers.length > 0,
    dates: ownLoss.dates.length > 0 && newInRules.dates.length > 0,
    times: ownLoss.times.length > 0 && newInRules.times.length > 0,
  };

  if (lost.numbers.length > 0 || replaced.numbers) changes.add("numbers_changed", "rules.description", "numbers", listText(lost.numbers.length > 0 ? lost.numbers : ownLoss.numbers), listText(gained.numbers));
  else if (gained.numbers.length > 0) changes.add("numbers_added", "rules.description", "numbers", "", listText(gained.numbers));

  if (lost.dates.length > 0 || replaced.dates) changes.add("dates_changed", "rules.description", "dates", listText((lost.dates.length > 0 ? lost.dates : ownLoss.dates).map((fact) => fact.key)), listText(gained.dates.map((fact) => fact.key)));
  else if (gained.dates.length > 0) changes.add("dates_added", "rules.description", "dates", "", listText(gained.dates.map((fact) => fact.key)));

  const timeLabel = (fact: TimeFact): string => `${fact.clock}${fact.zone === null ? "" : ` ${fact.zone}`}`;
  if (lost.times.length > 0 || replaced.times) changes.add("times_changed", "rules.description", "dates", listText((lost.times.length > 0 ? lost.times : ownLoss.times).map(timeLabel)), listText(gained.times.map(timeLabel)));
  else if (gained.times.length > 0) changes.add("times_added", "rules.description", "dates", "", listText(gained.times.map(timeLabel)));

  // The same substitution test for comparison wording: one family went away and another took its place.
  const ownBefore = new Set(extractComparators(before.rules.description));
  const swappedFamily = ownLoss.comparators.length > 0 && extractComparators(after.rules.description).some((name) => !ownBefore.has(name));
  if (lost.comparators.length === 0 && swappedFamily) changes.add("comparator_lost", "rules.description", "text", listText(ownLoss.comparators), listText(extractComparators(after.rules.description)));
  if (lost.comparators.length > 0) changes.add("comparator_lost", "rules.description", "text", listText(lost.comparators), listText(extractComparators(resolutionAfter)));
  if (lost.entities.length > 0) changes.add("entity_lost", "rules.description", "entities", listText(lost.entities.map((entity) => entity.text)), "");

  // A suggestion that disagrees with itself (a title that states a figure or date its own rules do not) is a
  // sign the rewrite was not made as a whole.
  const introduced = suggestionChecks.filter((entry) => (entry.code === "title_number_not_in_rules" || entry.code === "title_date_not_in_rules") && !originalShape.checks.some((other) => other.code === entry.code));
  if (introduced.length > 0) changes.add("suggestion_inconsistent", "title", "text", "", "The suggested title states a figure or date that its own rules do not.");

  if (outcomesChanged) {
    changes.add("outcomes_changed", "outcomes", "outcomes", listText(before.outcomes.map((entry) => entry.title)), listText(after.outcomes.map((entry) => entry.title)));
  }
  // Each outcome rule must keep its own direction and subject: swapping the two keeps every number and word
  // of the whole text, but flips what Yes and No mean.
  const swapped = before.rules.outcomeRules.some((entry, index) => {
    const other = after.rules.outcomeRules[index];
    if (other === undefined) return true;
    const kept = new Set(extractComparators(other.rule));
    if (extractComparators(entry.rule).some((name) => !kept.has(name))) return true;
    const ruleHaystack = squash(other.rule);
    const ruleWords = wordSetOf(other.rule);
    return extractEntities(entry.rule).some((entity) => !entityPresent(entity, ruleHaystack, ruleWords));
  });
  if (swapped) {
    changes.add("outcome_rule_changed", "rules.outcomeRules", "outcomes", before.rules.outcomeRules.map((entry) => entry.rule).join(" | "), after.rules.outcomeRules.map((entry) => entry.rule).join(" | "));
  }

  // The expiry.
  if (expiry !== null) {
    if (expiry.changed) changes.add("expiry_changed", "expiry", "expiry", isoSecond(expiry.currentS), isoSecond(expiry.effectiveS));
    if (expiry.earlierThanIntent) changes.add("expiry_earlier_than_intent", "expiry", "expiry", isoSecond(expiry.intendedS), isoSecond(expiry.effectiveS));
    if (expiry.laterThanIntent) changes.add("expiry_later_than_intent", "expiry", "expiry", isoSecond(expiry.intendedS), isoSecond(expiry.effectiveS));
    if (options.nowS !== undefined && expiry.effectiveS <= options.nowS) {
      changes.add("expiry_not_in_future", "expiry", "expiry", isoSecond(expiry.currentS), isoSecond(expiry.effectiveS));
    }
  }

  // Benign changes, listed so the human sees them.
  if (tagsChanged) changes.add("tags_changed", "tags", "tags", listText(before.tags), listText(after.tags));
  if (titleChanged) changes.add("title_changed", "title", "text", before.title, after.title);
  if (descriptionChanged) changes.add("description_changed", "description", "text", before.description, after.description);
  if (rulesChanged) changes.add("rules_reworded", "rules.description", "text", before.rules.description, after.rules.description);
  if (outcomeRulesChanged && !swapped) {
    changes.add("outcome_rules_reworded", "rules.outcomeRules", "text", before.rules.outcomeRules.map((entry) => entry.rule).join(" | "), after.rules.outcomeRules.map((entry) => entry.rule).join(" | "));
  }
  if (sourcesChanged) changes.add("sources_changed", "resolution_sources", "text", listText(sourceHosts(before.resolution_sources)), listText(sourceHosts(after.resolution_sources)));
  if (imageChanged) changes.add("image_changed", "image_url", "text", before.image_url, after.image_url);
  if (categoryChanged) changes.add("category_changed", "category", "text", before.category, after.category);
  if (subcategoriesChanged) changes.add("subcategories_changed", "subcategories", "text", listText(before.subcategories), listText(after.subcategories));

  const ordered = [...changes.items.filter((entry) => entry.risk === "meaning_change"), ...changes.items.filter((entry) => entry.risk === "benign")];
  const flaggedCodes = ordered.filter((entry) => entry.risk === "meaning_change").map((entry) => entry.code);
  return {
    verdict: flaggedCodes.length > 0 ? "flagged" : "pass",
    changes: ordered,
    flaggedCodes,
    fieldsChanged: expiry?.changed === true ? [...fieldsChanged, "expiry"] : fieldsChanged,
    expiry,
    suggestionChecks,
    rulesRewritePerMille: rulesChanged ? rewritePerMille(before.rules.description, after.rules.description) : 0,
  };
}

// ---- output for the relay and the approver ---------------------------------------------------------------

// What POST /v1/creation/track returns as `pending_update` (src/relay/contract.ts creationTrackResponse).
export interface PendingUpdateView {
  readonly suggested_expires_at: string | null;
  readonly expiry_changed: boolean;
  readonly guard_verdict: "pass" | "flagged";
  readonly changes: readonly {
    readonly field: string;
    readonly kind: DiffKind;
    readonly risk: DiffRisk;
    readonly before: UntrustedContent;
    readonly after: UntrustedContent;
  }[];
}

const MAX_CONTRACT_CHANGES = 50;

export function toPendingUpdate(result: DiffResult): PendingUpdateView {
  return {
    suggested_expires_at: result.expiry?.suggestedS === null || result.expiry === null ? null : isoSecond(result.expiry.suggestedS),
    expiry_changed: result.expiry?.changed === true,
    guard_verdict: result.verdict,
    // Meaning changes come first, so a cut never drops one.
    changes: result.changes.slice(0, MAX_CONTRACT_CHANGES).map((entry) => ({ field: entry.field, kind: entry.kind, risk: entry.risk, before: entry.before, after: entry.after })),
  };
}

const CODE_TEXT: Readonly<Record<DiffCode, string>> = Object.freeze({
  original_unreadable: "The original metadata could not be read, so nothing can be compared.",
  suggestion_unreadable: "The oracle's suggested file is not the expected nine-key metadata shape.",
  suggestion_fails_checks: "The suggested file fails the plugin's metadata checks.",
  numbers_changed: "A number in the text was changed or dropped.",
  dates_changed: "A date in the text was changed or dropped.",
  times_changed: "A clock time or timezone in the text was changed or dropped.",
  comparator_lost: "Comparison wording (such as at least, more than, rise, fall) was lost.",
  entity_lost: "A named entity from the original no longer appears.",
  outcomes_changed: "An outcome label was changed.",
  outcome_rule_changed: "An outcome rule changed direction or subject (its comparison wording or a named entity in it).",
  expiry_changed: "Accepting would change the market's end date.",
  expiry_earlier_than_intent: "The end date would be earlier than the one you asked for.",
  expiry_later_than_intent: "The end date would be later than the one you asked for.",
  expiry_not_in_future: "The end date would not be in the future.",
  expiry_unreadable: "The current or suggested end date could not be read.",
  suggestion_inconsistent: "The suggested title states a figure or date that the suggested rules do not.",
  numbers_added: "Numbers were added.",
  dates_added: "Dates were added.",
  times_added: "Clock times or timezones were added.",
  tags_changed: "The tags changed.",
  title_changed: "The title was reworded.",
  description_changed: "The description was reworded.",
  rules_reworded: "The rules text was reworded.",
  outcome_rules_reworded: "The outcome rules were reworded.",
  sources_changed: "The resolution sources changed.",
  image_changed: "The image changed.",
  category_changed: "The category changed.",
  subcategories_changed: "The subcategories changed.",
});

// Fixed lines for an approver: counts and fixed sentences only, never text from either file.
export function describeDiff(result: DiffResult): string[] {
  const lines: string[] = [];
  if (result.verdict === "flagged") {
    lines.push(`Flagged: ${result.flaggedCodes.length} change(s) could alter what the market means. Do not accept without reading the new rules.`);
    for (const code of [...new Set(result.flaggedCodes)]) lines.push(CODE_TEXT[code]);
  } else if (result.changes.some((entry) => entry.code === "numbers_added" || entry.code === "dates_added" || entry.code === "times_added")) {
    lines.push("Numbers, dates or clock times were added in text other than the rules. Read what was added; nothing the original rules stated was found missing.");
  } else {
    lines.push("No change to numbers, dates, comparison wording, named entities, outcome labels or the end date was found.");
  }
  const benign = [...new Set(result.changes.filter((entry) => entry.risk === "benign").map((entry) => entry.code))];
  if (benign.length > 0) lines.push(`Also changed: ${benign.length} other field(s) (${benign.join(", ")}).`);
  lines.push(DIFF_LIMITS_NOTICE);
  return lines;
}
