/**
 * Types for ./yahoo-symbol.mjs.
 *
 * The implementation is plain ESM so that scripts/fetch-prices.mjs keeps
 * running with no install; this is what lets a TypeScript caller import
 * it anyway, with `allowJs` off.
 */

export declare const COUNTRY_SUFFIX: Record<string, string>;
export declare const MARKET_SUFFIX: Record<string, string>;

/** The exchange suffix for a market, or null if none is known. */
export declare function suffixFor(marketCode: string): string | null;

/** The feed's name for an instrument, or null for a market with no suffix. */
export declare function yahooSymbol(symbol: string, marketCode: string): string | null;

/** True when two currency codes mean the same currency (GBp, GBX and GBP). */
export declare function sameCurrency(a: string | null | undefined, b: string | null | undefined): boolean;
