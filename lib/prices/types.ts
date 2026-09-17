/** What the weekly job needs to know about one instrument. */
export type PriceRequest = {
  /** Firestore instrument document id, e.g. "SE_LARGE_ERIC-B". */
  instrumentId: string;
  symbol: string;
  marketCode: string;
  currency: string;
};

/** One quote. `price` is the last traded price in the instrument's own currency. */
export type Quote = {
  instrumentId: string;
  price: number;
};

export type PriceResult = {
  quotes: Quote[];
  /** Instruments the feed could not price, with a reason for the admin. */
  missing: { instrumentId: string; symbol: string; reason: string }[];
};

export type PriceProvider = {
  /** Shown in the admin panel and stored on each price document. */
  name: string;
  /** False when the provider has no credentials configured. */
  isConfigured(): boolean;
  fetchQuotes(requests: PriceRequest[]): Promise<PriceResult>;
};
