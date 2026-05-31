/**
 * data/stocks.js
 *
 * Master list of tradeable symbols.
 * Add or remove entries here to change what appears in the Market tab.
 *
 * Fields:
 *   sym    — ticker symbol (must match Yahoo Finance exactly)
 *   name   — display name
 *   sector — used for the sector filter buttons
 */

const STOCK_LIST = [
  // ── Technology ──────────────────────────────────────────────
  { sym: 'AAPL',  name: 'Apple Inc.',              sector: 'Tech' },
  { sym: 'MSFT',  name: 'Microsoft Corp.',         sector: 'Tech' },
  { sym: 'GOOGL', name: 'Alphabet Inc.',           sector: 'Tech' },
  { sym: 'AMZN',  name: 'Amazon.com Inc.',         sector: 'Tech' },
  { sym: 'NVDA',  name: 'NVIDIA Corp.',            sector: 'Tech' },
  { sym: 'META',  name: 'Meta Platforms',          sector: 'Tech' },
  { sym: 'AMD',   name: 'Advanced Micro Devices',  sector: 'Tech' },
  { sym: 'INTC',  name: 'Intel Corp.',             sector: 'Tech' },
  { sym: 'CRM',   name: 'Salesforce Inc.',         sector: 'Tech' },
  { sym: 'ADBE',  name: 'Adobe Inc.',              sector: 'Tech' },
  { sym: 'ORCL',  name: 'Oracle Corp.',            sector: 'Tech' },
  { sym: 'QCOM',  name: 'Qualcomm Inc.',           sector: 'Tech' },
  { sym: 'AVGO',  name: 'Broadcom Inc.',           sector: 'Tech' },
  { sym: 'TXN',   name: 'Texas Instruments',       sector: 'Tech' },
  { sym: 'IBM',   name: 'IBM Corp.',               sector: 'Tech' },

  // ── EV / Auto ───────────────────────────────────────────────
  { sym: 'TSLA',  name: 'Tesla Inc.',              sector: 'EV/Auto' },
  { sym: 'F',     name: 'Ford Motor Co.',          sector: 'EV/Auto' },
  { sym: 'GM',    name: 'General Motors',          sector: 'EV/Auto' },
  { sym: 'RIVN',  name: 'Rivian Automotive',       sector: 'EV/Auto' },
  { sym: 'LCID',  name: 'Lucid Group',             sector: 'EV/Auto' },

  // ── Media / Entertainment ────────────────────────────────────
  { sym: 'NFLX',  name: 'Netflix Inc.',            sector: 'Media' },
  { sym: 'DIS',   name: 'Walt Disney Co.',         sector: 'Media' },
  { sym: 'SPOT',  name: 'Spotify Technology',      sector: 'Media' },
  { sym: 'SNAP',  name: 'Snap Inc.',               sector: 'Media' },
  { sym: 'PARA',  name: 'Paramount Global',        sector: 'Media' },
  { sym: 'WBD',   name: 'Warner Bros. Discovery',  sector: 'Media' },

  // ── Finance ──────────────────────────────────────────────────
  { sym: 'JPM',   name: 'JPMorgan Chase',          sector: 'Finance' },
  { sym: 'BAC',   name: 'Bank of America',         sector: 'Finance' },
  { sym: 'GS',    name: 'Goldman Sachs',           sector: 'Finance' },
  { sym: 'MS',    name: 'Morgan Stanley',          sector: 'Finance' },
  { sym: 'V',     name: 'Visa Inc.',               sector: 'Finance' },
  { sym: 'MA',    name: 'Mastercard Inc.',         sector: 'Finance' },
  { sym: 'BRK-B', name: 'Berkshire Hathaway B',   sector: 'Finance' },
  { sym: 'PYPL',  name: 'PayPal Holdings',         sector: 'Finance' },
  { sym: 'AXP',   name: 'American Express',        sector: 'Finance' },

  // ── Retail ───────────────────────────────────────────────────
  { sym: 'WMT',   name: 'Walmart Inc.',            sector: 'Retail' },
  { sym: 'COST',  name: 'Costco Wholesale',        sector: 'Retail' },
  { sym: 'TGT',   name: 'Target Corp.',            sector: 'Retail' },
  { sym: 'HD',    name: 'Home Depot Inc.',         sector: 'Retail' },
  { sym: 'LOW',   name: 'Lowe\'s Cos.',            sector: 'Retail' },
  { sym: 'NKE',   name: 'Nike Inc.',               sector: 'Retail' },

  // ── Healthcare ───────────────────────────────────────────────
  { sym: 'JNJ',   name: 'Johnson & Johnson',       sector: 'Healthcare' },
  { sym: 'PFE',   name: 'Pfizer Inc.',             sector: 'Healthcare' },
  { sym: 'MRNA',  name: 'Moderna Inc.',            sector: 'Healthcare' },
  { sym: 'UNH',   name: 'UnitedHealth Group',      sector: 'Healthcare' },
  { sym: 'ABBV',  name: 'AbbVie Inc.',             sector: 'Healthcare' },
  { sym: 'BMY',   name: 'Bristol-Myers Squibb',    sector: 'Healthcare' },
  { sym: 'LLY',   name: 'Eli Lilly & Co.',        sector: 'Healthcare' },

  // ── Energy ───────────────────────────────────────────────────
  { sym: 'XOM',   name: 'Exxon Mobil Corp.',       sector: 'Energy' },
  { sym: 'CVX',   name: 'Chevron Corp.',           sector: 'Energy' },
  { sym: 'COP',   name: 'ConocoPhillips',          sector: 'Energy' },
  { sym: 'NEE',   name: 'NextEra Energy',          sector: 'Energy' },
  { sym: 'SLB',   name: 'SLB (Schlumberger)',      sector: 'Energy' },

  // ── Industrial ───────────────────────────────────────────────
  { sym: 'BA',    name: 'Boeing Co.',              sector: 'Industrial' },
  { sym: 'CAT',   name: 'Caterpillar Inc.',        sector: 'Industrial' },
  { sym: 'GE',    name: 'GE Aerospace',            sector: 'Industrial' },
  { sym: 'LMT',   name: 'Lockheed Martin',         sector: 'Industrial' },
  { sym: 'RTX',   name: 'RTX Corp.',               sector: 'Industrial' },
  { sym: 'HON',   name: 'Honeywell Intl.',         sector: 'Industrial' },
  { sym: 'UPS',   name: 'United Parcel Service',   sector: 'Industrial' },

  // ── Crypto-adjacent ──────────────────────────────────────────
  { sym: 'COIN',  name: 'Coinbase Global',         sector: 'Crypto' },
  { sym: 'MSTR',  name: 'MicroStrategy Inc.',      sector: 'Crypto' },
  { sym: 'HOOD',  name: 'Robinhood Markets',       sector: 'Crypto' },

  // ── ETFs ─────────────────────────────────────────────────────
  { sym: 'SPY',   name: 'SPDR S&P 500 ETF',        sector: 'ETF' },
  { sym: 'QQQ',   name: 'Invesco QQQ ETF',         sector: 'ETF' },
  { sym: 'IWM',   name: 'iShares Russell 2000',    sector: 'ETF' },
  { sym: 'VTI',   name: 'Vanguard Total Market',   sector: 'ETF' },
  { sym: 'GLD',   name: 'SPDR Gold Shares',        sector: 'ETF' },
  { sym: 'TLT',   name: 'iShares 20+ Yr Treasury', sector: 'ETF' },
  { sym: 'ARKK',  name: 'ARK Innovation ETF',      sector: 'ETF' },
];
