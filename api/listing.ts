import type { ApiConfig } from "./config.js";
import type { PaidRoute } from "./keys.js";
import { BASE_USDC, MAX_TIMEOUT_SECONDS, requirementsFor, X402_VERSION } from "./x402.js";

// The x402 listing material of the paid endpoints (docs/sdk-and-api-design.md section 4: "listing the API as a PayBox service
// gives every PayBox agent paid access with no plugin code").
//
// How PayBox finds a paid service, from its public documentation (docs.paybox.sh/llms-full.txt, MCP tools reference, read
// 2026-10-22): `discover_services` "Search[es] the curated x402 Bazaar set for paid services. By default, PayBox returns
// services with recent usage, at least 10 unique payers in the last 30 days, and a supported x402 rail"; `use_service`
// "probes the resource, parses the 402, opens the signing window, then re-fetches the resource with the payment header";
// `pay_x402` takes the 402's `accepts` verbatim with `x402_version` 1 or 2. PayBox documents no submission form or listing
// API of its own: a service reaches its catalog through the x402 Bazaar. The Bazaar is the x402 discovery extension
// (github.com/coinbase/x402 specs/extensions/bazaar.md, read 2026-10-22 at commit 0e6e8c55d86b4f14234fb6e49a4052074fb93e57):
// the resource server declares `extensions.bazaar` ({ info, schema }) in its 402, and a facilitator that implements the
// extension catalogs the resource after it processes payments for it.
//
// So the listing is (1) the bazaar extension below, carried by every 402 this API sends, and (2) the manifest below (what an
// operator reviews and keeps; `node api.mjs listing` prints it from the running configuration). Prices come from the
// configuration only; an endpoint with no configured price is listed as not sold.

export const SERVICE_NAME = "Insurance Markets API";
export const SERVICE_TAGS = Object.freeze(["prediction-markets", "quotes", "orders"]);

export interface PaidEndpointInfo {
  readonly route: PaidRoute;
  readonly method: "GET" | "POST";
  readonly path: string;
  readonly description: string;
}

export const PAID_ENDPOINTS: readonly PaidEndpointInfo[] = Object.freeze([
  {
    route: "quote",
    method: "GET",
    path: "/v1/quote",
    description: "Depth-walked fill of a size across a linked group's venues after fees, best venue first; every number with its source and age.",
  },
  {
    route: "route_prepare",
    method: "POST",
    path: "/v1/route/prepare",
    description: "Unsigned typed-data orders, one per venue leg of a linked group, with the decoded view and what the signer must check. Never signs or submits.",
  },
]);

const SCHEMA_URI = "https://json-schema.org/draft/2020-12/schema";

// The bazaar extension of one paid endpoint (bazaar.md "Discovery Info Structure"). The query and body values are
// descriptions of what each field takes, not invented examples.
export function bazaarExtension(route: PaidRoute): { readonly info: Record<string, unknown>; readonly schema: Record<string, unknown> } {
  const output = { type: "json" };
  const outputSchema = { type: "object", properties: { type: { type: "string" }, example: { type: "object" } }, required: ["type"] };
  if (route === "quote") {
    return {
      info: {
        input: {
          type: "http",
          method: "GET",
          queryParams: {
            group: "a link id from GET /v1/groups (lnk_ and 32 lowercase hex characters)",
            side: "buy or sell",
            size: "shares, a decimal above 0 with at most 6 places",
            outcome: "optional: the outcome index on the link's first leg (default 0)",
          },
        },
        output,
      },
      schema: {
        $schema: SCHEMA_URI,
        type: "object",
        properties: {
          input: {
            type: "object",
            properties: {
              type: { type: "string", const: "http" },
              method: { type: "string", enum: ["GET"] },
              queryParams: {
                type: "object",
                properties: { group: { type: "string" }, side: { type: "string" }, size: { type: "string" }, outcome: { type: "string" } },
                required: ["group", "side", "size"],
              },
            },
            required: ["type", "method"],
            additionalProperties: false,
          },
          output: outputSchema,
        },
        required: ["input"],
      },
    };
  }
  return {
    info: {
      input: {
        type: "http",
        method: "POST",
        bodyType: "json",
        body: {
          group: "a link id from GET /v1/groups",
          outcome: "the outcome index on the link's first leg (an integer)",
          side: "buy or sell",
          owner: "the signer's own address (0x and 40 hex characters)",
          legs: "1 to 4 of { venue, marketId, price, shares, tif: GTC|FOK|FAK }, each a leg of the group",
        },
      },
      output,
    },
    schema: {
      $schema: SCHEMA_URI,
      type: "object",
      properties: {
        input: {
          type: "object",
          properties: {
            type: { type: "string", const: "http" },
            method: { type: "string", enum: ["POST"] },
            bodyType: { type: "string", enum: ["json"] },
            body: { type: "object" },
          },
          required: ["type", "method", "bodyType", "body"],
          additionalProperties: false,
        },
        output: outputSchema,
      },
      required: ["input"],
    },
  };
}

function usdc(atomic: bigint): string {
  const whole = atomic / 1_000_000n;
  const fraction = (atomic % 1_000_000n).toString().padStart(6, "0").replace(/0+$/, "");
  return fraction === "" ? whole.toString() : `${whole.toString()}.${fraction}`;
}

// What an operator submits for review and keeps beside the deployment: the service, its rail and each paid endpoint with its
// configured price and the exact PaymentRequirements a 402 states. Null fields say what is not configured.
export function serviceManifest(config: ApiConfig): Record<string, unknown> {
  const payments = config.payments;
  return {
    serviceName: SERVICE_NAME,
    tags: [...SERVICE_TAGS],
    x402Version: X402_VERSION,
    rail: { scheme: "exact", assetTransferMethod: "eip3009", network: BASE_USDC.network, asset: BASE_USDC.address, assetName: "USDC", decimals: BASE_USDC.decimals, eip712: BASE_USDC.eip712, maxTimeoutSeconds: MAX_TIMEOUT_SECONDS },
    payTo: payments?.payTo ?? null,
    baseUrl: payments?.publicUrl ?? null,
    custody: "None. The API holds no wallet, no signer and no venue credential, and submits nothing.",
    freeEndpoints: ["GET /v1/health", "GET /v1/venues", "GET /v1/markets", "GET /v1/markets/:venue/:id", "GET /v1/groups"],
    endpoints: PAID_ENDPOINTS.map((endpoint) => {
      const price = payments === null ? null : endpoint.route === "quote" ? payments.prices.quote : payments.prices.routePrepare;
      const enabled = endpoint.route === "quote" || config.routePrepare === "paid";
      const sold = payments !== null && price !== null && enabled;
      return {
        method: endpoint.method,
        path: endpoint.path,
        resource: payments === null ? null : `${payments.publicUrl}${endpoint.path}`,
        description: endpoint.description,
        sold,
        ...(endpoint.route === "route_prepare" ? { mode: config.routePrepare } : {}),
        priceUsdc: price === null ? null : usdc(price),
        accepts: sold && payments !== null && price !== null ? [requirementsFor(payments, price)] : [],
        bazaar: bazaarExtension(endpoint.route),
      };
    }),
  };
}
