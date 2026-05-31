#!/usr/bin/env python3
"""
PaperTrade — local server
Run:  python server.py
Open: http://localhost:5500

What this does:
  1. On startup, fetches the full list of US-listed stocks dynamically from
     GitHub-hosted NASDAQ/NYSE data (no API key needed).
  2. Serves the static front-end files.
  3. Exposes two API endpoints the browser uses for live market data:
       GET /api/stocks            — full stock list (sym, name, sector, marketCap)
       GET /api/quotes?symbols=.. — live prices via yfinance
       GET /api/history?symbol=.. — OHLC history via yfinance

Stock list sources (fetched fresh on every server start):
  - NYSE full tickers  (GitHub: rreichel3/US-Stock-Symbols)
  - NASDAQ full tickers (same repo)
  - S&P 500 constituents with GICS sectors (GitHub: datasets/s-and-p-500-companies)

Filters applied to the raw lists:
  - US-listed only
  - Market cap > $100M  (filters out shells, SPACs, micro-caps)
  - No warrant/rights/unit symbols (no W, R, U suffixes)
  - Deduped by symbol

Result: ~2,000–3,000 real, tradeable US stocks with proper names and sectors.
"""

import json
import time
import threading
import os
import re
import csv
from io import StringIO
from http.server import HTTPServer, SimpleHTTPRequestHandler
from urllib.parse import urlparse, parse_qs

try:
    import requests
except ImportError:
    raise SystemExit("Missing: pip install requests")

try:
    import yfinance as yf
except ImportError:
    raise SystemExit("Missing: pip install yfinance")

# ── Config ────────────────────────────────────────────────────────────────────

PORT             = 5500
MIN_MARKET_CAP   = 100_000_000     # $100M — filters out shells and micro-caps
QUOTE_TTL        = 60              # seconds to cache live quotes
HISTORY_TTL      = 300             # seconds to cache history data
BATCH_SIZE       = 100             # symbols per yfinance download batch
BATCH_DELAY      = 1.5            # seconds between batches to avoid rate limits
CACHE_FILE       = 'stock_list_cache.json'
CACHE_MAX_AGE    = 86_400          # seconds — refresh from network after 24 hours

HEADERS = {
    'User-Agent': (
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) '
        'AppleWebKit/537.36 (KHTML, like Gecko) '
        'Chrome/124.0.0.0 Safari/537.36'
    )
}

# ── Sector normalisation ──────────────────────────────────────────────────────
# Maps the various sector names used across data sources → clean display names

SECTOR_MAP = {
    # NASDAQ/NYSE source names
    'Technology':           'Tech',
    'Finance':              'Finance',
    'Health Care':          'Healthcare',
    'Consumer Discretionary': 'Consumer',
    'Consumer Staples':     'Staples',
    'Industrials':          'Industrial',
    'Basic Materials':      'Materials',
    'Real Estate':          'Real Estate',
    'Energy':               'Energy',
    'Utilities':            'Utilities',
    'Telecommunications':   'Telecom',
    'Miscellaneous':        'Other',
    # GICS sector names (S&P 500 source)
    'Information Technology':   'Tech',
    'Financials':               'Finance',
    'Communication Services':   'Telecom',
    'Materials':                'Materials',
}

def normalise_sector(raw: str) -> str:
    return SECTOR_MAP.get(raw.strip(), raw.strip() or 'Other')


# ── Symbol filtering ──────────────────────────────────────────────────────────

# Warrant, rights, unit suffixes — not tradeable as regular stocks
_BAD_SUFFIX = re.compile(r'(W|WS|WSA|WSB|R|RA|RB|U|UN|UNA|UNB)$')
# Only allow standard ticker characters
_VALID_SYM   = re.compile(r'^[A-Z]{1,5}(-[A-Z])?$')

def is_clean_symbol(sym: str) -> bool:
    if not sym or not _VALID_SYM.match(sym):
        return False
    if _BAD_SUFFIX.search(sym):
        return False
    return True


# ── Stock list fetching ───────────────────────────────────────────────────────

def fetch_nasdaq_nyse() -> list[dict]:
    """
    Pull NASDAQ + NYSE full ticker lists from GitHub.
    Each entry has: symbol, name, sector, marketCap
    """
    urls = [
        'https://raw.githubusercontent.com/rreichel3/US-Stock-Symbols/main/nasdaq/nasdaq_full_tickers.json',
        'https://raw.githubusercontent.com/rreichel3/US-Stock-Symbols/main/nyse/nyse_full_tickers.json',
    ]
    combined = []
    for url in urls:
        try:
            r = requests.get(url, headers=HEADERS, timeout=15)
            r.raise_for_status()
            data = r.json()
            combined.extend(data)
            print(f"  fetched {len(data):,} entries from {url.split('/')[-1]}")
        except Exception as e:
            print(f"  [warn] could not fetch {url}: {e}")
    return combined


def fetch_sp500_sectors() -> dict[str, str]:
    """
    Fetch S&P 500 constituents CSV from GitHub for accurate GICS sector labels.
    Returns { symbol: sector_name }
    """
    url = 'https://raw.githubusercontent.com/datasets/s-and-p-500-companies/main/data/constituents.csv'
    try:
        r = requests.get(url, headers=HEADERS, timeout=10)
        r.raise_for_status()
        reader = csv.DictReader(StringIO(r.text))
        mapping = {}
        for row in reader:
            sym = row.get('Symbol', '').strip().replace('.', '-')
            sec = row.get('GICS Sector', '').strip()
            if sym and sec:
                mapping[sym] = normalise_sector(sec)
        print(f"  fetched {len(mapping):,} S&P 500 sector mappings")
        return mapping
    except Exception as e:
        print(f"  [warn] could not fetch S&P 500 sectors: {e}")
        return {}


def _build_from_network() -> list[dict]:
    """Fetch fresh stock list from GitHub sources and return the filtered list."""
    print("\n[stocks] Fetching dynamic stock list…")
    raw      = fetch_nasdaq_nyse()
    sp500map = fetch_sp500_sectors()

    seen   = set()
    stocks = []

    for entry in raw:
        sym  = (entry.get('symbol') or '').strip().upper().replace('.', '-')
        name = (entry.get('name')   or '').strip()
        name = re.sub(r'\s+(Common Stock|Class [A-Z].*|Ordinary Shares.*)$', '', name, flags=re.I).strip()

        if not sym or not name:
            continue
        if not is_clean_symbol(sym):
            continue
        if sym in seen:
            continue

        try:
            mktcap = float(entry.get('marketCap') or 0)
        except (ValueError, TypeError):
            mktcap = 0
        if mktcap < MIN_MARKET_CAP:
            continue

        if sym in sp500map:
            sector = sp500map[sym]
        else:
            raw_sector = entry.get('sector') or ''
            sector = normalise_sector(raw_sector)

        country = (entry.get('country') or '').strip()
        if country and country.lower() not in ('united states', 'usa', 'us', ''):
            if sym not in sp500map:
                continue

        seen.add(sym)
        stocks.append({'sym': sym, 'name': name, 'sector': sector, 'marketCap': mktcap})

    stocks.sort(key=lambda s: s['marketCap'], reverse=True)
    result = [{'sym': s['sym'], 'name': s['name'], 'sector': s['sector']} for s in stocks]
    print(f"[stocks] Built {len(result):,} stocks across "
          f"{len(set(s['sector'] for s in result))} sectors")
    return result


def build_stock_list() -> list[dict]:
    """
    Return the stock list, loading from disk cache if it's fresh enough.
    Cache lives in stock_list_cache.json next to server.py.
    Force a refresh by deleting that file or passing --refresh on the command line.
    """
    force_refresh = '--refresh' in __import__('sys').argv

    # Try loading from cache first
    if not force_refresh and os.path.exists(CACHE_FILE):
        age = time.time() - os.path.getmtime(CACHE_FILE)
        if age < CACHE_MAX_AGE:
            try:
                with open(CACHE_FILE, 'r', encoding='utf-8') as f:
                    cached = json.load(f)
                if cached:
                    age_min = int(age // 60)
                    print(f"\n[stocks] Loaded {len(cached):,} stocks from cache "
                          f"(age: {age_min}m — next refresh in {int((CACHE_MAX_AGE - age) // 60)}m)")
                    print("         Run with --refresh to force a fresh download.\n")
                    return cached
            except Exception as e:
                print(f"[stocks] Cache read failed ({e}), fetching fresh…")

    # Fetch from network and save to cache
    result = _build_from_network()
    try:
        with open(CACHE_FILE, 'w', encoding='utf-8') as f:
            json.dump(result, f)
        print(f"[stocks] Saved to cache → {CACHE_FILE}\n")
    except Exception as e:
        print(f"[stocks] Could not write cache: {e}\n")
    return result


# ── Global stock list (built once at startup) ─────────────────────────────────

STOCK_LIST: list[dict] = []   # populated in main()


# ── Quote cache ───────────────────────────────────────────────────────────────

_quote_cache:   dict = {}
_history_cache: dict = {}
_movers_cache:  dict = {}   # keyed by period
_cache_lock          = threading.Lock()


def get_quotes(symbols: list[str]) -> dict:
    """
    Fetch live quotes using yf.download() — one HTTP request per batch of up to
    BATCH_SIZE symbols, rather than one request per ticker (which triggers rate limits).

    yf.download() with period='1d' interval='1d' returns today's OHLC bar for
    every symbol in a single call. We pull Close as the current price and
    compare to the previous bar's Close for change/changePct.
    """
    now    = time.time()
    result = {}
    need   = []

    with _cache_lock:
        for sym in symbols:
            entry = _quote_cache.get(sym)
            if entry and (now - entry['ts']) < QUOTE_TTL:
                result[sym] = entry['data']
            else:
                need.append(sym)

    if not need:
        return result

    for i in range(0, len(need), BATCH_SIZE):
        batch = need[i : i + BATCH_SIZE]
        if i > 0:
            time.sleep(BATCH_DELAY)   # be polite between batches

        try:
            # Download 5 days so we always have a previous-day close even on Mondays
            df = yf.download(
                ' '.join(batch),
                period='5d',
                interval='1d',
                progress=False,
                auto_adjust=True,
                group_by='ticker',   # multi-ticker: df[sym]['Close']
            )

            for sym in batch:
                try:
                    # Multi-ticker download nests columns under the symbol name.
                    # Single-ticker download is flat — handle both cases.
                    if len(batch) == 1:
                        closes = df['Close'].dropna()
                    else:
                        closes = df[sym]['Close'].dropna()

                    if len(closes) < 1:
                        raise ValueError('no data')

                    price = float(closes.iloc[-1])
                    prev  = float(closes.iloc[-2]) if len(closes) >= 2 else price

                    data = {
                        'price':     round(price, 4),
                        'prevClose': round(prev,  4),
                        'change':    round(price - prev, 4),
                        'changePct': round((price - prev) / prev * 100 if prev else 0, 4),
                        'volume':    0,   # not critical; omitted to keep requests lean
                        'marketCap': 0,
                    }
                    result[sym] = data
                    with _cache_lock:
                        _quote_cache[sym] = {'ts': now, 'data': data}

                except Exception as e:
                    result[sym] = {'price': 0, 'change': 0, 'changePct': 0,
                                   'prevClose': 0, 'volume': 0, 'marketCap': 0}

        except Exception as e:
            print(f'[quotes] batch error: {e}')
            for sym in batch:
                result[sym] = {'price': 0, 'change': 0, 'changePct': 0,
                               'prevClose': 0, 'volume': 0, 'marketCap': 0}

    return result


def get_history(symbol: str, period: str, interval: str) -> list:
    now       = time.time()
    cache_key = f'{symbol}_{period}_{interval}'

    with _cache_lock:
        entry = _history_cache.get(cache_key)
        if entry and (now - entry['ts']) < HISTORY_TTL:
            return entry['data']

    try:
        df = yf.download(symbol, period=period, interval=interval,
                         progress=False, auto_adjust=True)
        if df.empty:
            return []

        points = []
        for ts, row in df.iterrows():
            close = row['Close']
            if hasattr(close, 'item'):
                close = close.item()
            if close and close == close:   # skip NaN
                points.append({'t': int(ts.timestamp() * 1000), 'p': round(float(close), 4)})

        with _cache_lock:
            _history_cache[cache_key] = {'ts': now, 'data': points}

        return points
    except Exception as e:
        print(f'[history] {symbol} {period}/{interval}: {e}')
        return []



def get_movers(period: str, limit: int, direction: str) -> list:
    """
    Return the top `limit` gainers or losers over `period`.
    direction: 'up' | 'down'

    Strategy: download daily bars for all stocks in STOCK_LIST over the
    requested period in large batches, compute pct change from first to
    last close, sort, and return top N.

    Results are cached per period for HISTORY_TTL seconds since this
    call is expensive (downloads ~3000 tickers worth of data).
    """
    now       = time.time()
    cache_key = period

    with _cache_lock:
        entry = _movers_cache.get(cache_key)
        if entry and (now - entry["ts"]) < HISTORY_TTL:
            ranked = entry["data"]
            if direction == "up":
                return ranked[:limit]
            else:
                return list(reversed(ranked))[:limit]

    print(f"[movers] Computing movers for period={period}…")

    # Map UI period labels to yfinance period/interval
    PERIOD_MAP = {
        "1d":  ("2d",  "1d"),
        "5d":  ("5d",  "1d"),
        "1mo": ("1mo", "1d"),
        "3mo": ("3mo", "1d"),
        "6mo": ("6mo", "1d"),
        "1y":  ("1y",  "1wk"),
    }
    yf_period, yf_interval = PERIOD_MAP.get(period, ("5d", "1d"))

    symbols = [s["sym"] for s in STOCK_LIST]
    results = []
    BATCH   = 200

    for i in range(0, len(symbols), BATCH):
        batch = symbols[i : i + BATCH]
        if i > 0:
            time.sleep(BATCH_DELAY)
        try:
            df = yf.download(
                " ".join(batch),
                period=yf_period,
                interval=yf_interval,
                progress=False,
                auto_adjust=True,
                group_by="ticker",
            )
            for sym in batch:
                try:
                    closes = (df[sym]["Close"] if len(batch) > 1 else df["Close"]).dropna()
                    if len(closes) < 2:
                        continue
                    first = float(closes.iloc[0])
                    last  = float(closes.iloc[-1])
                    if first <= 0:
                        continue
                    pct = (last - first) / first * 100
                    stock_info = next((s for s in STOCK_LIST if s["sym"] == sym), {})
                    results.append({
                        "sym":       sym,
                        "name":      stock_info.get("name", sym),
                        "sector":    stock_info.get("sector", ""),
                        "price":     round(last, 4),
                        "pctChange": round(pct, 4),
                        "absChange": round(last - first, 4),
                    })
                except Exception:
                    pass
        except Exception as e:
            print(f"[movers] batch error: {e}")

    # Sort ascending by pctChange (losers first, then gainers at end)
    results.sort(key=lambda x: x["pctChange"])

    with _cache_lock:
        _movers_cache[cache_key] = {"ts": now, "data": results}

    if direction == "up":
        return list(reversed(results))[:limit]
    else:
        return results[:limit]

# ── HTTP handler ──────────────────────────────────────────────────────────────

class Handler(SimpleHTTPRequestHandler):

    def log_message(self, fmt, *args):
        # args[0] may be an HTTPStatus enum on errors — guard with isinstance
        first = args[0] if args else ''
        if isinstance(first, str) and '/api/' in first:
            print(f'  API  {first}  →  {args[1] if len(args) > 1 else ""}')

    def do_GET(self):
        # Silence the favicon 404 noise
        if self.path == '/favicon.ico':
            self.send_response(204)
            self.end_headers()
            return

        parsed = urlparse(self.path)
        qs     = parse_qs(parsed.query)

        # GET /api/stocks  — full dynamic stock list
        if parsed.path == '/api/stocks':
            self._json(STOCK_LIST)
            return

        # GET /api/quotes?symbols=AAPL,MSFT,...
        if parsed.path == '/api/quotes':
            raw     = qs.get('symbols', [''])[0]
            symbols = [s.strip().upper() for s in raw.split(',') if s.strip()]
            if not symbols:
                self._json({'error': 'no symbols'}, 400)
                return
            self._json(get_quotes(symbols))
            return

        # GET /api/history?symbol=AAPL&period=1d&interval=5m
        if parsed.path == '/api/history':
            symbol   = qs.get('symbol',   [''])[0].strip().upper()
            period   = qs.get('period',   ['1d'])[0].strip()
            interval = qs.get('interval', ['5m'])[0].strip()
            if not symbol:
                self._json({'error': 'no symbol'}, 400)
                return
            points = get_history(symbol, period, interval)
            self._json({'symbol': symbol, 'points': points})
            return

        # GET /api/movers?period=5d&limit=20&direction=up
        if parsed.path == '/api/movers':
            period    = qs.get('period',    ['5d'])[0].strip()
            direction = qs.get('direction', ['up'])[0].strip()
            try:
                limit = min(int(qs.get('limit', ['25'])[0]), 100)
            except ValueError:
                limit = 25
            self._json(get_movers(period, limit, direction))
            return

        # Static files
        super().do_GET()

    def _json(self, obj, status=200):
        body = json.dumps(obj).encode()
        self.send_response(status)
        self.send_header('Content-Type',   'application/json')
        self.send_header('Content-Length', len(body))
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        self.wfile.write(body)


# ── Entry point ───────────────────────────────────────────────────────────────

if __name__ == '__main__':
    os.chdir(os.path.dirname(os.path.abspath(__file__)))

    # Build stock list before starting the server
    STOCK_LIST = build_stock_list()

    server = HTTPServer(('', PORT), Handler)
    pad = ' ' * max(0, 6 - len(str(len(STOCK_LIST))))
    print(f"""
  ╔══════════════════════════════════════════════════════╗
  ║              PaperTrade local server                 ║
  ║  {len(STOCK_LIST):,} stocks loaded{pad}→  http://localhost:{PORT}  ║
  ╚══════════════════════════════════════════════════════╝

  Prices auto-refresh every {QUOTE_TTL}s.  Stock list cached for {CACHE_MAX_AGE//3600}h.
  Force stock list refresh:  py server.py --refresh
  Press Ctrl+C to stop.
""")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print('\nStopped.')
