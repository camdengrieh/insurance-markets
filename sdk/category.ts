// One fixed category taxonomy for every venue (docs/aggregation-design.md section 2.6). Pure and offline: no
// I/O, no clock, no imports. The same file is mirrored byte for byte at app/src/core/category.ts (the app's
// boundary check forbids importing pm/ from the bundle); app/src/core/category.test.ts fails when the two drift.
//
// How a market gets a category, in order, first hit wins:
//   1. each venue-native string (XO categoryPath names and slugs, Limitless categories and tags, Polymarket
//      series / event / market slug tokens) is normalised and looked up, exactly, in the venue's table and then
//      in the common table (confidence "native");
//   2. the tokens of each native string are looked up in the keyword table (still "native": the evidence is
//      the venue's own taxonomy, matched word by word);
//   3. the tokens of the title are looked up in the keyword table (confidence "keyword");
//   4. nothing matched: "other" with confidence "none".
// The input strings are untrusted third-party text. They are matched deterministically against the tables
// below and never echoed: `matched` names table entries, which are our own strings. No model is ever asked.
//
// Normalisation: NFKD, combining marks dropped (so diacritics do not matter), lower case, every run of
// characters outside [a-z0-9] collapsed to one space. "S&P 500" is "s p 500"; "5m Up/Down" is "5m up down".

export const CATEGORIES = ["politics", "crypto", "sports", "economics", "science_tech", "culture", "world", "weather", "other"] as const;
export type Category = (typeof CATEGORIES)[number];

export interface CategoryInput {
  readonly venue: string;
  // Venue-native category, tag or series strings, already extracted, untrusted.
  readonly native: readonly string[];
  // Untrusted, used only for a last-resort keyword match.
  readonly title?: string;
}

export interface CategoryVerdict {
  readonly category: Category;
  readonly confidence: "native" | "keyword" | "none";
  // Which fixed table entries matched; never echoes untrusted text.
  readonly matched: readonly string[];
}

// Sentence-case words for the UI.
export const CATEGORY_LABEL: Readonly<Record<Category, string>> = Object.freeze({
  politics: "Politics",
  crypto: "Crypto",
  sports: "Sports",
  economics: "Economics",
  science_tech: "Science and tech",
  culture: "Culture",
  world: "World",
  weather: "Weather",
  other: "Other",
});

export const NO_CATEGORY: CategoryVerdict = Object.freeze({ category: "other", confidence: "none", matched: Object.freeze([]) as readonly string[] });

export function isCategory(value: unknown): value is Category {
  return typeof value === "string" && (CATEGORIES as readonly string[]).includes(value);
}

// Longest input looked at; the rest of an over-long string is ignored, never read.
const MAX_INPUT_CHARS = 400;
const MAX_NATIVE_STRINGS = 40;
const MAX_PHRASE_WORDS = 4;

export function normaliseCategoryText(text: string): string {
  return text
    .slice(0, MAX_INPUT_CHARS)
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

// ---- the native tables: exact matches of a venue's own category, tag or series name -----------------------------
//
// Keys are normalised strings (see normaliseCategoryText). "common" applies to every venue after its own table.
// XO: the roots and children seen in the captured lists (sdk/venues/xo/fixtures): TECH, PULSE,
// CULTURE, SPORTS, FINANCE, CRYPTO, POLITICS and their children. PULSE is XO's short-horizon price-cycle family
// (the docs' example and every captured row is a BTC window), so it reads as crypto.
// Limitless: the captured active list (sdk/venues/limitless/fixtures) carries "Minutely", "5 min", "15 min",
// "Crypto", "Bitcoin", "Ethereum" as categories and "Lumy", "Recurring", "Minutes 5", "Minutes 15" as tags. The
// minute-window categories and the "Lumy" family are the venue's automated crypto price markets.
// Polymarket: no category field reaches the read adapters (Gamma /markets carries series and event slugs, not
// tags), so its native strings are matched by their tokens in the keyword table; its table is empty on purpose.

type NativeTable = Readonly<Record<string, Category>>;

const COMMON_NATIVE: NativeTable = Object.freeze({
  politics: "politics",
  political: "politics",
  election: "politics",
  elections: "politics",
  "us politics": "politics",
  government: "politics",
  crypto: "crypto",
  cryptocurrency: "crypto",
  cryptocurrencies: "crypto",
  "crypto prices": "crypto",
  bitcoin: "crypto",
  btc: "crypto",
  ethereum: "crypto",
  eth: "crypto",
  solana: "crypto",
  sol: "crypto",
  memecoin: "crypto",
  memecoins: "crypto",
  altcoins: "crypto",
  defi: "crypto",
  nft: "crypto",
  nfts: "crypto",
  stablecoins: "crypto",
  sports: "sports",
  sport: "sports",
  esports: "sports",
  "e sports": "sports",
  football: "sports",
  soccer: "sports",
  "american football": "sports",
  nfl: "sports",
  nba: "sports",
  mlb: "sports",
  nhl: "sports",
  mls: "sports",
  mma: "sports",
  ufc: "sports",
  tennis: "sports",
  golf: "sports",
  cricket: "sports",
  basketball: "sports",
  baseball: "sports",
  hockey: "sports",
  boxing: "sports",
  f1: "sports",
  "formula 1": "sports",
  "premier league": "sports",
  "champions league": "sports",
  cs2: "sports",
  "counter strike": "sports",
  "dota 2": "sports",
  "league of legends": "sports",
  valorant: "sports",
  olympics: "sports",
  "world cup": "sports",
  economics: "economics",
  economy: "economics",
  finance: "economics",
  financial: "economics",
  business: "economics",
  markets: "economics",
  stocks: "economics",
  "stock market": "economics",
  macro: "economics",
  macroeconomics: "economics",
  fed: "economics",
  "interest rates": "economics",
  inflation: "economics",
  commodities: "economics",
  companies: "economics",
  earnings: "economics",
  science: "science_tech",
  tech: "science_tech",
  technology: "science_tech",
  "science tech": "science_tech",
  "science and tech": "science_tech",
  "science and technology": "science_tech",
  ai: "science_tech",
  "artificial intelligence": "science_tech",
  space: "science_tech",
  health: "science_tech",
  medicine: "science_tech",
  culture: "culture",
  "pop culture": "culture",
  entertainment: "culture",
  movies: "culture",
  film: "culture",
  films: "culture",
  music: "culture",
  tv: "culture",
  television: "culture",
  celebrities: "culture",
  gaming: "culture",
  "video games": "culture",
  awards: "culture",
  art: "culture",
  fashion: "culture",
  books: "culture",
  media: "culture",
  world: "world",
  geopolitics: "world",
  international: "world",
  global: "world",
  "world affairs": "world",
  conflict: "world",
  war: "world",
  "middle east": "world",
  europe: "world",
  asia: "world",
  africa: "world",
  americas: "world",
  weather: "weather",
  climate: "weather",
  temperature: "weather",
  hurricanes: "weather",
  "natural disasters": "weather",
  other: "other",
  misc: "other",
  miscellaneous: "other",
  general: "other",
});

const XO_NATIVE: NativeTable = Object.freeze({
  pulse: "crypto",
  "5m up down": "crypto",
  "15m up down": "crypto",
  "1h up down": "crypto",
});

const LIMITLESS_NATIVE: NativeTable = Object.freeze({
  minutely: "crypto",
  "1 min": "crypto",
  "5 min": "crypto",
  "15 min": "crypto",
  "30 min": "crypto",
  hourly: "crypto",
  "minutes 1": "crypto",
  "minutes 5": "crypto",
  "minutes 15": "crypto",
  "minutes 30": "crypto",
  lumy: "crypto",
});

const POLYMARKET_NATIVE: NativeTable = Object.freeze({});

export const NATIVE_TABLES: Readonly<Record<string, NativeTable>> = Object.freeze({
  common: COMMON_NATIVE,
  xo: XO_NATIVE,
  limitless: LIMITLESS_NATIVE,
  polymarket: POLYMARKET_NATIVE,
});

// ---- the keyword table: phrases of one to four words, matched against the tokens of a native string or a title --
//
// Conservative on purpose: a phrase is here only when it names the category on its own. No person's name is in
// this table, and no venue's name. Longer phrases are tried before shorter ones at each position.

const KEYWORD_PHRASES: Readonly<Record<Category, readonly string[]>> = Object.freeze({
  politics: [
    "politics", "political", "election", "elections", "electoral", "president", "presidential", "presidency", "nominee", "nomination", "nominations",
    "democrat", "democratic", "democrats", "republican", "republicans", "gop", "senate", "senator", "congress", "congressional",
    "parliament", "parliamentary", "governor", "gubernatorial", "mayor", "mayoral", "ballot", "referendum", "legislation",
    "impeach", "impeachment", "cabinet", "prime minister", "midterm", "midterms", "white house", "supreme court", "scotus",
    "veto", "coalition", "chancellor", "executive order", "government shutdown", "polls", "approval rating", "candidate",
    "candidates", "political party", "lawmakers", "legislature", "filibuster", "speaker of the house",
  ],
  crypto: [
    "crypto", "cryptocurrency", "cryptocurrencies", "bitcoin", "btc", "ethereum", "eth", "solana", "sol", "memecoin", "memecoins",
    "altcoin", "altcoins", "stablecoin", "stablecoins", "defi", "nft", "nfts", "token", "tokens", "airdrop", "blockchain",
    "dogecoin", "doge", "xrp", "bnb", "halving", "usdc", "usdt", "up or down", "market cap", "onchain", "on chain", "layer 2",
    "mainnet", "testnet", "staking", "validator", "validators", "wallet", "exchange hack", "etf approval",
  ],
  sports: [
    "sports", "nfl", "nba", "mlb", "nhl", "mls", "ufc", "mma", "f1", "formula 1", "formula one", "premier league", "champions league",
    "la liga", "bundesliga", "serie a", "ligue 1", "fifa", "world cup", "olympics", "olympic", "super bowl", "superbowl",
    "playoff", "playoffs", "tennis", "wimbledon", "us open", "golf", "pga", "cricket", "ipl", "rugby", "boxing", "esports",
    "cs2", "csgo", "counter strike", "dota", "league of legends", "valorant", "nascar", "grand prix", "touchdown", "touchdowns",
    "xg", "matchweek", "matchday", "total points", "football", "soccer", "basketball", "baseball", "hockey", "cycling",
    "tour de france", "marathon", "ncaa", "march madness", "heisman", "stanley cup", "world series", "ballon d or",
    "outscore", "clean sheet", "hat trick", "home run", "home runs", "title fight", "championship", "medal", "medals",
  ],
  economics: [
    "economics", "economy", "finance", "financial", "fed", "federal reserve", "fomc", "interest rate", "interest rates", "rate cut", "rate hike", "inflation", "cpi", "gdp",
    "recession", "unemployment", "jobs report", "payrolls", "nonfarm", "tariff", "tariffs", "stock market", "s p 500",
    "sp500", "nasdaq", "dow jones", "market capitalization", "largest company", "ecb", "boe", "bank of england", "boj",
    "treasury", "treasury yield", "earnings", "ipo", "stocks", "oil price", "oil prices", "brent", "wti", "crude oil",
    "gold price", "housing prices", "mortgage rates", "debt ceiling", "bankruptcy", "layoffs", "minimum wage",
  ],
  science_tech: [
    "science", "technology", "ai", "artificial intelligence", "gpt", "chatgpt", "llm", "agi", "nasa", "space launch", "starship", "rocket", "rocket launch",
    "satellite", "mars", "lunar", "asteroid", "quantum", "nuclear fusion", "vaccine", "fda", "fda approval", "clinical trial",
    "pandemic", "iphone", "self driving", "robotaxi", "humanoid robot", "robot", "robotics", "nobel prize", "nobel",
    "semiconductor", "data center", "data centers", "flying car", "spacecraft", "space station", "telescope", "genome",
    "outbreak", "epidemic", "who declares",
  ],
  culture: [
    "culture", "entertainment", "oscar", "oscars", "academy award", "academy awards", "grammy", "grammys", "emmy", "emmys", "golden globe", "golden globes",
    "box office", "rotten tomatoes", "movie", "movies", "film", "films", "netflix", "album", "albums", "billboard", "hot 100",
    "spotify", "eurovision", "person of the year", "celebrity", "youtube", "youtuber", "streamer", "twitch", "video game",
    "game of the year", "grand theft auto", "nintendo", "playstation", "xbox", "met gala", "fashion", "miss universe",
    "tv series", "season finale", "anime", "best picture", "best actor", "best actress", "song of the year", "album of the year",
    "record of the year", "trailer", "sequel", "casting", "concert", "tour dates", "reality show", "bestseller",
  ],
  world: [
    "geopolitics", "war", "ceasefire", "cease fire", "invasion", "invade", "invades", "nato", "united nations", "security council", "sanctions",
    "peace deal", "peace talks", "treaty", "missile", "missiles", "nuclear test", "airstrike", "airstrikes", "troops", "military",
    "hostage", "hostages", "refugee", "refugees", "humanitarian", "coup", "martial law", "embassy", "g7", "g20", "brics", "summit",
    "european union", "eu", "pope", "vatican", "conclave", "border dispute", "territorial", "annex", "annexation", "diplomatic",
    "diplomacy", "ambassador", "extradition", "asylum",
  ],
  weather: [
    "hurricane", "hurricanes", "tornado", "tornadoes", "typhoon", "cyclone", "storm", "snowfall", "snow", "rainfall", "temperature",
    "high temperature", "low temperature", "heatwave", "heat wave", "degrees", "fahrenheit", "celsius", "wildfire", "wildfires",
    "flood", "flooding", "drought", "el nino", "la nina", "climate", "hottest", "coldest", "weather", "rain", "blizzard",
    "frost", "humidity", "wind speed", "monsoon", "precipitation",
  ],
  other: [],
});

function buildKeywordTable(): Readonly<Record<string, Category>> {
  const table: Record<string, Category> = {};
  for (const category of CATEGORIES) {
    for (const phrase of KEYWORD_PHRASES[category]) {
      const key = normaliseCategoryText(phrase);
      if (key === "" || key !== phrase) throw new Error(`keyword table: "${phrase}" is not in normalised form`);
      if (key.split(" ").length > MAX_PHRASE_WORDS) throw new Error(`keyword table: "${phrase}" is longer than ${MAX_PHRASE_WORDS} words`);
      if (Object.hasOwn(table, key)) throw new Error(`keyword table: "${phrase}" is listed twice`);
      table[key] = category;
    }
  }
  return Object.freeze(table);
}

export const KEYWORD_TABLE: Readonly<Record<string, Category>> = buildKeywordTable();

for (const [name, table] of Object.entries(NATIVE_TABLES)) {
  for (const key of Object.keys(table)) {
    if (normaliseCategoryText(key) !== key) throw new Error(`native table ${name}: "${key}" is not in normalised form`);
  }
}

// ---- matching ----------------------------------------------------------------------------------------------------

interface Hit {
  readonly category: Category;
  readonly entry: string;
}

function nativeHit(venue: string, normalised: string): Hit | null {
  if (normalised === "") return null;
  const own = NATIVE_TABLES[venue];
  if (own !== undefined && Object.hasOwn(own, normalised)) return { category: own[normalised] as Category, entry: `${venue}:${normalised}` };
  if (Object.hasOwn(COMMON_NATIVE, normalised)) return { category: COMMON_NATIVE[normalised] as Category, entry: `common:${normalised}` };
  return null;
}

// The first phrase of the keyword table found in the tokens, longest phrase first at each position.
export function keywordHit(normalised: string): Hit | null {
  if (normalised === "") return null;
  const tokens = normalised.split(" ");
  for (let start = 0; start < tokens.length; start += 1) {
    for (let length = Math.min(MAX_PHRASE_WORDS, tokens.length - start); length >= 1; length -= 1) {
      const phrase = tokens.slice(start, start + length).join(" ");
      if (Object.hasOwn(KEYWORD_TABLE, phrase)) return { category: KEYWORD_TABLE[phrase] as Category, entry: `keyword:${phrase}` };
    }
  }
  return null;
}

export function categorise(input: CategoryInput): CategoryVerdict {
  const venue = normaliseCategoryText(typeof input.venue === "string" ? input.venue : "");
  const native = Array.isArray(input.native) ? input.native.slice(0, MAX_NATIVE_STRINGS) : [];
  const normalisedNative: string[] = [];
  for (const raw of native) {
    if (typeof raw !== "string") continue;
    const normalised = normaliseCategoryText(raw);
    if (normalised !== "") normalisedNative.push(normalised);
  }
  for (const normalised of normalisedNative) {
    const hit = nativeHit(venue, normalised);
    if (hit !== null) return { category: hit.category, confidence: "native", matched: [hit.entry] };
  }
  for (const normalised of normalisedNative) {
    const hit = keywordHit(normalised);
    if (hit !== null) return { category: hit.category, confidence: "native", matched: [hit.entry] };
  }
  if (typeof input.title === "string") {
    const hit = keywordHit(normaliseCategoryText(input.title));
    if (hit !== null) return { category: hit.category, confidence: "keyword", matched: [hit.entry] };
  }
  return NO_CATEGORY;
}
