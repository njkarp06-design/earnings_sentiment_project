#!/usr/bin/env python3
"""
Fetch NVIDIA Q1 FY2027 earnings press release from EDGAR (filed 2026-05-20),
score it with Claude, get real post-call prices from yfinance, and upsert
directly into the price_reactions MongoDB collection so the card appears in
the feed exactly as it would have from the normal pipeline.

Usage (from project root, Docker Compose up):
    python tools/restore_nvda_card.py
"""

import json
import logging
import os
import sys
import time
from datetime import datetime, timezone

import requests
from bs4 import BeautifulSoup

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "ingestor", "src"))
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "scoring-service", "src"))
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "correlation-service", "src"))

from scorer import Scorer

from pymongo import MongoClient
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(message)s",
)
logger = logging.getLogger(__name__)

EDGAR_BASE     = "https://www.sec.gov/Archives/edgar/data/1045810/000104581026000051"
EDGAR_HEADERS  = {"User-Agent": os.getenv("EDGAR_USER_AGENT", "EarningsSentimentResearch njkarp06@gmail.com")}
FILING_ID      = "0001045810-26-000051"
TICKER         = "NVDA"
COMPANY_NAME   = "NVIDIA Corporation"
CALL_DATE      = "2026-05-20"
SECTOR         = "Technology"
MODEL          = os.getenv("SCORING_MODEL", "claude-haiku-4-5-20251001")
MONGO_URI      = os.getenv("MONGO_URI", "mongodb://earningssentiment:REDACTED@localhost:27017/earnings_sentiment?authSource=admin")


def _compute_returns(ticker: str, call_date: str) -> dict:
    import pandas as pd
    import yfinance as yf
    from datetime import date, timedelta
    start = date.fromisoformat(call_date)
    end = start + timedelta(days=22)
    session = requests.Session()
    session.headers.update({"User-Agent": "Mozilla/5.0"})
    try:
        df = yf.Ticker(ticker, session=session).history(
            start=start.isoformat(), end=end.isoformat(), auto_adjust=True, timeout=15
        )
    except Exception as exc:
        logger.warning("yfinance failed: %s", exc)
        return {}
    if df.empty:
        return {}
    if isinstance(df.columns, pd.MultiIndex):
        df.columns = [c[0] for c in df.columns]
    # Normalise index to tz-naive dates
    df.index = pd.to_datetime(df.index).normalize().tz_localize(None)
    call_dt = pd.Timestamp(call_date)
    after = df[df.index >= call_dt]
    if after.empty:
        return {}
    base = float(after["Close"].iloc[0])
    result: dict = {"call_date_close": round(base, 4)}
    rest = df[df.index > after.index[0]]
    for field, n in (("return_1d", 1), ("return_3d", 3), ("return_7d", 7)):
        if len(rest) >= n:
            result[field] = round((float(rest["Close"].iloc[n - 1]) - base) / base * 100, 4)
        else:
            result[field] = None
    series = [{"day": 0, "close": round(base, 4), "pct": 0.0}]
    for i, (_, row) in enumerate(rest.iloc[:7].iterrows(), 1):
        c = float(row["Close"])
        series.append({"day": i, "close": round(c, 4), "pct": round((c - base) / base * 100, 4)})
    result["price_series"] = series
    return result


def fetch_exhibit(filename: str) -> str:
    url = f"{EDGAR_BASE}/{filename}"
    time.sleep(0.15)
    resp = requests.get(url, headers=EDGAR_HEADERS, timeout=20)
    resp.raise_for_status()
    soup = BeautifulSoup(resp.content, "lxml")
    for tag in soup(["script", "style"]):
        tag.decompose()
    lines = [l.strip() for l in soup.get_text(separator="\n").splitlines()]
    return "\n".join(l for l in lines if l)


def main() -> None:
    api_key = os.getenv("ANTHROPIC_API_KEY", "")
    if not api_key:
        logger.error("ANTHROPIC_API_KEY not set")
        sys.exit(1)

    # 1. Fetch press release + CFO commentary from EDGAR
    logger.info("Fetching Q1 FY2027 press release from EDGAR …")
    pr_text = fetch_exhibit("q1fy27pr.htm")
    logger.info("  press release: %d chars", len(pr_text))

    try:
        cfo_text = fetch_exhibit("q1fy27cfocommentary.htm")
        logger.info("  CFO commentary: %d chars", len(cfo_text))
        combined = pr_text + "\n\n" + cfo_text
    except Exception:
        combined = pr_text

    # 2. Score with Claude
    logger.info("Scoring with %s …", MODEL)
    scorer = Scorer(api_key=api_key, model=MODEL, max_chars=12_000)
    result = scorer.score(combined, TICKER)
    scored_at = datetime.now(timezone.utc).isoformat()
    logger.info("Score: %d/100  phrases: %s", result["confidence_score"], result["key_phrases"])

    # 3. Fetch real post-call price data from yfinance
    logger.info("Fetching post-call prices from yfinance …")
    returns = _compute_returns(TICKER, CALL_DATE)
    if not returns:
        logger.warning("No price data — returns will be null")
        returns = {"call_date_close": None, "return_1d": None, "return_3d": None, "return_7d": None, "price_series": None}
    else:
        logger.info(
            "  close=%.2f  1d=%s%%  3d=%s%%  7d=%s%%",
            returns.get("call_date_close") or 0,
            returns.get("return_1d"), returns.get("return_3d"), returns.get("return_7d"),
        )

    # 4. Determine trend from 1d return
    r1d = returns.get("return_1d")
    trend = "up" if r1d and r1d > 0 else ("down" if r1d and r1d < 0 else None)

    # 5. Upsert into price_reactions
    correlated_at = datetime.now(timezone.utc).isoformat()
    doc = {
        "filing_id":        FILING_ID,
        "ticker":           TICKER,
        "company_name":     COMPANY_NAME,
        "sector":           SECTOR,
        "call_date":        CALL_DATE,
        "confidence_score": result["confidence_score"],
        "key_phrases":      result["key_phrases"],
        "model_used":       MODEL,
        "scored_at":        scored_at,
        "correlated_at":    correlated_at,
        "trend":            trend,
        **returns,
    }

    client = MongoClient(MONGO_URI)
    db = client.earnings_sentiment
    db.price_reactions.update_one(
        {"filing_id": FILING_ID},
        {"$set": doc},
        upsert=True,
    )
    client.close()

    logger.info(
        "\nDone — NVDA Q1 FY2027 card upserted into price_reactions.\n"
        "  filing_id : %s\n"
        "  call_date : %s\n"
        "  score     : %d/100\n"
        "  trend     : %s\n"
        "  1d return : %s%%",
        FILING_ID, CALL_DATE,
        result["confidence_score"], trend,
        returns.get("return_1d"),
    )
    logger.info("Refresh your feed — the card should appear at the top.")


if __name__ == "__main__":
    main()
