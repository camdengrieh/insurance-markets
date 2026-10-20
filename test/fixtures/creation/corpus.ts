// A SYNTHETIC reconstruction of the metadata corpus of research note 23: 100 original files, 38 oracle-
// suggested versions (138 in all) and the 38 original-versus-suggested pairs.
//
// Why synthetic. The 138 files the researcher fetched were not saved in the repository: only their aggregate
// statistics (schema_summary.json), the per-pair change summaries (pairs_detail.json), four full exemplar
// files and one real pair (exemplars.json) were. Fetching them again is outside this build's rules (no
// network). So this module generates files that reproduce the recorded statistics, deterministically (a fixed
// seed, no Math.random, no clock):
//
//   - key presence and types; two outcomes with ids 0 and 1; exactly two outcome rules;
//   - tag counts of the originals (4: 56, 3: 20, 5: 9, 1: 6, 2: 7, 10: 1, 6: 1) and none in the oracle's versions;
//   - subcategory counts, resolution-source counts, the category counts, the outcome-title pairs (Yes/No 111),
//     title equal to description in 82, the image hosts (GCS 111, S3 27) and the rules length bounds (38 to 2616);
//   - for each of the 38 pairs, exactly the fields pairs_detail.json says changed, the recorded source counts
//     before and after, and the recorded expiry shifts (three pairs: +42, -183 and -185 days).
//
// What it is not: it is not XO's data, its prose is invented, and which two pairs held the meaning-changing
// rewrites (a 3 percent threshold made 5 percent; a fixed date replaced by an event) is not recorded, so they
// are placed at the first pairs that fit (see DRIFT_SLOTS). A test that passes on this corpus proves the code
// accepts files of this shape and statistics, not that it accepts every real file.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import type { MetadataJson } from "../../../src/xo/creation/metadata.js";

const HERE = dirname(fileURLToPath(import.meta.url));
export const FIXTURE_DIR = HERE;

export function readJson<T>(name: string): T {
  return JSON.parse(readFileSync(join(HERE, name), "utf8")) as T;
}

// ---- seeded randomness ----------------------------------------------------------------------------------------

export const CORPUS_SEED = 20_261_019;

export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}
type Rng = () => number;
const int = (rng: Rng, low: number, high: number): number => low + Math.floor(rng() * (high - low + 1));
const pick = <T>(rng: Rng, items: readonly T[]): T => items[Math.floor(rng() * items.length)] as T;
function shuffle<T>(rng: Rng, items: readonly T[]): T[] {
  const out = [...items];
  for (let index = out.length - 1; index > 0; index -= 1) {
    const other = Math.floor(rng() * (index + 1));
    [out[index], out[other]] = [out[other] as T, out[index] as T];
  }
  return out;
}
function uuid(rng: Rng): string {
  const hex = (n: number): string => Array.from({ length: n }, () => int(rng, 0, 15).toString(16)).join("");
  return `${hex(8)}-${hex(4)}-4${hex(3)}-${pick(rng, ["8", "9", "a", "b"])}${hex(3)}-${hex(12)}`;
}

// ---- the recorded statistics ----------------------------------------------------------------------------------------

export interface PairRecord {
  readonly cond: string;
  readonly first_dec: string;
  readonly accepted: boolean;
  readonly fields: readonly string[];
  readonly len_before: number;
  readonly len_after: number;
  readonly src_before: number;
  readonly src_after: number;
  readonly exp_changed: boolean;
  readonly sugg_exp_minus_orig_days: number;
}

export interface SchemaSummary {
  readonly n_files: number;
  readonly tags_count_original: Readonly<Record<string, number>>;
  readonly subcategories_count: Readonly<Record<string, number>>;
  readonly resolution_sources_count: Readonly<Record<string, number>>;
  readonly category_values_in_sample: Readonly<Record<string, number>>;
  readonly title_equals_description: number;
  readonly image_url_hosts: Readonly<Record<string, number>>;
  readonly rules_description_chars_original: { readonly min: number; readonly max: number };
  readonly outcome_count: Readonly<Record<string, number>>;
}

export type Category = "SPORTS" | "CRYPTO" | "POLITICS" | "FINANCE" | "TECH" | "CULTURE";

// ---- the market templates -----------------------------------------------------------------------------------------

interface Spec {
  readonly template: string;
  readonly category: Category;
  readonly subcategories: readonly string[];
  readonly titles: readonly [string, string];
  readonly rulesBase: string;
  // Appended in a benign rewrite: a time and zone, a precedence sentence, a postponement clause.
  readonly rulesExtra: string;
  readonly outcomeRules: readonly [string, string];
  readonly outcomeRulesAlt: readonly [string, string];
  readonly outcomes: readonly [string, string];
  readonly sources: readonly string[];
  readonly tags: readonly string[];
  readonly expiresAtS: number;
  // Present on templates that can carry a meaning-changing rewrite.
  readonly drift?: (spec: Spec) => Spec;
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"] as const;
function human(date: Date): string {
  return `${MONTHS[date.getUTCMonth()]} ${date.getUTCDate()}, ${date.getUTCFullYear()}`;
}
function dayAfter(date: Date): Date {
  return new Date(date.getTime() + 86_400_000);
}
function expiryOf(date: Date): number {
  return Math.floor(dayAfter(date).getTime() / 1000);
}
function randomDate(rng: Rng): Date {
  return new Date(Date.UTC(2026, 10, 1) + int(rng, 0, 230) * 86_400_000);
}

const CLUBS = ["Real Madrid", "Real Sociedad", "Manchester City", "AFC Bournemouth", "Chelsea", "Arsenal", "Liverpool", "Barcelona", "Atletico Madrid", "Borussia Dortmund", "Bayern Munich", "Juventus", "Inter Milan", "Napoli", "Paris Saint-Germain", "Ajax"];
const LEAGUES: readonly (readonly [string, string, string])[] = [
  ["La Liga", "https://www.laliga.com", "https://www.espn.com/soccer"],
  ["Premier League", "https://www.premierleague.com", "https://www.bbc.com/sport/football"],
  ["Bundesliga", "https://www.bundesliga.com", "https://www.espn.com/soccer"],
  ["Serie A", "https://www.legaseriea.it", "https://www.espn.com/soccer"],
];
const FOOTBALL_SOURCES = ["https://www.fotmob.com", "https://www.skysports.com", "https://www.uefa.com", "https://www.transfermarkt.com", "https://www.whoscored.com", "https://www.sofascore.com"];
const NBA = ["Lakers", "Celtics", "Warriors", "Knicks", "Nuggets", "Bucks", "Heat", "Suns"];
const NFL = ["Chiefs", "Eagles", "Cowboys", "Packers", "Bills", "Ravens", "49ers", "Lions"];
const PLAYERS = ["Carlos Alcaraz", "Jannik Sinner", "Novak Djokovic", "Daniil Medvedev", "Iga Swiatek", "Aryna Sabalenka"];
const ASSETS: readonly (readonly [string, string])[] = [["Bitcoin", "BTC"], ["Ethereum", "ETH"], ["Solana", "SOL"]];

type Maker = (rng: Rng, date: Date, nonYesNo: boolean) => Spec;

const football: Maker = (rng, date) => {
  const [home, away] = shuffle(rng, CLUBS).slice(0, 2) as [string, string];
  const [league, primary, fallback] = pick(rng, LEAGUES);
  const n = int(rng, 8, 13);
  const when = human(date);
  return {
    template: "football",
    category: "SPORTS",
    subcategories: ["Football", league],
    titles: [`${home} vs ${away}: ${n} or more corner kicks?`, `Will ${home} and ${away} have ${n} or more corner kicks on ${when}?`],
    rulesBase:
      `This market resolves based on whether the total number of corner kicks in the ${league} match between ${home} and ${away} on ${when} is greater than or equal to ${n}. ` +
      `Extra time and penalty shootouts are excluded unless specifically stated. Primary source: the ${league} official website (${primary}). ` +
      `If the primary source is unavailable, incomplete, or inconsistent, resolution falls back to ESPN FC (${fallback}). ` +
      `If the match is abandoned before completion and official corner statistics are not published, the market voids and all positions resolve equally.`,
    rulesExtra: ` All times are UTC. The market closes at 23:59 UTC on ${when}. The primary source governs over secondary sources. If the match is postponed beyond ${human(dayAfter(dayAfter(date)))}, the market voids.`,
    outcomeRules: [
      `Resolves to Yes if the total number of corner kicks in the match is ${n} or greater according to the primary source.`,
      `Resolves to No if the total number of corner kicks in the match is ${n - 1} or fewer according to the primary source.`,
    ],
    outcomeRulesAlt: [
      `The market resolves Yes when the match has ${n} or more corner kicks according to the primary source.`,
      `The market resolves No when the match has ${n - 1} or fewer corner kicks according to the primary source.`,
    ],
    outcomes: ["Yes", "No"],
    sources: [primary, fallback, ...FOOTBALL_SOURCES],
    tags: ["Football", home, away, "Corners", league],
    expiresAtS: expiryOf(date),
  };
};

const basketball: Maker = (rng, date, nonYesNo) => {
  const [home, away] = shuffle(rng, NBA).slice(0, 2) as [string, string];
  const n = int(rng, 205, 245);
  const when = human(date);
  return {
    template: "basketball",
    category: "SPORTS",
    subcategories: ["Basketball", "NBA"],
    titles: [`${home} vs ${away}: ${n} points or more combined?`, `Will ${home} and ${away} score ${n} points or more combined on ${when}?`],
    rulesBase:
      `This market resolves based on whether the combined final score of the NBA game between the ${home} and the ${away} on ${when} is ${n} points or more, overtime included. ` +
      `Primary source: the NBA official website (https://www.nba.com). If the primary source is unavailable, incomplete, or inconsistent, resolution falls back to ESPN (https://www.espn.com/nba). ` +
      `If the game is cancelled or abandoned and no official final score is published, the market voids and all positions resolve equally.`,
    rulesExtra: ` All times are UTC. The market closes at 23:59 UTC on ${when}. The primary source governs over secondary sources. If the game is postponed beyond ${human(dayAfter(dayAfter(date)))}, the market voids.`,
    outcomeRules: [
      `Resolves to ${nonYesNo ? `${n} points or more` : "Yes"} if the combined final score, overtime included, is ${n} or more according to the primary source.`,
      `Resolves to ${nonYesNo ? `${n - 1} points or less` : "No"} if the combined final score, overtime included, is ${n - 1} or less according to the primary source.`,
    ],
    outcomeRulesAlt: [
      `The market resolves ${nonYesNo ? `${n} points or more` : "Yes"} when the combined final score, overtime included, is ${n} or more according to the primary source.`,
      `The market resolves ${nonYesNo ? `${n - 1} points or less` : "No"} when the combined final score, overtime included, is ${n - 1} or less according to the primary source.`,
    ],
    outcomes: nonYesNo ? [`${n} points or more`, `${n - 1} points or less`] : ["Yes", "No"],
    sources: ["https://www.nba.com", "https://www.espn.com/nba", "https://www.basketball-reference.com", "https://www.cbssports.com/nba"],
    tags: ["Basketball", "NBA", home, away],
    expiresAtS: expiryOf(date),
  };
};

const nfl: Maker = (rng, date) => {
  const [home, away] = shuffle(rng, NFL).slice(0, 2) as [string, string];
  const when = human(date);
  return {
    template: "nfl",
    category: "SPORTS",
    subcategories: ["American football", "NFL"],
    titles: [`Will the ${home} beat the ${away} on ${when}?`, `${home} vs ${away}: will the ${home} win on ${when}?`],
    rulesBase:
      `This market resolves Yes if the ${home} win their NFL game against the ${away} on ${when}, overtime included. Primary source: the NFL official website (https://www.nfl.com). ` +
      `If the primary source is unavailable, incomplete, or inconsistent, resolution falls back to ESPN (https://www.espn.com/nfl). A tie resolves No. If the game is cancelled and not replayed, the market voids and all positions resolve equally.`,
    rulesExtra: ` All times are UTC. The market closes at 23:59 UTC on ${when}. The primary source governs over secondary sources. If the game is rescheduled beyond ${human(dayAfter(dayAfter(date)))}, the market voids.`,
    outcomeRules: [
      `Resolves to Yes if the ${home} are credited with the win in the official final result.`,
      `Resolves to No if the ${away} win, the game ends in a tie, or the ${home} lose.`,
    ],
    outcomeRulesAlt: [
      `The market resolves Yes when the ${home} are credited with the win in the official final result.`,
      `The market resolves No when the ${away} win, the game ends in a tie, or the ${home} lose.`,
    ],
    outcomes: ["Yes", "No"],
    sources: ["https://www.nfl.com", "https://www.espn.com/nfl", "https://www.pro-football-reference.com", "https://www.cbssports.com/nfl"],
    tags: ["American football", "NFL", home, away],
    expiresAtS: expiryOf(date),
  };
};

const tennis: Maker = (rng, date) => {
  const [a, b] = shuffle(rng, PLAYERS).slice(0, 2) as [string, string];
  const when = human(date);
  return {
    template: "tennis",
    category: "SPORTS",
    subcategories: ["Tennis"],
    titles: [`Will ${a} beat ${b} on ${when}?`, `${a} vs ${b}: will ${a} win the match on ${when}?`],
    rulesBase:
      `This market resolves Yes if ${a} wins the singles match against ${b} scheduled for ${when}. Primary source: the ATP and WTA official websites (https://www.atptour.com). ` +
      `If the primary source is unavailable, incomplete, or inconsistent, resolution falls back to ESPN (https://www.espn.com/tennis). If either player withdraws before the first point, the market voids and all positions resolve equally. A retirement during the match counts as a win for the opponent.`,
    rulesExtra: ` All times are UTC. The market closes at 23:59 UTC on ${when}. The primary source governs over secondary sources. If the match is postponed beyond ${human(dayAfter(dayAfter(date)))}, the market voids.`,
    outcomeRules: [`Resolves to Yes if ${a} is credited with the win in the official result.`, `Resolves to No if ${b} is credited with the win in the official result.`],
    outcomeRulesAlt: [`The market resolves Yes when ${a} is credited with the win in the official result.`, `The market resolves No when ${b} is credited with the win in the official result.`],
    outcomes: ["Yes", "No"],
    sources: ["https://www.atptour.com", "https://www.espn.com/tennis", "https://www.wtatennis.com", "https://www.tennisabstract.com"],
    tags: ["Tennis", a, b],
    expiresAtS: expiryOf(date),
  };
};

const cryptoPrice: Maker = (rng, date) => {
  const [asset, ticker] = pick(rng, ASSETS);
  const price = ticker === "BTC" ? int(rng, 90, 160) * 1000 : ticker === "ETH" ? int(rng, 3, 9) * 1000 + 500 : int(rng, 150, 400);
  const written = price.toLocaleString("en-US");
  const when = human(date);
  return {
    template: "crypto_price",
    category: "CRYPTO",
    subcategories: [asset],
    titles: [`Will ${asset} close above $${written} on ${when}?`, `Will the ${asset} (${ticker}) daily close on ${when} be above $${written}?`],
    rulesBase:
      `This market resolves Yes if the Binance ${ticker}USDT daily candle that closes on ${when} has a closing price above ${written} USD. Futures mark prices do not count; only spot prices apply. ` +
      `Primary source: Binance (https://www.binance.com). If the primary source is unavailable, incomplete, or inconsistent, resolution falls back to CoinGecko (https://www.coingecko.com). ` +
      `If the ${ticker}USDT pair is delisted before the close, the market voids and all positions resolve equally.`,
    rulesExtra: ` All times are UTC. The candle closes at 23:59 UTC on ${when}. The primary source governs over secondary sources. Only the first published value counts.`,
    outcomeRules: [`Resolves to Yes if the closing price is above ${written} USD according to the primary source.`, `Resolves to No if the closing price is below ${written} USD or equal to it according to the primary source.`],
    outcomeRulesAlt: [`The market resolves Yes when the closing price is above ${written} USD according to the primary source.`, `The market resolves No when the closing price is below ${written} USD or equal to it according to the primary source.`],
    outcomes: ["Yes", "No"],
    sources: ["https://www.binance.com", "https://www.coingecko.com", "https://www.coinmarketcap.com", "https://www.tradingview.com", "https://www.coinbase.com", "https://www.kraken.com"],
    tags: [asset, ticker, "Price", "Crypto"],
    expiresAtS: expiryOf(date),
  };
};

// The finance template carries the "3 percent became 5 percent" rewrite.
const indexClose: Maker = (_rng, date) => {
  const when = human(date);
  const make = (percent: string, level: string): Spec => ({
    template: "index_close",
    category: "FINANCE",
    subcategories: ["Indices"],
    titles: [`Will the S&P 500 close down ${percent} or more on ${when}?`, `Will the S&P 500 fall ${percent} or more on ${when}?`],
    rulesBase:
      `This market resolves Yes if the S&P 500 index closes down ${percent} or more on ${when} compared with the prior trading day's official close of ${level}. ` +
      `Primary source: S&P Dow Jones Indices (https://www.spglobal.com). If the primary source is unavailable, incomplete, or inconsistent, resolution falls back to Yahoo Finance (https://finance.yahoo.com). ` +
      `If the exchange is closed on ${when}, the market voids and all positions resolve equally.`,
    rulesExtra: ` All times are UTC. The close is the official 16:00 ET close on ${when}. The primary source governs over secondary sources.`,
    outcomeRules: [`Resolves to Yes if the index closes down ${percent} or more from ${level}.`, `Resolves to No if the index closes down less than ${percent} from ${level}.`],
    outcomeRulesAlt: [`The market resolves Yes when the index closes down ${percent} or more from ${level}.`, `The market resolves No when the index closes down less than ${percent} from ${level}.`],
    outcomes: ["Yes", "No"],
    sources: ["https://www.spglobal.com", "https://finance.yahoo.com", "https://www.marketwatch.com", "https://www.wsj.com"],
    tags: ["S&P 500", "Stocks", "Index"],
    expiresAtS: expiryOf(date),
  });
  const base = make("3%", "7,429.65");
  return {
    ...base,
    drift: () => make("5%", "7,276.46"),
  };
};

// The politics template carries the "fixed date replaced by an event" rewrite. The date lives in the rules
// text only (the title and the outcome rules do not state it), so the rewrite can remove every trace of it.
const officialAction: Maker = (rng, date) => {
  const actor = pick(rng, ["the European Commission", "the Federal Reserve", "the United Nations Security Council", "the Bank of England"]);
  const action = pick(rng, ["publish a formal statement on maritime security", "announce a policy rate decision", "adopt a resolution on shipping lanes"]);
  const when = human(date);
  const make = (clause: string): Spec => ({
    template: "official_action",
    category: "POLITICS",
    subcategories: ["Geopolitics"],
    titles: [`Will ${actor} officially ${action}?`, `Will ${actor} formally ${action}?`],
    rulesBase:
      `This market resolves Yes only if ${actor} officially ${action} ${clause}. Social media posts, informal rhetoric and anonymous briefings do not count. ` +
      `Primary source: the official publications of ${actor} (https://www.europa.eu). If the primary source is unavailable, incomplete, or inconsistent, resolution falls back to Reuters (https://www.reuters.com) quoting the official text. ` +
      `If the event is cancelled, the market resolves No.`,
    rulesExtra: ` The primary source governs over secondary sources. Wire reports that do not quote the official text are not sufficient.`,
    outcomeRules: [`Resolves to Yes if ${actor} officially acts as described in the market rules, according to the primary source.`, `Resolves to No if it does not act as described in the market rules.`],
    outcomeRulesAlt: [`The market resolves Yes when ${actor} officially acts as described in the market rules, according to the primary source.`, `The market resolves No when it does not act as described in the market rules.`],
    outcomes: ["Yes", "No"],
    sources: ["https://www.europa.eu", "https://www.reuters.com", "https://www.apnews.com"],
    tags: ["Politics", "Geopolitics", "Policy"],
    expiresAtS: expiryOf(date),
  });
  const base = make(`by ${when}`);
  return { ...base, drift: () => make("before the end of the next scheduled summit") };
};

const techRelease: Maker = (rng, date) => {
  const [company, product] = pick(rng, [["Apple", "the next iPhone"], ["Nintendo", "its next home console"], ["OpenAI", "a new flagship model"], ["Tesla", "the refreshed Model Y"]] as const);
  const when = human(date);
  return {
    template: "tech_release",
    category: "TECH",
    subcategories: ["Consumer technology"],
    titles: [`Will ${company} release ${product} by ${when}?`, `Will ${company} publicly launch ${product} by ${when}?`],
    rulesBase:
      `This market resolves Yes if ${company} makes ${product} generally available to the public by ${when}. Announcements, pre-orders and invite-only previews do not count. ` +
      `Primary source: the ${company} newsroom (https://www.apple.com). If the primary source is unavailable, incomplete, or inconsistent, resolution falls back to The Verge (https://www.theverge.com). If ${company} cancels the product, the market resolves No.`,
    rulesExtra: ` All times are UTC. The deadline is 23:59 UTC on ${when}. The primary source governs over secondary sources.`,
    outcomeRules: [`Resolves to Yes if the product is generally available by the deadline.`, `Resolves to No if the product is not generally available by the deadline.`],
    outcomeRulesAlt: [`The market resolves Yes when the product is generally available by the deadline.`, `The market resolves No when the product is not generally available by the deadline.`],
    outcomes: ["Yes", "No"],
    sources: ["https://www.apple.com", "https://www.theverge.com", "https://www.techcrunch.com"],
    tags: ["Technology", company, "Release"],
    expiresAtS: expiryOf(date),
  };
};

const cultureAward: Maker = (rng, date) => {
  const film = pick(rng, ["The Long Harbor", "Glass Orchard", "Winter Meridian", "Paper Lanterns"]);
  const n = int(rng, 40, 120);
  const when = human(date);
  return {
    template: "culture_box_office",
    category: "CULTURE",
    subcategories: ["Film"],
    titles: [`Will ${film} gross over $${n} million on its opening weekend?`, `Will the opening weekend gross of ${film} exceed $${n} million?`],
    rulesBase:
      `This market resolves Yes if the domestic opening weekend gross of ${film}, with the weekend ending ${when}, is over ${n} million USD in the first published estimate. ` +
      `Primary source: Box Office Mojo (https://www.boxofficemojo.com). If the primary source is unavailable, incomplete, or inconsistent, resolution falls back to The Numbers (https://www.the-numbers.com). If the release is postponed, the market voids and all positions resolve equally.`,
    rulesExtra: ` All times are UTC. Estimates published up to 23:59 UTC on ${when} count. The primary source governs over secondary sources.`,
    outcomeRules: [`Resolves to Yes if the first published estimate is over ${n} million USD.`, `Resolves to No if the first published estimate is ${n} million USD or less.`],
    outcomeRulesAlt: [`The market resolves Yes when the first published estimate is over ${n} million USD.`, `The market resolves No when the first published estimate is ${n} million USD or less.`],
    outcomes: ["Yes", "No"],
    sources: ["https://www.boxofficemojo.com", "https://www.the-numbers.com", "https://www.deadline.com"],
    tags: ["Film", "Box office", film],
    expiresAtS: expiryOf(date),
  };
};

const MAKERS: Readonly<Record<Category, readonly Maker[]>> = {
  SPORTS: [football, nfl, tennis, basketball],
  CRYPTO: [cryptoPrice],
  POLITICS: [officialAction],
  FINANCE: [indexClose],
  TECH: [techRelease],
  CULTURE: [cultureAward],
};

// ---- assembling files -------------------------------------------------------------------------------------------------

const GCS_IMAGE = "https://storage.googleapis.com/market-image-mainnet/compressed/";
const S3_IMAGE = "https://market-images-623756711122.s3.eu-west-1.amazonaws.com/compressed/";

// Exactly `target` characters, ending with a full stop.
function pad(text: string, target: number, filler: string): string {
  let out = text;
  while (out.length < target) out += filler;
  return `${out.slice(0, target - 1)}.`;
}

interface Build {
  readonly spec: Spec;
  readonly titleIndex: 0 | 1;
  readonly descriptionEqualsTitle: boolean;
  readonly tagCount: number;
  readonly sourceCount: number;
  readonly s3: boolean;
  readonly image: string;
}

function render(build: Build, overrides: Partial<MetadataJson> = {}): MetadataJson {
  const { spec } = build;
  const title = spec.titles[build.titleIndex];
  const baseTags = [...spec.tags, "Prediction", "Market", "Outcome", "Resolution", "Event", "Odds"];
  const tags = build.tagCount <= baseTags.length ? baseTags.slice(0, build.tagCount) : [...baseTags, ...Array.from({ length: build.tagCount - baseTags.length }, (_, index) => `tag${index}`)];
  const sources = spec.sources.slice(0, Math.min(build.sourceCount, spec.sources.length));
  while (sources.length < build.sourceCount) sources.push(`https://www.source${sources.length}.org`);
  return {
    title,
    description: build.descriptionEqualsTitle ? title : `A binary market: ${title}`,
    category: spec.category,
    tags,
    subcategories: spec.subcategories,
    image_url: `${build.s3 ? S3_IMAGE : GCS_IMAGE}${build.image}.webp`,
    rules: {
      description: spec.rulesBase,
      outcomeRules: [
        { outcomeIndex: 0, rule: spec.outcomeRules[0] },
        { outcomeIndex: 1, rule: spec.outcomeRules[1] },
      ],
    },
    resolution_sources: sources,
    outcomes: [
      { id: 0, title: spec.outcomes[0] },
      { id: 1, title: spec.outcomes[1] },
    ],
    ...overrides,
  };
}

export interface CorpusPair {
  readonly index: number;
  readonly original: MetadataJson;
  readonly suggested: MetadataJson;
  readonly currentExpiresAtS: number;
  readonly suggestedExpiresAtS: number;
  readonly fields: readonly string[];
  readonly expected: { readonly verdict: "pass" | "flagged"; readonly codes: readonly string[] };
}

export interface Corpus {
  readonly originals: readonly MetadataJson[];
  readonly suggestions: readonly MetadataJson[];
  readonly all: readonly MetadataJson[];
  readonly pairs: readonly CorpusPair[];
  readonly originalExpiries: readonly number[];
}

// Which pair slots hold the meaning-changing rewrites. Not recorded by the researcher: the first slot that
// changed both title and rules text carries the number rewrite, the first other slot that changed the rules
// text carries the date rewrite.
export function driftSlots(pairs: readonly PairRecord[]): { readonly numbers: number; readonly dates: number } {
  const numbers = pairs.findIndex((pair) => pair.fields.includes("title") && pair.fields.includes("rules.description"));
  const dates = pairs.findIndex((pair, index) => index !== numbers && pair.fields.includes("rules.description") && !pair.fields.includes("title"));
  return { numbers, dates };
}

export const EXACT_SHORT_RULES = "Resolves Yes if the home side wins it.";
export const SHORT_OUTCOME_RULE = "Yes if won";

export function buildCorpus(): Corpus {
  const rng = seededRandom(CORPUS_SEED);
  const summary = readJson<SchemaSummary>("schema_summary.json");
  const records = readJson<PairRecord[]>("pairs_detail.json");
  const slots = driftSlots(records);
  const categoryChange = records.findIndex((pair) => pair.fields.includes("category"));
  const outcomesChange = records.findIndex((pair) => pair.fields.includes("outcomes"));

  // --- categories of the 38 pair originals and the 62 other originals ---
  const slotCategory = new Map<number, Category>([
    [slots.numbers, "FINANCE"],
    [slots.dates, "POLITICS"],
    [categoryChange, "CRYPTO"],
    [outcomesChange, "SPORTS"],
  ]);
  const rest: Category[] = shuffle(rng, [
    ...Array<Category>(18).fill("SPORTS"), // 19 sports in all, one is the outcomes slot
    ...Array<Category>(10).fill("CRYPTO"), // 11 in all, one is the category slot
    ...Array<Category>(2).fill("POLITICS"), // 3 in all
    ...Array<Category>(1).fill("FINANCE"), // 2 in all
    ...Array<Category>(2).fill("TECH"),
    ...Array<Category>(1).fill("CULTURE"),
  ]);
  const otherCategories: Category[] = shuffle(rng, [
    ...Array<Category>(35).fill("SPORTS"),
    ...Array<Category>(18).fill("CRYPTO"),
    ...Array<Category>(3).fill("POLITICS"),
    ...Array<Category>(3).fill("FINANCE"),
    ...Array<Category>(1).fill("TECH"),
    ...Array<Category>(2).fill("CULTURE"),
  ]);

  // --- attribute multisets over the 100 originals ---
  const tagCounts = shuffle(
    rng,
    Object.entries(summary.tags_count_original).flatMap(([count, times]) => Array<number>(times).fill(Number(count))),
  );
  // Source counts: the pairs have their recorded before/after; the 62 others take what is left of the totals.
  const sourceLeft = new Map<number, number>(Object.entries(summary.resolution_sources_count).map(([count, times]) => [Number(count), times]));
  for (const pair of records) {
    sourceLeft.set(pair.src_before, (sourceLeft.get(pair.src_before) ?? 0) - 1);
    sourceLeft.set(pair.src_after, (sourceLeft.get(pair.src_after) ?? 0) - 1);
  }
  const otherSources = shuffle(rng, [...sourceLeft.entries()].flatMap(([count, times]) => Array<number>(Math.max(times, 0)).fill(count)));
  // Subcategory counts: total 0: 1, 1: 97, 2: 40.
  // Pairs: 14 with two (their suggestion keeps the count), 24 with one; the 62 others: 1 with none, 12 with two, 49 with one.
  const pairTwoSubs = new Set(shuffle(rng, records.map((_, index) => index)).slice(0, 14));

  // --- build the 38 pair originals ---
  const pairSpecs: Spec[] = [];
  const pairBuilds: Build[] = [];
  let restIndex = 0;
  const specsForPairs: Category[] = records.map((_, index) => {
    const forced = slotCategory.get(index);
    if (forced !== undefined) return forced;
    const next = rest[restIndex];
    restIndex += 1;
    return next as Category;
  });
  // Four pair originals are non-Yes/No: the one whose outcomes the oracle changed, and three more sports slots.
  const nonYesNoSlots = new Set<number>([
    outcomesChange,
    ...shuffle(rng, records.map((_, index) => index).filter((index) => specsForPairs[index] === "SPORTS" && index !== outcomesChange)).slice(0, 3),
  ]);

  records.forEach((record, index) => {
    const category = specsForPairs[index] as Category;
    const date = randomDate(rng);
    const nonYesNo = nonYesNoSlots.has(index);
    const makers = MAKERS[category];
    const maker = nonYesNo ? basketball : category === "SPORTS" ? pick(rng, MAKERS.SPORTS.filter((entry) => entry !== basketball)) : (pick(rng, makers) as Maker);
    const spec = maker(rng, date, nonYesNo);
    pairSpecs.push(spec);
    pairBuilds.push({
      spec,
      titleIndex: 0,
      descriptionEqualsTitle: index % 2 === 0,
      tagCount: tagCounts.pop() ?? 4,
      sourceCount: record.src_before,
      s3: index % 6 === 0 && index < 36,
      image: uuid(rng),
    });
  });

  // --- the 62 other originals ---
  const others: { readonly spec: Spec; readonly build: Build }[] = [];
  const otherNonYesNo = 20;
  let sportsSeen = 0;
  otherCategories.forEach((category, index) => {
    const date = randomDate(rng);
    const nonYesNo = category === "SPORTS" && sportsSeen < otherNonYesNo;
    if (category === "SPORTS") sportsSeen += 1;
    const maker = nonYesNo ? basketball : category === "SPORTS" ? pick(rng, MAKERS.SPORTS.filter((entry) => entry !== basketball)) : (pick(rng, MAKERS[category]) as Maker);
    const spec = maker(rng, date, nonYesNo);
    others.push({
      spec,
      build: {
        spec,
        titleIndex: 0,
        descriptionEqualsTitle: false,
        tagCount: tagCounts.pop() ?? 4,
        sourceCount: otherSources.pop() ?? 2,
        s3: index < 15,
        image: uuid(rng),
      },
    });
  });

  // --- pairs ---
  const pairs: CorpusPair[] = [];
  const suggestions: MetadataJson[] = [];
  const originalExpiries: number[] = [];
  const pairOriginals: MetadataJson[] = [];
  records.forEach((record, index) => {
    const build = pairBuilds[index] as Build;
    const spec = build.spec;
    const wantTwo = pairTwoSubs.has(index);
    const original = render(build, { subcategories: wantTwo ? [...spec.subcategories, "Featured"].slice(0, 2) : spec.subcategories.slice(0, 1) });
    pairOriginals.push(original);
    originalExpiries.push(spec.expiresAtS);

    // The suggested version starts as a copy and takes exactly the recorded field changes.
    let suggested: MetadataJson = { ...original, tags: [], image_url: original.image_url };
    const changed = new Set(record.fields);
    const expectedCodes: string[] = [];
    let drifted: Spec | null = null;
    if (index === slots.numbers || index === slots.dates) {
      drifted = (spec.drift as (value: Spec) => Spec)(spec);
    }
    let rulesText = original.rules.description;
    if (changed.has("rules.description")) {
      rulesText = drifted === null ? `${spec.rulesBase}${spec.rulesExtra}` : `${drifted.rulesBase}${drifted.rulesExtra}`;
      if (index === slots.numbers) expectedCodes.push("numbers_changed");
      if (index === slots.dates) expectedCodes.push("dates_changed");
    }
    const useSpec = drifted ?? spec;
    const title = changed.has("title") ? useSpec.titles[1] : original.title;
    // A drifted file also carries the new title in its description, so no trace of the old figure is left.
    const reworded = useSpec.titles[1];
    const description = changed.has("description") || (drifted !== null && index === slots.numbers) ? (original.description === original.title ? reworded : `A binary market: ${reworded}`) : original.description;
    const outcomeRules = changed.has("rules.outcomeRules") ? useSpec.outcomeRulesAlt : useSpec.outcomeRules;
    let sources = [...original.resolution_sources];
    if (changed.has("resolution_sources") || record.src_before !== record.src_after) {
      const extra = ["https://www.reuters.com", "https://www.apnews.com", "https://www.bloomberg.com", "https://www.bbc.com", "https://www.ft.com"].filter((url) => !sources.includes(url));
      if (record.src_after < sources.length) sources = sources.slice(0, record.src_after);
      else {
        let step = 0;
        while (sources.length < record.src_after) {
          sources.push(extra[step] as string);
          step += 1;
        }
      }
      if (record.src_after === record.src_before && extra.length > 0) sources = [...sources.slice(0, -1), extra[0] as string];
    }
    let outcomes = original.outcomes;
    if (changed.has("outcomes")) {
      outcomes = [
        { id: 0, title: "Yes" },
        { id: 1, title: "No" },
      ];
      expectedCodes.push("outcomes_changed");
    }
    let category = original.category;
    if (changed.has("category")) category = "FINANCE";
    let subcategories = original.subcategories;
    if (changed.has("subcategories")) subcategories = original.subcategories.length === 1 ? ["Daily"] : [original.subcategories[0] as string, "Daily"];
    suggested = {
      ...suggested,
      title,
      description,
      category,
      subcategories,
      rules: {
        description: rulesText,
        outcomeRules: [
          { outcomeIndex: 0, rule: outcomeRules[0] },
          { outcomeIndex: 1, rule: outcomeRules[1] },
        ],
      },
      resolution_sources: sources,
      outcomes,
    };
    suggestions.push(suggested);

    const currentExpiresAtS = spec.expiresAtS;
    const suggestedExpiresAtS = record.exp_changed ? currentExpiresAtS + Math.round(record.sugg_exp_minus_orig_days * 86_400) : currentExpiresAtS;
    if (record.exp_changed) {
      expectedCodes.push("expiry_changed", record.sugg_exp_minus_orig_days < 0 ? "expiry_earlier_than_intent" : "expiry_later_than_intent");
    }
    pairs.push({
      index,
      original,
      suggested,
      currentExpiresAtS,
      suggestedExpiresAtS,
      fields: record.fields,
      expected: { verdict: expectedCodes.length > 0 ? "flagged" : "pass", codes: expectedCodes },
    });
  });

  // --- the other originals, with the title/description balance solved ---
  const equalPairs = [...pairOriginals, ...suggestions].filter((file) => file.title === file.description).length;
  const equalOthers = summary.title_equals_description - equalPairs;
  const otherSubs = shuffle(rng, [0, ...Array<number>(12).fill(2), ...Array<number>(49).fill(1)]);
  const otherFiles = others.map((entry, index) => {
    const wantEqual = index < equalOthers;
    const count = otherSubs[index] as number;
    const subs = count === 0 ? [] : count === 1 ? entry.spec.subcategories.slice(0, 1) : [...entry.spec.subcategories, "Featured"].slice(0, 2);
    const file = render({ ...entry.build, descriptionEqualsTitle: wantEqual }, { subcategories: subs });
    originalExpiries.push(entry.spec.expiresAtS);
    return file;
  });

  // The two length outliers of the recorded rules lengths (38 and 2616 characters) and the outcome-rule extremes.
  const files = [...pairOriginals, ...otherFiles];
  const shortIndex = pairOriginals.length + 0;
  const longIndex = pairOriginals.length + 1;
  const tiny: MetadataJson = {
    ...(files[shortIndex] as MetadataJson),
    rules: {
      description: EXACT_SHORT_RULES,
      outcomeRules: [
        { outcomeIndex: 0, rule: SHORT_OUTCOME_RULE },
        { outcomeIndex: 1, rule: (files[shortIndex] as MetadataJson).rules.outcomeRules[1]?.rule ?? "Resolves to No otherwise." },
      ],
    },
  };
  const hugeBase = (files[longIndex] as MetadataJson);
  const huge: MetadataJson = {
    ...hugeBase,
    rules: {
      description: pad(hugeBase.rules.description + hugeBase.rules.description.replace(/^This market resolves/, " The market also resolves"), summary.rules_description_chars_original.max, " The primary source governs over secondary sources, and the first published figure counts."),
      outcomeRules: [
        { outcomeIndex: 0, rule: pad(hugeBase.rules.outcomeRules[0]?.rule ?? "", 414, " The primary source governs over secondary sources.") },
        { outcomeIndex: 1, rule: hugeBase.rules.outcomeRules[1]?.rule ?? "Resolves to No otherwise." },
      ],
    },
  };
  files[shortIndex] = tiny;
  files[longIndex] = huge;
  const originals = files;
  return { originals, suggestions, all: [...originals, ...suggestions], pairs, originalExpiries };
}
