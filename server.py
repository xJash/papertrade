#!/usr/bin/env python3
"""
PaperTrade — local dev server
Run: python server.py
Then open: http://localhost:5500

Serves the static files AND proxies Yahoo Finance so the browser
never hits CORS issues. yfinance handles the Yahoo auth/cookie dance.
"""

import json
import time
import threading
from functools import lru_cache
from http.server import HTTPServer, SimpleHTTPRequestHandler
from urllib.parse import urlparse, parse_qs

try:
    import yfinance as yf
except ImportError:
    print("Missing dependency. Run:  pip install yfinance")
    raise

# ── In-memory quote cache (avoids hammering Yahoo on every card render) ──────
_quote_cache: dict = {}
_cache_lock  = threading.Lock()
QUOTE_TTL    = 60   # seconds before a cached quote is considered stale
HISTORY_TTL  = 300  # history data changes slowly, cache longer

_history_cache: dict = {}


def get_quotes(symbols: list[str]) -> dict:
    """
    Return live quote data for a list of symbols.
    Uses a 60-second in-process cache to avoid rate limiting.
    """
    now    = time.time()
    result = {}
    need   = []

    with _cache_lock:
        for sym in symbols:
            entry = _quote_cache.get(sym)
            if entry and (now - entry["ts"]) < QUOTE_TTL:
                result[sym] = entry["data"]
            else:
                need.append(sym)

    if not need:
        return result

    try:
        # yfinance batch download — fast_info gives price without full metadata call
        tickers = yf.Tickers(" ".join(need))
        for sym in need:
            try:
                t  = tickers.tickers[sym]
                fi = t.fast_info
                data = {
                    "price":     round(fi.last_price or 0, 4),
                    "prevClose": round(fi.previous_close or 0, 4),
                    "change":    round((fi.last_price or 0) - (fi.previous_close or 0), 4),
                    "changePct": round(
                        ((fi.last_price - fi.previous_close) / fi.previous_close * 100)
                        if fi.previous_close else 0, 4
                    ),
                    "volume":    int(fi.three_month_average_volume or 0),
                    "marketCap": int(fi.market_cap or 0),
                }
                result[sym] = data
                with _cache_lock:
                    _quote_cache[sym] = {"ts": now, "data": data}
            except Exception as e:
                print(f"  [warn] {sym}: {e}")
                result[sym] = {"price": 0, "change": 0, "changePct": 0,
                               "prevClose": 0, "volume": 0, "marketCap": 0}
    except Exception as e:
        print(f"[quotes] batch error: {e}")

    return result


def get_history(symbol: str, period: str, interval: str) -> list:
    """
    Return price history as [{t: ms_timestamp, p: close_price}, ...].
    Cached for HISTORY_TTL seconds.
    """
    now      = time.time()
    cache_key = f"{symbol}_{period}_{interval}"

    with _cache_lock:
        entry = _history_cache.get(cache_key)
        if entry and (now - entry["ts"]) < HISTORY_TTL:
            return entry["data"]

    try:
        df = yf.download(symbol, period=period, interval=interval,
                         progress=False, auto_adjust=True)
        if df.empty:
            return []

        points = []
        for ts, row in df.iterrows():
            close = row["Close"]
            if hasattr(close, "item"):
                close = close.item()
            if close and not (close != close):  # skip NaN
                points.append({
                    "t": int(ts.timestamp() * 1000),
                    "p": round(float(close), 4),
                })

        with _cache_lock:
            _history_cache[cache_key] = {"ts": now, "data": points}

        return points
    except Exception as e:
        print(f"[history] {symbol} {period}/{interval}: {e}")
        return []


# ── HTTP handler ──────────────────────────────────────────────────────────────

class Handler(SimpleHTTPRequestHandler):

    def log_message(self, fmt, *args):
        # Suppress noisy access log for static files; keep API calls visible
        if "/api/" in args[0]:
            print(f"  API  {args[0]}  {args[1]}")

    def do_GET(self):
        parsed = urlparse(self.path)

        # ── /api/quotes?symbols=AAPL,MSFT,... ───────────────────
        if parsed.path == "/api/quotes":
            qs      = parse_qs(parsed.query)
            raw     = qs.get("symbols", [""])[0]
            symbols = [s.strip() for s in raw.split(",") if s.strip()]

            if not symbols:
                self._json({"error": "no symbols"}, 400)
                return

            data = get_quotes(symbols)
            self._json(data)
            return

        # ── /api/history?symbol=AAPL&period=1d&interval=5m ──────
        if parsed.path == "/api/history":
            qs       = parse_qs(parsed.query)
            symbol   = qs.get("symbol",   [""])[0].strip().upper()
            period   = qs.get("period",   ["1d"])[0].strip()
            interval = qs.get("interval", ["5m"])[0].strip()

            if not symbol:
                self._json({"error": "no symbol"}, 400)
                return

            points = get_history(symbol, period, interval)
            self._json({"symbol": symbol, "points": points})
            return

        # ── Static files ─────────────────────────────────────────
        super().do_GET()

    def _json(self, obj, status=200):
        body = json.dumps(obj).encode()
        self.send_response(status)
        self.send_header("Content-Type",  "application/json")
        self.send_header("Content-Length", len(body))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(body)


# ── Entry point ───────────────────────────────────────────────────────────────

if __name__ == "__main__":
    PORT = 5500
    # serve from the directory this script lives in
    import os
    os.chdir(os.path.dirname(os.path.abspath(__file__)))

    server = HTTPServer(("", PORT), Handler)
    print(f"""
  ╔══════════════════════════════════════════╗
  ║        PaperTrade local server           ║
  ║  http://localhost:{PORT}                    ║
  ╚══════════════════════════════════════════╝

  Press Ctrl+C to stop.
""")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopped.")
