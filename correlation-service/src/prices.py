"""
Fetch post-call price data and compute 1d/3d/7d returns.

Uses yf.download() which hits a different Yahoo Finance endpoint than
Ticker.history() and is not subject to the same per-session rate limits.

Return values are percentage changes from the closing price on (or immediately
after) call_date.  Windows where data isn't available yet come back as None
so the record can be written and backfilled later.
"""

import logging
import time
from datetime import date, timedelta

import pandas as pd
import yfinance as yf

logger = logging.getLogger(__name__)

# Polite inter-request delay — prevents Yahoo Finance rate-limiting when the
# backfill processes many tickers in quick succession.
_REQUEST_DELAY = 5.0  # seconds

# Mapping of MongoDB field name → number of trading days after the baseline
WINDOWS = {"return_1d": 1, "return_3d": 3, "return_7d": 7}

# Extra calendar days to fetch beyond the window to absorb weekends + holidays
_CALENDAR_BUFFER = 10


def compute_post_call_returns(ticker: str, call_date: str, fetch_days: int = 12) -> dict:
    """
    Download OHLCV for `ticker` starting at `call_date`, then compute
    1d / 3d / 7d returns relative to the first available closing price.

    Returns a dict with keys:
        call_date_close, return_1d, return_3d, return_7d, price_series
    Values may be None when the trading window hasn't elapsed yet.
    Returns an empty dict only on a hard download failure.
    """
    time.sleep(_REQUEST_DELAY)
    start = date.fromisoformat(call_date)
    end = start + timedelta(days=max(fetch_days, 7) + _CALENDAR_BUFFER)

    df = pd.DataFrame()
    for attempt in range(3):
        try:
            df = yf.download(
                ticker,
                start=start.isoformat(),
                end=end.isoformat(),
                auto_adjust=True,
                progress=False,
                timeout=15,
            )
            break
        except Exception as exc:
            if "Too Many Requests" in str(exc) or "Rate" in str(exc):
                wait = 30 * (attempt + 1)
                logger.info("yfinance rate-limited for %s — retrying in %ds (attempt %d/3)", ticker, wait, attempt + 1)
                time.sleep(wait)
            else:
                logger.warning("yfinance download failed for %s (%s): %s", ticker, call_date, exc)
                break

    if df is None or df.empty:
        logger.warning("No price data returned for %s from %s", ticker, call_date)
        return {}

    # yf.download() with a single ticker returns MultiIndex columns like ('Close', 'AAPL')
    if isinstance(df.columns, pd.MultiIndex):
        df.columns = [col[0] for col in df.columns]

    # Normalise to tz-naive midnight dates
    df.index = pd.to_datetime(df.index).normalize().tz_localize(None)
    call_dt = pd.Timestamp(call_date)

    # Baseline: first trading day on or after call_date
    on_or_after = df[df.index >= call_dt]
    if on_or_after.empty:
        logger.warning("All fetched prices precede call date for %s %s", ticker, call_date)
        return {}

    base_close = float(on_or_after["Close"].iloc[0])
    result: dict = {"call_date_close": round(base_close, 4)}

    # Subsequent trading days (strictly after the baseline day)
    after_baseline = df[df.index > on_or_after.index[0]]

    for field, n_days in WINDOWS.items():
        if len(after_baseline) >= n_days:
            target_close = float(after_baseline["Close"].iloc[n_days - 1])
            pct = (target_close - base_close) / base_close * 100
            result[field] = round(pct, 4)
        else:
            result[field] = None  # not enough data yet

    # Build an 8-point daily price series (day 0 = call date baseline, days 1-7).
    price_series = [{"day": 0, "close": round(base_close, 4), "pct": 0.0}]
    for i, (_, row) in enumerate(after_baseline.iloc[:7].iterrows(), start=1):
        close = float(row["Close"])
        pct = (close - base_close) / base_close * 100
        price_series.append({"day": i, "close": round(close, 4), "pct": round(pct, 4)})
    result["price_series"] = price_series

    return result
