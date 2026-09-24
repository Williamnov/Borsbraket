/**
 * The pickable universe.
 *
 * MARKETS covers every Nordic list, the main North American and UK
 * exchanges, the large continental European venues and Tokyo and Sydney.
 * Disable a market in the admin panel to close it.
 *
 * INSTRUMENTS has two halves.
 *
 * **Every Nordic market** comes from universe.generated.ts, which
 * scripts/build-universe.mjs takes from the exchanges themselves —
 * Nasdaq's Nordic screener for the main-market segments and First North
 * of all four countries, NGM's and Spotlight's own APIs for the Swedish
 * growth venues, and Euronext's product directory for the three Oslo
 * lists. Sixteen hundred names is not something to type, and segment
 * membership is not something to guess at: the exchange decides it and
 * reshuffles it annually, so the only trustworthy list is the one it
 * publishes. Re-run the script to refresh it.
 *
 * **Everything else** is hand-kept below: the main international venues,
 * where the listing is unambiguous and changes rarely.
 *
 * Nothing can be picked that is not in this collection.
 */

import { NORDIC_LISTINGS } from "./universe.generated";

export type MarketSeed = {
  code: string;
  name: string;
  country: string;
  region: string;
  currency: string;
  sortOrder: number;
};

export type InstrumentSeed = {
  symbol: string;
  name: string;
  marketCode: string;
  currency: string;
};

export const MARKETS: MarketSeed[] = [
  { code: "SE_LARGE", name: "Large Cap Stockholm", country: "Sweden", region: "Nordics", currency: "SEK", sortOrder: 10 },
  { code: "SE_MID", name: "Mid Cap Stockholm", country: "Sweden", region: "Nordics", currency: "SEK", sortOrder: 11 },
  { code: "SE_SMALL", name: "Small Cap Stockholm", country: "Sweden", region: "Nordics", currency: "SEK", sortOrder: 12 },
  { code: "SE_FN", name: "First North", country: "Sweden", region: "Nordics", currency: "SEK", sortOrder: 13 },
  { code: "SE_SPOT", name: "Spotlight", country: "Sweden", region: "Nordics", currency: "SEK", sortOrder: 14 },
  { code: "SE_NGM", name: "NGM Main Market", country: "Sweden", region: "Nordics", currency: "SEK", sortOrder: 15 },
  { code: "SE_NGMPEP", name: "NGM PepMarket", country: "Sweden", region: "Nordics", currency: "SEK", sortOrder: 16 },
  // The code stays SE_SME so that no instrument id changes, but the name
  // does not: NGM's MTF is called NGM Growth Market now. Its site no
  // longer says "Nordic SME" anywhere and its API reports exactly two
  // equity segments — Main Market and Growth Market.
  { code: "SE_SME", name: "NGM Growth Market", country: "Sweden", region: "Nordics", currency: "SEK", sortOrder: 17 },

  { code: "FI_LARGE", name: "Large Cap Helsinki", country: "Finland", region: "Nordics", currency: "EUR", sortOrder: 20 },
  { code: "FI_MID", name: "Mid Cap Helsinki", country: "Finland", region: "Nordics", currency: "EUR", sortOrder: 21 },
  { code: "FI_SMALL", name: "Small Cap Helsinki", country: "Finland", region: "Nordics", currency: "EUR", sortOrder: 22 },
  { code: "FI_FN", name: "First North Finland", country: "Finland", region: "Nordics", currency: "EUR", sortOrder: 23 },

  { code: "DK_LARGE", name: "Large Cap Copenhagen", country: "Denmark", region: "Nordics", currency: "DKK", sortOrder: 30 },
  { code: "DK_MID", name: "Mid Cap Copenhagen", country: "Denmark", region: "Nordics", currency: "DKK", sortOrder: 31 },
  { code: "DK_SMALL", name: "Small Cap Copenhagen", country: "Denmark", region: "Nordics", currency: "DKK", sortOrder: 32 },
  { code: "DK_FN", name: "First North Denmark", country: "Denmark", region: "Nordics", currency: "DKK", sortOrder: 33 },
  { code: "DK_SPOT", name: "Spotlight Denmark", country: "Denmark", region: "Nordics", currency: "DKK", sortOrder: 34 },

  { code: "NO_OSE", name: "Oslo Børs", country: "Norway", region: "Nordics", currency: "NOK", sortOrder: 40 },
  { code: "NO_EXPAND", name: "Euronext Expand Oslo", country: "Norway", region: "Nordics", currency: "NOK", sortOrder: 41 },
  { code: "NO_GROWTH", name: "Euronext Growth Oslo", country: "Norway", region: "Nordics", currency: "NOK", sortOrder: 42 },

  { code: "IS_LARGE", name: "Large Cap Iceland", country: "Iceland", region: "Nordics", currency: "ISK", sortOrder: 50 },
  { code: "IS_MID", name: "Mid Cap Iceland", country: "Iceland", region: "Nordics", currency: "ISK", sortOrder: 51 },
  { code: "IS_SMALL", name: "Small Cap Iceland", country: "Iceland", region: "Nordics", currency: "ISK", sortOrder: 52 },
  { code: "IS_FN", name: "First North Iceland", country: "Iceland", region: "Nordics", currency: "ISK", sortOrder: 53 },

  { code: "US_NYSE", name: "NYSE", country: "United States", region: "North America", currency: "USD", sortOrder: 60 },
  { code: "US_NASDAQ", name: "Nasdaq", country: "United States", region: "North America", currency: "USD", sortOrder: 61 },
  { code: "US_AMEX", name: "NYSE American", country: "United States", region: "North America", currency: "USD", sortOrder: 62 },
  { code: "CA_TSX", name: "Toronto Stock Exchange", country: "Canada", region: "North America", currency: "CAD", sortOrder: 70 },
  { code: "UK_LSE", name: "London Stock Exchange", country: "United Kingdom", region: "United Kingdom", currency: "GBP", sortOrder: 80 },

  { code: "DE_XETRA", name: "Xetra", country: "Germany", region: "Europe", currency: "EUR", sortOrder: 90 },
  { code: "FR_EPA", name: "Euronext Paris", country: "France", region: "Europe", currency: "EUR", sortOrder: 91 },
  { code: "CH_SIX", name: "SIX Swiss Exchange", country: "Switzerland", region: "Europe", currency: "CHF", sortOrder: 92 },
  { code: "NL_AMS", name: "Euronext Amsterdam", country: "Netherlands", region: "Europe", currency: "EUR", sortOrder: 93 },
  { code: "ES_BME", name: "Bolsa de Madrid", country: "Spain", region: "Europe", currency: "EUR", sortOrder: 94 },
  { code: "IT_MIL", name: "Borsa Italiana", country: "Italy", region: "Europe", currency: "EUR", sortOrder: 95 },

  { code: "JP_TSE", name: "Tokyo Stock Exchange", country: "Japan", region: "Asia-Pacific", currency: "JPY", sortOrder: 110 },
  { code: "AU_ASX", name: "Australian Securities Exchange", country: "Australia", region: "Asia-Pacific", currency: "AUD", sortOrder: 111 },
];

/*
 * A MARKET_MIC table used to live here, mapping each market to its ISO
 * 10383 venue code. It existed for one caller — Twelve Data's `mic_code`
 * parameter — and went with it. Naming the exchange is still necessary
 * ("SAN" is Sanofi in Paris and Banco Santander in Madrid), but each
 * feed spells that its own way, so the translation now sits beside the
 * feed in scripts/fetch-prices.mjs. What the app hands out is the
 * market code, which is its own fact rather than any vendor's.
 */

function list(marketCode: string, currency: string, rows: [string, string][]): InstrumentSeed[] {
  return rows.map(([symbol, name]) => ({ symbol, name, marketCode, currency }));
}

export const INSTRUMENTS: InstrumentSeed[] = [
  /*
   * Every Nordic list, from the exchange that publishes it: the four
   * Nasdaq countries' Large, Mid and Small Cap segments and their First
   * North markets, NGM's two segments, Spotlight, and Oslo Børs with
   * Euronext Expand and Growth beside it.
   *
   * This used to be a hand-typed large cap list per country and nothing
   * below it, which is why Helsinki, Copenhagen, Reykjavík and the
   * growth venues were empty. It is generated now — see the note at the
   * top of this file, and scripts/build-universe.mjs for where each
   * market comes from.
   *
   * ShaMaran is the one worth knowing about: it trades as a Swedish
   * depository receipt, so its symbol carries "SDB". The existing
   * convention handles it, because a space becomes a hyphen on the way
   * to the feed exactly as it does for the B-shares.
   */
  ...NORDIC_LISTINGS,

  ...list("US_NYSE", "USD", [
    ["ABBV", "AbbVie"], ["ABT", "Abbott Laboratories"], ["ACN", "Accenture"],
    ["AXP", "American Express"], ["BA", "Boeing"], ["BAC", "Bank of America"],
    ["BLK", "BlackRock"], ["BRK.B", "Berkshire Hathaway B"], ["C", "Citigroup"],
    ["CAT", "Caterpillar"], ["CRM", "Salesforce"], ["CVS", "CVS Health"], ["CVX", "Chevron"],
    ["DE", "Deere & Company"], ["DHR", "Danaher"], ["DIS", "Walt Disney"],
    ["ELV", "Elevance Health"], ["GE", "GE Aerospace"], ["GS", "Goldman Sachs"],
    ["HD", "Home Depot"], ["IBM", "IBM"], ["JNJ", "Johnson & Johnson"],
    ["JPM", "JPMorgan Chase"], ["KO", "Coca-Cola"], ["LLY", "Eli Lilly"],
    ["LOW", "Lowe's"], ["MA", "Mastercard"], ["MCD", "McDonald's"], ["MMM", "3M"],
    ["MRK", "Merck & Co."], ["MS", "Morgan Stanley"], ["NKE", "Nike B"],
    ["NOW", "ServiceNow"], ["NVO", "Novo Nordisk ADR"], ["PG", "Procter & Gamble"],
    ["PM", "Philip Morris International"], ["RTX", "RTX Corporation"],
    ["SCHW", "Charles Schwab"], ["SHOP", "Shopify A"], ["SPGI", "S&P Global"],
    ["SPOT", "Spotify Technology"], ["T", "AT&T"], ["TMO", "Thermo Fisher Scientific"],
    ["TSM", "Taiwan Semiconductor ADR"], ["UBER", "Uber Technologies"],
    ["UNH", "UnitedHealth Group"], ["UPS", "United Parcel Service B"], ["V", "Visa A"],
    ["VZ", "Verizon Communications"], ["WFC", "Wells Fargo"], ["WMT", "Walmart"],
    ["XOM", "Exxon Mobil"],
  ]),

  ...list("US_NASDAQ", "USD", [
    ["AAPL", "Apple"], ["ADBE", "Adobe"], ["ADP", "Automatic Data Processing"],
    ["ADSK", "Autodesk"], ["AMAT", "Applied Materials"], ["AMD", "Advanced Micro Devices"],
    ["AMGN", "Amgen"], ["AMZN", "Amazon.com"], ["ASML", "ASML Holding ADR"],
    ["AVGO", "Broadcom"], ["BKNG", "Booking Holdings"], ["CDNS", "Cadence Design Systems"],
    ["COIN", "Coinbase Global A"], ["COST", "Costco Wholesale"], ["CRWD", "CrowdStrike A"],
    ["CSCO", "Cisco Systems"], ["CTAS", "Cintas"], ["DDOG", "Datadog A"],
    ["EA", "Electronic Arts"], ["FTNT", "Fortinet"], ["GILD", "Gilead Sciences"],
    ["GOOGL", "Alphabet A"], ["HON", "Honeywell International"], ["INTC", "Intel"],
    ["INTU", "Intuit"], ["ISRG", "Intuitive Surgical"], ["KLAC", "KLA Corporation"],
    ["LRCX", "Lam Research"], ["MDLZ", "Mondelez International A"], ["MELI", "MercadoLibre"],
    ["META", "Meta Platforms A"], ["MNST", "Monster Beverage"], ["MRVL", "Marvell Technology"],
    ["MSFT", "Microsoft"], ["MU", "Micron Technology"], ["NBIS", "Nebius Group"],
    ["NFLX", "Netflix"], ["NVDA", "NVIDIA"],
    ["ODFL", "Old Dominion Freight Line"], ["ORLY", "O'Reilly Automotive"],
    ["PANW", "Palo Alto Networks"], ["PCAR", "PACCAR"], ["PEP", "PepsiCo"],
    ["PLTR", "Palantir Technologies A"], ["PYPL", "PayPal Holdings"], ["QCOM", "Qualcomm"],
    ["REGN", "Regeneron Pharmaceuticals"], ["RKLB", "Rocket Lab"], ["SBUX", "Starbucks"],
    ["SNPS", "Synopsys"],
    ["TEAM", "Atlassian A"], ["TSLA", "Tesla"], ["TTWO", "Take-Two Interactive"],
    ["TXN", "Texas Instruments"], ["VRTX", "Vertex Pharmaceuticals"], ["WDAY", "Workday A"],
    ["ZS", "Zscaler"],
  ]),

  ...list("CA_TSX", "CAD", [
    ["ABX", "Barrick Mining"], ["AEM", "Agnico Eagle Mines"], ["ATD", "Alimentation Couche-Tard"],
    ["BCE", "BCE"], ["BMO", "Bank of Montreal"], ["BNS", "Bank of Nova Scotia"], ["CM", "CIBC"],
    ["CNQ", "Canadian Natural Resources"], ["CNR", "Canadian National Railway"],
    ["CP", "Canadian Pacific Kansas City"], ["CSU", "Constellation Software"],
    ["CVE", "Cenovus Energy"], ["DOL", "Dollarama"], ["ENB", "Enbridge"], ["FTS", "Fortis"],
    ["GWO", "Great-West Lifeco"], ["IMO", "Imperial Oil"], ["L", "Loblaw Companies"],
    ["MFC", "Manulife Financial"], ["NA", "National Bank of Canada"], ["NTR", "Nutrien"],
    ["OTEX", "Open Text"], ["POW", "Power Corporation of Canada"],
    ["QSR", "Restaurant Brands International"], ["RY", "Royal Bank of Canada"],
    ["SLF", "Sun Life Financial"], ["SU", "Suncor Energy"], ["TD", "Toronto-Dominion Bank"],
    ["TRI", "Thomson Reuters"], ["TRP", "TC Energy"], ["WCN", "Waste Connections"],
  ]),

  // Several of these trade below GBP 1 and are still FTSE 100 companies.
  // This league filters on company size, never on share price.
  ...list("UK_LSE", "GBP", [
    ["AAL", "Anglo American"], ["ADM", "Admiral Group"], ["ANTO", "Antofagasta"],
    ["AV", "Aviva"], ["AZN", "AstraZeneca"], ["BA", "BAE Systems"], ["BARC", "Barclays"],
    ["BATS", "British American Tobacco"], ["BP", "BP"], ["CPG", "Compass Group"],
    ["DGE", "Diageo"], ["EXPN", "Experian"], ["FERG", "Ferguson Enterprises"],
    ["GLEN", "Glencore"], ["GSK", "GSK"], ["HLMA", "Halma"], ["HSBA", "HSBC Holdings"],
    ["IHG", "InterContinental Hotels"], ["III", "3i Group"], ["IMB", "Imperial Brands"],
    ["ITRK", "Intertek Group"], ["LLOY", "Lloyds Banking Group"],
    ["LSEG", "London Stock Exchange Group"], ["MNDI", "Mondi"], ["NG", "National Grid"],
    ["NXT", "Next"], ["PRU", "Prudential"], ["PSON", "Pearson"], ["REL", "RELX"],
    ["RIO", "Rio Tinto"], ["RKT", "Reckitt Benckiser Group"], ["SGE", "Sage Group"],
    ["SHEL", "Shell"], ["SMIN", "Smiths Group"], ["SN", "Smith & Nephew"], ["SSE", "SSE"],
    ["STAN", "Standard Chartered"], ["SVT", "Severn Trent"], ["TSCO", "Tesco"],
    ["ULVR", "Unilever"], ["UU", "United Utilities Group"], ["VOD", "Vodafone Group"],
    ["WPP", "WPP"], ["WTB", "Whitbread"],
  ]),

  // ── Continental Europe and Asia-Pacific ─────────────────────────────
  // Every ticker below was checked against the price feed's catalogue
  // before being added: a name nobody can price is worse than a name
  // nobody can pick, because it fails silently halfway through a month.
  // Companies that trade in two of these markets appear once, in their
  // primary listing — Airbus in Paris, Stellantis in Paris.

  ...list("DE_XETRA", "EUR", [
    ["SAP", "SAP"], ["SIE", "Siemens"], ["ALV", "Allianz"], ["DTE", "Deutsche Telekom"],
    ["MBG", "Mercedes-Benz Group"], ["BMW", "BMW"], ["BAS", "BASF"], ["BAYN", "Bayer"],
    ["ADS", "Adidas"], ["MUV2", "Münchener Rück"], ["DBK", "Deutsche Bank"], ["RWE", "RWE"],
    ["VOW3", "Volkswagen Pref"], ["IFX", "Infineon Technologies"], ["HEN3", "Henkel Pref"],
    ["DHL", "DHL Group"], ["MRK", "Merck KGaA"], ["EOAN", "E.ON"], ["ZAL", "Zalando"],
    ["P911", "Porsche AG"], ["SHL", "Siemens Healthineers"], ["VNA", "Vonovia"],
    ["BEI", "Beiersdorf"], ["DB1", "Deutsche Börse"],
  ]),

  ...list("FR_EPA", "EUR", [
    ["MC", "LVMH"], ["OR", "L'Oréal"], ["TTE", "TotalEnergies"], ["SAN", "Sanofi"],
    ["AIR", "Airbus"], ["SU", "Schneider Electric"], ["BNP", "BNP Paribas"],
    ["AI", "Air Liquide"], ["EL", "EssilorLuxottica"], ["DG", "Vinci"], ["CS", "AXA"],
    ["RMS", "Hermès International"], ["KER", "Kering"], ["SGO", "Saint-Gobain"],
    ["CAP", "Capgemini"], ["ACA", "Crédit Agricole"], ["VIE", "Veolia"], ["ORA", "Orange"],
    ["STLAP", "Stellantis"], ["RI", "Pernod Ricard"], ["BN", "Danone"], ["ML", "Michelin"],
    ["PUB", "Publicis Groupe"], ["LR", "Legrand"], ["ENGI", "Engie"],
  ]),

  ...list("CH_SIX", "CHF", [
    ["NESN", "Nestlé"], ["NOVN", "Novartis"], ["RO", "Roche Holding"],
    ["ZURN", "Zurich Insurance"], ["UBSG", "UBS Group"], ["ABBN", "ABB Ltd"],
    ["CFR", "Richemont"], ["SIKA", "Sika"], ["LONN", "Lonza Group"], ["GIVN", "Givaudan"],
    ["SGSN", "SGS"], ["HOLN", "Holcim"], ["SCMN", "Swisscom"], ["GEBN", "Geberit"],
    ["SREN", "Swiss Re"], ["ALC", "Alcon"], ["PGHN", "Partners Group"],
    ["BAER", "Julius Bär"], ["STMN", "Straumann"], ["KNIN", "Kühne+Nagel"],
  ]),

  ...list("NL_AMS", "EUR", [
    ["ASML", "ASML Holding"], ["INGA", "ING Groep"], ["AD", "Ahold Delhaize"],
    ["PHIA", "Philips"], ["HEIA", "Heineken"], ["WKL", "Wolters Kluwer"],
    ["AKZA", "Akzo Nobel"], ["DSFIR", "DSM-Firmenich"], ["RAND", "Randstad"], ["KPN", "KPN"],
    ["ASM", "ASM International"], ["BESI", "BE Semiconductor"], ["AGN", "Aegon"],
    ["NN", "NN Group"], ["IMCD", "IMCD"], ["ADYEN", "Adyen"], ["PRX", "Prosus"],
    ["UMG", "Universal Music Group"], ["ABN", "ABN AMRO"],
  ]),

  ...list("ES_BME", "EUR", [
    ["ITX", "Inditex"], ["IBE", "Iberdrola"], ["SAN", "Banco Santander"], ["BBVA", "BBVA"],
    ["AENA", "Aena"], ["TEF", "Telefónica"], ["REP", "Repsol"], ["FER", "Ferrovial"],
    ["AMS", "Amadeus IT Group"], ["CLNX", "Cellnex Telecom"], ["ELE", "Endesa"], ["ACS", "ACS"],
    ["GRF", "Grifols"], ["RED", "Redeia"], ["MAP", "Mapfre"],
  ]),

  ...list("IT_MIL", "EUR", [
    ["ENEL", "Enel"], ["ISP", "Intesa Sanpaolo"], ["ENI", "Eni"], ["UCG", "UniCredit"],
    ["RACE", "Ferrari"], ["G", "Assicurazioni Generali"], ["PRY", "Prysmian"],
    ["MONC", "Moncler"], ["TIT", "Telecom Italia"], ["MB", "Mediobanca"], ["TRN", "Terna"],
    ["SRG", "Snam"], ["BAMI", "Banco BPM"], ["PST", "Poste Italiane"], ["LDO", "Leonardo"],
    ["CPR", "Davide Campari-Milano"],
  ]),

  // Tokyo quotes by four-digit code rather than letters; the name is what
  // the pick editor searches on.
  ...list("JP_TSE", "JPY", [
    ["7203", "Toyota Motor"], ["6758", "Sony Group"], ["8306", "Mitsubishi UFJ Financial"],
    ["9984", "SoftBank Group"], ["6861", "Keyence"], ["7974", "Nintendo"],
    ["8035", "Tokyo Electron"], ["4063", "Shin-Etsu Chemical"], ["9432", "NTT"],
    ["6098", "Recruit Holdings"], ["8058", "Mitsubishi Corporation"], ["6501", "Hitachi"],
    ["4502", "Takeda Pharmaceutical"], ["7267", "Honda Motor"], ["6902", "Denso"],
    ["8001", "Itochu"], ["9433", "KDDI"], ["6367", "Daikin Industries"],
    ["4568", "Daiichi Sankyo"], ["8316", "Sumitomo Mitsui Financial"],
  ]),

  ...list("AU_ASX", "AUD", [
    ["BHP", "BHP Group"], ["CBA", "Commonwealth Bank of Australia"], ["CSL", "CSL"],
    ["NAB", "National Australia Bank"], ["WBC", "Westpac Banking"], ["ANZ", "ANZ Group"],
    ["WES", "Wesfarmers"], ["MQG", "Macquarie Group"], ["WOW", "Woolworths Group"],
    ["TLS", "Telstra Group"], ["RIO", "Rio Tinto"], ["FMG", "Fortescue"],
    ["ALL", "Aristocrat Leisure"], ["WDS", "Woodside Energy"], ["COL", "Coles Group"],
    ["STO", "Santos"], ["QAN", "Qantas Airways"], ["REA", "REA Group"],
  ]),

  // Priced alongside the picks for comparison, never pickable.
];

/** Stable Firestore document id for an instrument. */
export function instrumentId(marketCode: string, symbol: string): string {
  return `${marketCode}_${symbol.replace(/[^A-Za-z0-9]+/g, "-")}`;
}
