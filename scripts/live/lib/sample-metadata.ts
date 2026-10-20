// A clean nine-key metadata draft for the REHEARSAL of T6 (a football match a few days out, the family that
// passes first review most often). It is data, not a real market: every name in it is made up and its sources
// are generic. A live run uses the draft you write yourself (--metadata-file).
export const SAMPLE_METADATA = Object.freeze({
  title: "Will the Sample Rovers beat the Example United in their league match on 25 October 2026?",
  description: "This market resolves according to the final score of the league match between the Sample Rovers and the Example United, scheduled for 25 October 2026.",
  category: "SPORTS",
  tags: ["football", "league"],
  subcategories: ["Football"],
  image_url: "https://images.sample-league.net/sample-rovers-vs-example-united.png",
  rules: {
    description:
      "This market resolves to Yes if the Sample Rovers win the league match against the Example United scheduled for 25 October 2026, with the result taken after full time of regular play (90 minutes plus stoppage time). Extra time and penalty shootouts are not played in this league. If the match is postponed beyond 1 November 2026 or cancelled, the market resolves No. The primary source is the official league website, with the match report published on the league's results page.",
    outcomeRules: [
      { outcomeIndex: 0, rule: "Resolves to Yes if the Sample Rovers are the winners of the match at full time according to the official league match report." },
      { outcomeIndex: 1, rule: "Resolves to No if the match ends in a draw or the Example United win at full time, or if the match is postponed beyond 1 November 2026 or cancelled." },
    ],
  },
  resolution_sources: ["https://www.espn.com/soccer/scoreboard"],
  outcomes: [
    { id: 0, title: "Yes" },
    { id: 1, title: "No" },
  ],
});

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"] as const;
const dayText = (date: Date): string => `${String(date.getUTCDate())} ${MONTHS[date.getUTCMonth()] as string} ${String(date.getUTCFullYear())}`;

// The same draft with the match on the day the market ends, which is what the oracle's date rule (C04) wants: an
// explicit calendar date within 24 hours of the expiry. The rehearsal builds it from its own clock.
export function sampleMetadataFor(expiresAt: Date): Record<string, unknown> {
  const matchDay = dayText(expiresAt);
  const lateDay = dayText(new Date(expiresAt.getTime() + 7 * 86_400_000));
  const swap = (text: string): string => text.replaceAll("25 October 2026", matchDay).replaceAll("1 November 2026", lateDay);
  return {
    ...SAMPLE_METADATA,
    title: swap(SAMPLE_METADATA.title),
    description: swap(SAMPLE_METADATA.description),
    rules: {
      description: swap(SAMPLE_METADATA.rules.description),
      outcomeRules: SAMPLE_METADATA.rules.outcomeRules.map((entry) => ({ ...entry, rule: swap(entry.rule) })),
    },
  };
}

// Where the rehearsal pretends to host it, and the folder the rehearsal's relay is told it may read (RELAY_SELF_HOST).
export const SAMPLE_SELF_HOST = "https://metadata.sample-host.net/rehearsal/";
export const SAMPLE_METADATA_URI = `${SAMPLE_SELF_HOST}market.json`;
