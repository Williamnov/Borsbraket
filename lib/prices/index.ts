import { serverEnv } from "@/lib/env";
import type { PriceProvider, PriceRequest, PriceResult } from "./types";

/**
 * The default: no automatic feed. The weekly job still runs, still logs,
 * and still tells you which instruments are waiting — you fill the prices
 * in from the admin panel.
 */
const manualProvider: PriceProvider = {
  name: "manual",
  isConfigured: () => true,
  async fetchQuotes(requests: PriceRequest[]): Promise<PriceResult> {
    return {
      quotes: [],
      missing: requests.map((r) => ({
        instrumentId: r.instrumentId,
        symbol: r.symbol,
        reason: "No price feed configured — enter this week's price in the admin panel.",
      })),
    };
  },
};

/**
 * Template for a real feed.
 *
 * This is deliberately NOT wired to a specific vendor. Request and
 * response shapes differ per provider, and a guessed shape fails
 * silently at 06:00 on a Monday. To switch a feed on:
 *
 *   1. Put the credentials in PRICE_API_KEY / PRICE_API_BASE_URL
 *      (Vercel project settings, never in the repo).
 *   2. Implement fetchQuotes below against the vendor's documented API.
 *   3. Set PRICE_PROVIDER=http.
 *
 * Map the vendor's symbology to `symbol` + `marketCode`; most feeds want
 * an exchange-qualified ticker such as "ERIC-B.ST" or "AAPL.US".
 *
 * One thing to know before doing step 3. Whatever is implemented here
 * runs inside the daily Vercel cron, and a Hobby function is killed at
 * sixty seconds — so a feed that needs paced requests belongs in
 * scripts/fetch-prices.mjs, where the GitHub Action has as long as it
 * likes, and not here. `manual` stays the default for that reason: the
 * cron then only announces and records the run, both of which are
 * instant.
 */
const httpProvider: PriceProvider = {
  name: "http",
  isConfigured: () => Boolean(serverEnv.priceApiKey() && serverEnv.priceApiBaseUrl()),
  async fetchQuotes(requests: PriceRequest[]): Promise<PriceResult> {
    throw new Error(
      "PRICE_PROVIDER=http is selected but lib/prices/index.ts has no vendor " +
        "implementation yet. Implement httpProvider.fetchQuotes, or set " +
        "PRICE_PROVIDER=manual to keep entering prices by hand.",
    );
  },
};

const providers: Record<string, PriceProvider> = {
  manual: manualProvider,
  http: httpProvider,
};

export function getPriceProvider(): PriceProvider {
  const name = serverEnv.priceProvider();
  const provider = providers[name];
  if (!provider) {
    throw new Error(
      `Unknown PRICE_PROVIDER "${name}". Available: ${Object.keys(providers).join(", ")}.`,
    );
  }
  return provider;
}

export type { PriceProvider, PriceRequest, PriceResult, Quote } from "./types";
