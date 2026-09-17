/**
 * The pickable universe.
 *
 * MARKETS covers every Nordic list plus the main North American and UK
 * exchanges. Disable a market in the admin panel to close it.
 *
 * INSTRUMENTS seeds established companies only, and only where the
 * listing is unambiguous. The Nordic growth lists (First North,
 * Spotlight, NGM, Nordic SME) and the Mid/Small Cap segments are seeded
 * EMPTY on purpose: segment membership is reshuffled every year, so
 * rather than guess, add those names from the admin panel. Nothing can
 * be picked that is not in this collection.
 */

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
  isBenchmark?: boolean;
};

export const MARKETS: MarketSeed[] = [
  { code: "SE_LARGE", name: "Large Cap Stockholm", country: "Sweden", region: "Nordics", currency: "SEK", sortOrder: 10 },
  { code: "SE_MID", name: "Mid Cap Stockholm", country: "Sweden", region: "Nordics", currency: "SEK", sortOrder: 11 },
  { code: "SE_SMALL", name: "Small Cap Stockholm", country: "Sweden", region: "Nordics", currency: "SEK", sortOrder: 12 },
  { code: "SE_FN", name: "First North", country: "Sweden", region: "Nordics", currency: "SEK", sortOrder: 13 },
  { code: "SE_SPOT", name: "Spotlight", country: "Sweden", region: "Nordics", currency: "SEK", sortOrder: 14 },
  { code: "SE_NGM", name: "NGM", country: "Sweden", region: "Nordics", currency: "SEK", sortOrder: 15 },
  { code: "SE_NGMPEP", name: "NGM PepMarket", country: "Sweden", region: "Nordics", currency: "SEK", sortOrder: 16 },
  { code: "SE_SME", name: "Nordic SME Sweden", country: "Sweden", region: "Nordics", currency: "SEK", sortOrder: 17 },

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
];

function list(marketCode: string, currency: string, rows: [string, string][]): InstrumentSeed[] {
  return rows.map(([symbol, name]) => ({ symbol, name, marketCode, currency }));
}

export const INSTRUMENTS: InstrumentSeed[] = [
  ...list("SE_LARGE", "SEK", [
    ["ABB", "ABB"], ["AAK", "AAK"], ["ADDT B", "Addtech B"], ["ALFA", "Alfa Laval"],
    ["ASSA B", "Assa Abloy B"], ["ATCO A", "Atlas Copco A"], ["ATCO B", "Atlas Copco B"],
    ["AXFO", "Axfood"], ["AZN", "AstraZeneca"], ["BEIJ B", "Beijer Ref B"], ["BOL", "Boliden"],
    ["CAST", "Castellum"], ["DOM", "Dometic Group"], ["ELUX B", "Electrolux B"],
    ["EPI A", "Epiroc A"], ["EPI B", "Epiroc B"], ["EQT", "EQT"], ["ERIC B", "Ericsson B"],
    ["ESSITY B", "Essity B"], ["EVO", "Evolution"], ["FABG", "Fabege"], ["GETI B", "Getinge B"],
    ["HEXA B", "Hexagon B"], ["HM B", "H&M B"], ["HOLM B", "Holmen B"], ["HUSQ B", "Husqvarna B"],
    ["INDT", "Indutrade"], ["INDU C", "Industrivärden C"], ["INVE B", "Investor B"],
    ["KINV B", "Kinnevik B"], ["LATO B", "Investment AB Latour B"], ["LIFCO B", "Lifco B"],
    ["LOOMIS", "Loomis"], ["NCC B", "NCC B"], ["NDA SE", "Nordea Bank"],
    ["NIBE B", "Nibe Industrier B"], ["PEAB B", "Peab B"], ["SAAB B", "Saab B"],
    ["SAGA B", "Sagax B"], ["SAND", "Sandvik"], ["SCA B", "SCA B"], ["SEB A", "SEB A"],
    ["SECU B", "Securitas B"], ["SHB A", "Handelsbanken A"], ["SKA B", "Skanska B"],
    ["SKF B", "SKF B"], ["SOBI", "Swedish Orphan Biovitrum"], ["SSAB B", "SSAB B"],
    ["SWEC B", "Sweco B"], ["SWED A", "Swedbank A"], ["TEL2 B", "Tele2 B"],
    ["TELIA", "Telia Company"], ["THULE", "Thule Group"], ["TREL B", "Trelleborg B"],
    ["VOLCAR B", "Volvo Car B"], ["VOLV B", "Volvo B"],
  ]),

  ...list("FI_LARGE", "EUR", [
    ["ELISA", "Elisa"], ["FORTUM", "Fortum"], ["KESKOB", "Kesko B"], ["KNEBV", "Kone B"],
    ["METSO", "Metso"], ["NESTE", "Neste"], ["NOKIA", "Nokia"], ["ORNBV", "Orion B"],
    ["SAMPO", "Sampo A"], ["STERV", "Stora Enso R"], ["TYRES", "Nokian Tyres"],
    ["UPM", "UPM-Kymmene"], ["WRT1V", "Wärtsilä B"],
  ]),

  ...list("DK_LARGE", "DKK", [
    ["AMBU B", "Ambu B"], ["CARL B", "Carlsberg B"], ["COLO B", "Coloplast B"],
    ["DEMANT", "Demant"], ["DSV", "DSV"], ["GMAB", "Genmab"],
    ["MAERSK B", "A.P. Møller-Mærsk B"], ["NOVO B", "Novo Nordisk B"], ["NSIS B", "Novonesis B"],
    ["ORSTED", "Ørsted"], ["PNDORA", "Pandora"], ["RBREW", "Royal Unibrew"], ["TRYG", "Tryg"],
    ["VWS", "Vestas Wind Systems"],
  ]),

  ...list("NO_OSE", "NOK", [
    ["AKER", "Aker"], ["AKRBP", "Aker BP"], ["DNB", "DNB Bank"], ["EQNR", "Equinor"],
    ["FRO", "Frontline"], ["GJF", "Gjensidige Forsikring"], ["KOG", "Kongsberg Gruppen"],
    ["MOWI", "Mowi"], ["NHY", "Norsk Hydro"], ["ORK", "Orkla"], ["SALM", "SalMar"],
    ["SCHA", "Schibsted A"], ["STB", "Storebrand"], ["SUBC", "Subsea 7"], ["TEL", "Telenor"],
    ["TOM", "Tomra Systems"], ["YAR", "Yara International"],
  ]),

  ...list("IS_LARGE", "ISK", [
    ["ARION", "Arion banki"], ["BRIM", "Brim"], ["EIM", "Eimskip"], ["FESTI", "Festi"],
    ["HAGA", "Hagar"], ["ICEAIR", "Icelandair Group"], ["KVIKA", "Kvika banki"],
    ["SIMINN", "Síminn"], ["SJOVA", "Sjóvá-Almennar"],
  ]),

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
    ["MSFT", "Microsoft"], ["MU", "Micron Technology"], ["NFLX", "Netflix"], ["NVDA", "NVIDIA"],
    ["ODFL", "Old Dominion Freight Line"], ["ORLY", "O'Reilly Automotive"],
    ["PANW", "Palo Alto Networks"], ["PCAR", "PACCAR"], ["PEP", "PepsiCo"],
    ["PLTR", "Palantir Technologies A"], ["PYPL", "PayPal Holdings"], ["QCOM", "Qualcomm"],
    ["REGN", "Regeneron Pharmaceuticals"], ["SBUX", "Starbucks"], ["SNPS", "Synopsys"],
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

  // Priced alongside the picks for comparison, never pickable.
  { symbol: "OMXS30", name: "OMX Stockholm 30", marketCode: "SE_LARGE", currency: "SEK", isBenchmark: true },
  { symbol: "SPX", name: "S&P 500", marketCode: "US_NYSE", currency: "USD", isBenchmark: true },
];

/** Stable Firestore document id for an instrument. */
export function instrumentId(marketCode: string, symbol: string): string {
  return `${marketCode}_${symbol.replace(/[^A-Za-z0-9]+/g, "-")}`;
}
