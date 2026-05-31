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
BATCH_SIZE       = 50              # symbols per yfinance batch

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


def build_stock_list() -> list[dict]:
    """
    Merge NASDAQ/NYSE tickers with S&P 500 sector data.
    Apply filters and return a clean, deduped list sorted by market cap.
    """
    print("\n[stocks] Fetching dynamic stock list…")
    raw      = fetch_nasdaq_nyse()
    sp500map = fetch_sp500_sectors()

    seen    = set()
    stocks  = []

    for entry in raw:
        sym  = (entry.get('symbol') or '').strip().upper().replace('.', '-')
        name = (entry.get('name')   or '').strip()
        # Clean up common name suffixes like "Common Stock", "Inc. Common Stock", etc.
        name = re.sub(r'\s+(Common Stock|Class [A-Z].*|Ordinary Shares.*)$', '', name, flags=re.I).strip()

        if not sym or not name:
            continue
        if not is_clean_symbol(sym):
            continue
        if sym in seen:
            continue

        # Market cap filter
        try:
            mktcap = float(entry.get('marketCap') or 0)
        except (ValueError, TypeError):
            mktcap = 0
        if mktcap < MIN_MARKET_CAP:
            continue

        # Sector — prefer S&P 500 GICS label, fall back to NASDAQ/NYSE sector
        if sym in sp500map:
            sector = sp500map[sym]
        else:
            raw_sector = entry.get('sector') or ''
            sector = normalise_sector(raw_sector)

        # Country filter — keep US and blank (most are US)
        country = (entry.get('country') or '').strip()
        if country and country.lower() not in ('united states', 'usa', 'us', ''):
            # Still include well-known foreign ADRs listed on US exchanges
            # by checking if they're in S&P 500; otherwise skip non-US
            if sym not in sp500map:
                continue

        seen.add(sym)
        stocks.append({
            'sym':       sym,
            'name':      name,
            'sector':    sector,
            'marketCap': mktcap,
        })

    # Sort by market cap descending (biggest companies first in the UI)
    stocks.sort(key=lambda s: s['marketCap'], reverse=True)

    # Strip marketCap from the final output (front-end doesn't need it for the list)
    result = [{'sym': s['sym'], 'name': s['name'], 'sector': s['sector']} for s in stocks]

    print(f"[stocks] Final list: {len(result):,} stocks across "
          f"{len(set(s['sector'] for s in result))} sectors\n")
    return result


# ── Global stock list (built once at startup) ─────────────────────────────────

STOCK_LIST: list[dict] = []   # populated in main()


# ── Quote cache ───────────────────────────────────────────────────────────────

_quote_cache:   dict = {}
_history_cache: dict = {}
_cache_lock          = threading.Lock()


def get_quotes(symbols: list[str]) -> dict:
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

    # Batch into groups for yfinance
    for i in range(0, len(need), BATCH_SIZE):
        batch = need[i : i + BATCH_SIZE]
        try:
            tickers = yf.Tickers(' '.join(batch))
            for sym in batch:
                try:
                    fi = tickers.tickers[sym].fast_info
                    price     = float(fi.last_price     or 0)
                    prev      = float(fi.previous_close or 0)
                    data = {
                        'price':     round(price, 4),
                        'prevClose': round(prev,  4),
                        'change':    round(price - prev, 4),
                        'changePct': round((price - prev) / prev * 100 if prev else 0, 4),
                        'volume':    int(fi.three_month_average_volume or 0),
                        'marketCap': int(fi.market_cap or 0),
                    }
                    result[sym] = data
                    with _cache_lock:
                        _quote_cache[sym] = {'ts': now, 'data': data}
                except Exception as e:
                    print(f'  [warn] quote {sym}: {e}')
                    result[sym] = {'price': 0, 'change': 0, 'changePct': 0,
                                   'prevClose': 0, 'volume': 0, 'marketCap': 0}
        except Exception as e:
            print(f'[quotes] batch error: {e}')

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


# ── HTTP handler ──────────────────────────────────────────────────────────────

class Handler(SimpleHTTPRequestHandler):

    def log_message(self, fmt, *args):
        if '/api/' in args[0]:
            print(f'  API  {args[0]}  →  {args[1]}')

    def do_GET(self):
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
    print(f"""
  ╔══════════════════════════════════════════════════════╗
  ║              PaperTrade local server                 ║
  ║  {len(STOCK_LIST):,} stocks loaded — http://localhost:{PORT}      ║
  ╚══════════════════════════════════════════════════════╝

  Stock list refreshes on every server restart.
  Press Ctrl+C to stop.
""")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print('\nStopped.')
