import * as z from "zod/v4";

// The parts of DefiLlama's /overview/dexs answer this client reads. Extra fields are ignored. The live envelope was
// not checked: the schema follows the documented shape {protocols: [{name, slug, category, chains, total24h,
// total7d, total30d, ...}]} and the research's reduced list, and the opt-in live suite is where it is proven.

export const SLUG = /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/;

export const envelopeSchema = z.object({ protocols: z.array(z.unknown()).max(20_000) });

// A volume figure is a JSON number, null, or absent. Anything else is a changed shape of THAT row, so it is read as
// unknown here and rejected (and counted) by the client, not mistaken for a row that is not a prediction market.
const volumeField = z.unknown().optional();

export const rowSchema = z.object({
  name: z.string().min(1).max(200),
  slug: z.string().regex(SLUG),
  category: z.string().max(80).optional(),
  chains: z.array(z.string().max(80)).max(200).optional(),
  total24h: volumeField,
  total7d: volumeField,
  total30d: volumeField,
});
export type DefiLlamaRow = z.infer<typeof rowSchema>;

export const SCHEMA_DESCRIPTOR = "defillama overview dexs: protocols[]{name slug category chains total24h total7d total30d}";
