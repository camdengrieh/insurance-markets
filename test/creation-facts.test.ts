import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  entityPresent,
  extractComparators,
  extractDates,
  extractEntities,
  extractNumbers,
  extractTimes,
  squash,
  wordSetOf,
} from "../src/xo/creation/metadata.js";

// The text-fact extractors the diff guard compares. Each one is tested on what it must find and on what it must
// not mistake for a fact.

describe("extractNumbers", () => {
  it("normalises money, separators, percentages and magnitudes", () => {
    assert.deepEqual(extractNumbers("above $100,000 USD"), ["100000"]);
    assert.deepEqual(extractNumbers("7,429.65 and 7429.65"), ["7429.65"]);
    assert.deepEqual(extractNumbers("down 3% or 3 percent or 3 per cent"), ["3%"]);
    assert.deepEqual(extractNumbers("100k, 1.5 million, 2bn"), ["100000", "1500000", "2000000000"]);
    assert.deepEqual(extractNumbers("5.0 and 5.50 and 05"), ["5", "5.5"]);
    assert.deepEqual(extractNumbers("0.001 and .5"), ["0.001", "5"]);
  });

  it("keeps a percentage distinct from the same bare number", () => {
    assert.deepEqual(extractNumbers("3% and 3"), ["3%", "3"]);
  });

  it("does not read numbers out of dates, clock times, links or e-mail addresses", () => {
    assert.deepEqual(extractNumbers("on December 31, 2026 at 23:59 UTC"), []);
    assert.deepEqual(extractNumbers("2026-12-31T23:59:59Z"), []);
    assert.deepEqual(extractNumbers("see https://www.example-news.com/a/story-1.8023194 for 12 goals"), ["12"]);
    assert.deepEqual(extractNumbers(`write to desk7${String.fromCharCode(64)}example-news.com about 4 goals`), ["4"]);
  });

  it("does not read a number out of a word", () => {
    assert.deepEqual(extractNumbers("Q3 and H2H and BTC2 and 5th"), ["5"]);
  });

  it("treats a bare year as a date, not as a number, but a priced four-digit figure stays a number", () => {
    assert.deepEqual(extractNumbers("by the end of 2026"), []);
    assert.deepEqual(extractNumbers("above $2000"), ["2000"]);
    assert.deepEqual(extractNumbers("above 2,000"), ["2000"]);
    assert.deepEqual(extractNumbers("above 2500"), ["2500"]);
  });

  it("is bounded on hostile input", () => {
    const text = `${"9".repeat(60_000)} 7`;
    assert.ok(extractNumbers(text).length <= 2);
  });
});

describe("extractDates", () => {
  it("reads the common spellings to one key", () => {
    const keys = (text: string): string[] => extractDates(text).map((fact) => fact.key);
    assert.deepEqual(keys("December 31, 2026"), ["2026-12-31"]);
    assert.deepEqual(keys("Dec. 31 2026"), ["2026-12-31"]);
    assert.deepEqual(keys("31 December 2026"), ["2026-12-31"]);
    assert.deepEqual(keys("the 31st of December, 2026"), ["2026-12-31"]);
    assert.deepEqual(keys("2026-12-31"), ["2026-12-31"]);
    assert.deepEqual(keys("2026-12-31T23:59:59Z"), ["2026-12-31"]);
  });

  it("keeps a date without a year, a bare year and an order-ambiguous slash date as such", () => {
    assert.deepEqual(extractDates("on August 29").map((fact) => fact.key), ["--08-29"]);
    assert.deepEqual(extractDates("by the end of 2026").map((fact) => fact.key), ["Y2026"]);
    assert.deepEqual(extractDates("on 4/5/2026").map((fact) => fact.key), ["~4/5/2026"]);
  });

  it("reports the time and zone of an ISO date-time", () => {
    const [fact] = extractDates("2026-12-31T23:59:59Z");
    assert.equal(fact?.time, "23:59");
    assert.equal(fact?.zone, "UTC");
    const [offset] = extractDates("2026-12-31T08:00:00+05:30");
    assert.equal(offset?.zone, "+05:30");
  });

  it("rejects calendar dates that do not exist (a stray year stays visible as a bare year)", () => {
    const full = (text: string): string[] => extractDates(text).filter((fact) => fact.month > 0).map((fact) => fact.key);
    assert.deepEqual(full("February 30, 2026"), []);
    assert.deepEqual(full("2026-13-01"), []);
    assert.deepEqual(full("2026-02-29"), []);
    assert.deepEqual(full("31 April 2026"), []);
    assert.deepEqual(full("2028-02-29"), ["2028-02-29"]);
    // A century year is a leap year only when divisible by 400.
    assert.deepEqual(full("2100-02-29"), []);
    assert.deepEqual(full("1900-02-29"), []);
    assert.deepEqual(full("2000-02-29"), ["2000-02-29"]);
    assert.deepEqual(extractDates("2026-13-01").map((fact) => fact.key), ["Y2026"]);
  });

  it("returns dates in order of appearance and without duplicates", () => {
    assert.deepEqual(
      extractDates("from March 3, 2026 until June 9, 2026, that is March 3, 2026").map((fact) => fact.key),
      ["2026-03-03", "2026-06-09"],
    );
  });
});

describe("extractTimes", () => {
  it("normalises to 24-hour clock with the written zone", () => {
    assert.deepEqual(extractTimes("23:59 UTC"), [{ clock: "23:59", zone: "UTC" }]);
    assert.deepEqual(extractTimes("11:30 pm ET"), [{ clock: "23:30", zone: "ET" }]);
    assert.deepEqual(extractTimes("12:00 am"), [{ clock: "00:00", zone: null }]);
    assert.deepEqual(extractTimes("at 9:05"), [{ clock: "09:05", zone: null }]);
  });

  it("rejects impossible times and leaves the time of an ISO date-time to the date", () => {
    assert.deepEqual(extractTimes("25:00 and 12:75"), []);
    assert.deepEqual(extractTimes("2026-12-31T23:59:59Z"), []);
  });
});

describe("extractComparators", () => {
  it("finds boundary and direction wording", () => {
    assert.deepEqual(extractComparators("at least 3 goals"), ["at_least"]);
    assert.deepEqual(extractComparators("3 goals or more"), ["at_least"]);
    assert.deepEqual(extractComparators("more than 3 goals"), ["more_than"]);
    assert.deepEqual(extractComparators("at most 3"), ["at_most"]);
    assert.deepEqual(extractComparators("3 or fewer"), ["at_most"]);
    assert.deepEqual(extractComparators("fewer than 3"), ["less_than"]);
    assert.deepEqual(extractComparators("the price will rise"), ["rise"]);
    assert.deepEqual(extractComparators("the index closes down 3%"), ["fall"]);
  });

  it("does not match inside other words", () => {
    assert.deepEqual(extractComparators("overtime takeover underwrite abovementioned"), []);
  });
});

describe("extractEntities", () => {
  const texts = (input: string): string[] => extractEntities(input).map((entity) => entity.text);

  it("finds proper-noun phrases and acronyms", () => {
    assert.deepEqual(texts("the match between Real Madrid and Real Sociedad on a Sunday"), ["Real Madrid", "Real Sociedad"]);
    assert.deepEqual(texts("the Strait of Hormuz and the S&P 500 and BTC"), ["Strait of Hormuz", "S&P", "BTC"]);
  });

  it("ignores a lone capitalised word at the start of a sentence", () => {
    assert.deepEqual(texts("Resolution depends on the source. Resolves when ready."), []);
  });

  it("ignores a lone capitalised word at the start of any sentence, even one that is not a stop word", () => {
    assert.deepEqual(texts("Weather decides this. Rain stops play. Snow does not."), []);
    assert.deepEqual(texts("Weather decides this. Rain stops play in London."), ["London"]);
    // A two-word phrase at the start of a sentence is still a name.
    assert.deepEqual(texts("Real Madrid play at home."), ["Real Madrid"]);
  });

  it("drops leading stop words and keeps the name after them", () => {
    assert.deepEqual(texts("Will Bitcoin close above 5?"), ["Bitcoin"]);
    assert.deepEqual(texts("Primary sources include The White House."), ["White House"]);
  });

  it("does not read months, weekdays, zones or times as entities", () => {
    assert.deepEqual(texts("on Monday, August 3, 2026 at 23:59 UTC"), []);
    assert.deepEqual(texts("the cutoff is 2026-12-31T23:59:59Z"), []);
  });

  it("strips a possessive", () => {
    assert.deepEqual(texts("only Chelsea's Premier League fixture"), ["Chelsea Premier League"]);
  });

  it("does not read a link's name as an entity", () => {
    assert.deepEqual(texts("see https://www.Example-News.com/Story for details"), []);
  });
});

describe("entityPresent", () => {
  const present = (name: string, text: string): boolean => {
    const entity = extractEntities(`in the ${name} case`)[0];
    assert.ok(entity, `no entity found for ${name}`);
    return entityPresent(entity, squash(text), wordSetOf(text));
  };

  it("matches across spacing, punctuation and case", () => {
    assert.equal(present("White House", "an official release on whitehouse.gov"), true);
    assert.equal(present("Strait of Hormuz", "the strait of hormuz"), true);
  });

  it("matches a reordered name when every significant word is there", () => {
    assert.equal(present("Department of State", "the State Department announced"), true);
  });

  it("does not match when a significant word is gone", () => {
    assert.equal(present("Real Madrid", "Real Sociedad hosts them"), false);
    assert.equal(present("Manchester City", "Manchester United"), false);
  });

  it("matches a short name only as a whole word", () => {
    assert.equal(present("BTC", "the BTCUSDT pair"), false);
    assert.equal(present("BTC", "the BTC pair"), true);
  });
});
