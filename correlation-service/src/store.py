"""MongoDB helpers for the correlation service."""

import logging

logger = logging.getLogger(__name__)

# Static fallback — avoids a yfinance network call for the most common tickers.
# yfinance is already heavily rate-limited for price downloads; hitting it again
# for sector info makes the backfill stall. This map covers the full S&P 100
# and typical watchlist additions.
_STATIC_SECTORS: dict[str, str] = {
    "AAPL": "Technology", "MSFT": "Technology", "NVDA": "Technology",
    "AVGO": "Technology", "INTC": "Technology", "AMD": "Technology",
    "QCOM": "Technology", "ORCL": "Technology", "IBM": "Technology",
    "CSCO": "Technology", "ADBE": "Technology", "CRM": "Technology",
    "NOW": "Technology", "INTU": "Technology", "AMAT": "Technology",
    "LRCX": "Technology", "KLAC": "Technology", "MU": "Technology",
    "DELL": "Technology", "HPQ": "Technology", "HPE": "Technology",
    "UBER": "Technology", "PLTR": "Technology", "SNOW": "Technology",
    "GOOGL": "Communication Services", "GOOG": "Communication Services",
    "META": "Communication Services", "NFLX": "Communication Services",
    "DIS": "Communication Services", "T": "Communication Services",
    "VZ": "Communication Services", "SNAP": "Communication Services",
    "AMZN": "Consumer Cyclical", "TSLA": "Consumer Cyclical",
    "HD": "Consumer Cyclical", "MCD": "Consumer Cyclical",
    "NKE": "Consumer Cyclical", "SBUX": "Consumer Cyclical",
    "F": "Consumer Cyclical", "GM": "Consumer Cyclical",
    "BKNG": "Consumer Cyclical", "ABNB": "Consumer Cyclical",
    "WMT": "Consumer Defensive", "PG": "Consumer Defensive",
    "KO": "Consumer Defensive", "PEP": "Consumer Defensive",
    "COST": "Consumer Defensive", "MDLZ": "Consumer Defensive",
    "JPM": "Financial Services", "BAC": "Financial Services",
    "GS": "Financial Services", "MS": "Financial Services",
    "C": "Financial Services", "WFC": "Financial Services",
    "AXP": "Financial Services", "V": "Financial Services",
    "MA": "Financial Services", "PYPL": "Financial Services",
    "BLK": "Financial Services", "SCHW": "Financial Services",
    "UNH": "Healthcare", "JNJ": "Healthcare", "LLY": "Healthcare",
    "PFE": "Healthcare", "ABBV": "Healthcare", "MRK": "Healthcare",
    "TMO": "Healthcare", "ABT": "Healthcare", "BMY": "Healthcare",
    "AMGN": "Healthcare", "GILD": "Healthcare", "ISRG": "Healthcare",
    "MDT": "Healthcare", "CVS": "Healthcare", "CI": "Healthcare",
    "XOM": "Energy", "CVX": "Energy", "COP": "Energy",
    "EOG": "Energy", "SLB": "Energy", "OXY": "Energy",
    "BA": "Industrials", "CAT": "Industrials", "GE": "Industrials",
    "HON": "Industrials", "MMM": "Industrials", "UPS": "Industrials",
    "RTX": "Industrials", "LMT": "Industrials", "DE": "Industrials",
    "NEE": "Utilities", "DUK": "Utilities", "SO": "Utilities",
    "AMT": "Real Estate", "PLD": "Real Estate", "CCI": "Real Estate",
    "LIN": "Basic Materials", "APD": "Basic Materials", "NEM": "Basic Materials",
    "FCX": "Basic Materials",
}


def _yfinance_sector(ticker: str) -> str | None:
    """Fetch sector from yfinance .info as a last resort. May be rate-limited."""
    try:
        import yfinance as yf
        info = yf.Ticker(ticker).info
        return info.get("sector") or None
    except Exception as exc:
        logger.debug("yfinance sector lookup failed for %s: %s", ticker, exc)
        return None


def get_company_sector(db, ticker: str) -> str | None:
    """Return the sector for a ticker.

    Resolution order:
      1. companies collection (cached from a prior lookup)
      2. static map (instant, no network)
      3. yfinance .info (network, may be slow/rate-limited)
    """
    ticker = ticker.upper()

    doc = db.companies.find_one({"ticker": ticker}, {"sector": 1})
    if doc and doc.get("sector"):
        return doc["sector"]

    sector = _STATIC_SECTORS.get(ticker) or _yfinance_sector(ticker)
    if sector:
        db.companies.update_one(
            {"ticker": ticker},
            {"$set": {"sector": sector}, "$setOnInsert": {"name": ticker}},
            upsert=True,
        )
        logger.info("Cached sector for %s: %s", ticker, sector)
    return sector


def already_correlated(db, filing_id: str) -> bool:
    if not filing_id:
        return False
    doc = db.price_reactions.find_one({"filing_id": filing_id})
    if doc is None:
        return False
    return "trade_brief" in doc and not doc.get("_mock")


def upsert_price_reaction(db, doc: dict) -> None:
    filing_id = doc.get("filing_id")
    query = (
        {"filing_id": filing_id}
        if filing_id
        else {"ticker": doc["ticker"], "call_date": doc["call_date"]}
    )
    db.price_reactions.update_one(
        query,
        {"$set": doc, "$unset": {"_mock": ""}},
        upsert=True,
    )


def upsert_raw_price(db, doc: dict) -> None:
    """Cache raw OHLCV records from the raw-prices topic for BFF price charts.

    The raw-prices message shape is:
      {"ticker": str, "call_date": str, "prices": {date_str: {open,high,low,close,volume}}, ...}
    We flatten it into one document per (ticker, date) for efficient chart queries.
    """
    for date_str, ohlcv in doc.get("prices", {}).items():
        db.raw_prices.update_one(
            {"ticker": doc["ticker"], "date": date_str},
            {"$set": {"ticker": doc["ticker"], "date": date_str, **ohlcv}},
            upsert=True,
        )
