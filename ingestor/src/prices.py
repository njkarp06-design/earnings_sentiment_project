import logging
from datetime import datetime, timedelta
from typing import Dict, Optional

import yfinance as yf

logger = logging.getLogger(__name__)

# Fetch this many calendar days after the call date so the correlation
# service has enough price rows to compute 1d / 3d / 7d returns.
_DAYS_AFTER = 12
_DAYS_BEFORE = 5   # buffer for weekends / holidays before the call


def fetch_price_window(ticker: str, call_date: str) -> Optional[Dict[str, Dict]]:
    """
    Return OHLCV rows for the window around call_date, keyed by 'YYYY-MM-DD'.
    Returns None if yfinance returns no data.
    """
    call_dt = datetime.strptime(call_date, "%Y-%m-%d")
    start = (call_dt - timedelta(days=_DAYS_BEFORE)).strftime("%Y-%m-%d")
    end = (call_dt + timedelta(days=_DAYS_AFTER)).strftime("%Y-%m-%d")

    try:
        import requests as _req
        session = _req.Session()
        session.headers.update({
            "User-Agent": (
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/124.0.0.0 Safari/537.36"
            ),
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.5",
        })
        hist = yf.Ticker(ticker, session=session).history(
            start=start, end=end, auto_adjust=True
        )
    except Exception as exc:
        logger.warning("yfinance error for %s: %s", ticker, exc)
        return None

    if hist.empty:
        logger.warning("No price data returned for %s (%s → %s)", ticker, start, end)
        return None

    rows: Dict[str, Dict] = {}
    for ts, row in hist.iterrows():
        # ts may be timezone-aware depending on yfinance version
        date_str = ts.date().isoformat() if hasattr(ts, "date") else str(ts)[:10]
        # yfinance can emit NaN rows for halted/partial sessions. Skip them so
        # NaNs never reach Mongo and int(NaN) doesn't blow up the whole window.
        close = row["Close"]
        if close != close:  # NaN
            continue
        vol = row["Volume"]
        rows[date_str] = {
            "open":   round(float(row["Open"]),   4),
            "high":   round(float(row["High"]),   4),
            "low":    round(float(row["Low"]),    4),
            "close":  round(float(close),         4),
            "volume": int(vol) if vol == vol else 0,
        }
    return rows
