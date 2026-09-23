/**
 * How a market code and a symbol become a name the price feed knows.
 *
 * This used to live inside scripts/fetch-prices.mjs. It moved out when
 * scripts/verify-universe.ts started needing the same answer, because
 * those two agreeing is the entire point: the checker exists to say
 * whether the fetcher will be able to price a name, and a second copy of
 * this mapping would have made it answer that question about itself.
 *
 * Plain ESM with no dependencies, so scripts/fetch-prices.mjs can go on
 * running on a bare runner with no install. scripts/yahoo-symbol.d.mts
 * gives it types for the TypeScript side.
 */

/**
 * Our market codes to Yahoo's exchange suffixes.
 *
 * Yahoo names an instrument by ticker *and* exchange — "ERIC-B.ST" is
 * Ericsson B in Stockholm — which is what stops a lookup handing back
 * Sanofi when you meant Banco Santander. Each Nordic country uses one
 * suffix across all of its segments, so those key on the country
 * prefix; everywhere else is a single market and is named outright.
 *
 * US listings carry no suffix at all, which is why the lookup below
 * tests for the key rather than for a truthy value.
 *
 * Keying the Nordics on the country also means Spotlight, NGM and
 * Nordic SME get ".ST" and the two Euronext Oslo growth lists get ".OL",
 * which is what Yahoo does in fact call most of those names — but that
 * is a rule being applied to venues nobody has checked it against,
 * rather than a fact. Those markets are empty in the universe today, so
 * it costs nothing yet; scripts/verify-universe.ts is what would say.
 *
 * A market with no entry here at all can still be picked. Its
 * instruments come back unpriced and are typed into the admin grid.
 */
export const COUNTRY_SUFFIX = { SE: ".ST", FI: ".HE", DK: ".CO", NO: ".OL", IS: ".IC", US: "" };

export const MARKET_SUFFIX = {
  CA_TSX: ".TO",
  UK_LSE: ".L",
  DE_XETRA: ".DE",
  FR_EPA: ".PA",
  CH_SIX: ".SW",
  NL_AMS: ".AS",
  ES_BME: ".MC",
  IT_MIL: ".MI",
  JP_TSE: ".T",
  AU_ASX: ".AX",
};

export function suffixFor(marketCode) {
  if (marketCode in MARKET_SUFFIX) return MARKET_SUFFIX[marketCode];
  const country = String(marketCode).split("_")[0];
  return country in COUNTRY_SUFFIX ? COUNTRY_SUFFIX[country] : null;
}

/**
 * Our symbols to Yahoo's.
 *
 * Three conventions the universe seeds collide with Yahoo's separator:
 * the Nordic share class is "ERIC B" here and "ERIC-B" there, the
 * American one is "BRK.B" here and "BRK-B" there, and Nasdaq's own
 * screener spells that third way again as "BRK/B". Yahoo spells every
 * class with a hyphen and reserves the dot for the exchange, so
 * anything that is neither a letter nor a digit becomes a hyphen and
 * the suffix goes on afterwards. Tokyo's numeric tickers pass through
 * untouched.
 *
 * Returns null for a market with no known suffix, which is reported as
 * unpriced rather than guessed at — a wrong guess would find a real
 * instrument on the wrong exchange.
 */
export function yahooSymbol(symbol, marketCode) {
  const suffix = suffixFor(marketCode);
  if (suffix === null) return null;
  const base = String(symbol)
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return base ? `${base}${suffix}` : null;
}

/**
 * London quotes in pence.
 *
 * Yahoo reports GBp on LSE lines where the universe says GBP. The
 * scoreboard only ever divides one checkpoint by another, so a constant
 * factor of a hundred cancels out and nothing needs converting — but
 * the two spellings still have to be recognised as the same currency,
 * or the guard would throw away every British holding. Upper-casing
 * does it; GBX is the other spelling some feeds use for the same thing.
 */
export function sameCurrency(a, b) {
  const norm = (c) => {
    const upper = String(c ?? "").toUpperCase();
    return upper === "GBX" ? "GBP" : upper;
  };
  return norm(a) === norm(b);
}
