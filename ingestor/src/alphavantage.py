"""
Alpha Vantage earnings call transcript client.

Free tier: 25 requests/day, 500/month.
Used only for on-demand single-ticker fetches — the rate limit is too low
for bulk scheduled scans.

Endpoint:
  GET https://www.alphavantage.co/query
    ?function=EARNINGS_CALL_TRANSCRIPT
    &symbol={ticker}
    &quarter={YYYYQN}   e.g. 2024Q1
    &apikey={key}

Response shape:
  {"symbol": "AAPL", "quarter": "2024Q1",
   "transcript": [{"speaker": "...", "title": "...", "speech": "..."}, ...]}
"""

import logging
from datetime import date
from typing import Dict, List, Optional

import requests

logger = logging.getLogger(__name__)

_AV_BASE = "https://www.alphavantage.co/query"

# Approximate call date by quarter: Q1 reported ~April, Q2 ~July, Q3 ~October, Q4 ~January+1yr
_QUARTER_MONTH = {1: (4, 0), 2: (7, 0), 3: (10, 0), 4: (1, 1)}


class AlphaVantageClient:
    def __init__(self, api_key: str) -> None:
        self._api_key = api_key
        self._disabled = False

    def fetch_recent_transcripts(self, ticker: str, n_quarters: int = 8) -> List[Dict]:
        """
        Try to fetch the last n_quarters transcripts for ticker.
        Returns list of dicts: {text, call_date, quarter, filing_id}.
        Stops early if the API signals rate limiting.
        """
        if self._disabled:
            return []

        results = []
        for quarter_str in self._recent_quarters(n_quarters):
            if self._disabled:
                break
            t = self._fetch_quarter(ticker, quarter_str)
            if t:
                results.append(t)

        return results

    # ── Private ───────────────────────────────────────────────────────────────

    def _fetch_quarter(self, ticker: str, quarter: str) -> Optional[Dict]:
        """quarter: '2024Q1' format. Returns None if not found or on error."""
        try:
            resp = requests.get(_AV_BASE, params={
                "function": "EARNINGS_CALL_TRANSCRIPT",
                "symbol":   ticker,
                "quarter":  quarter,
                "apikey":   self._api_key,
            }, timeout=15)
            resp.raise_for_status()
            data = resp.json()
        except requests.HTTPError as exc:
            code = exc.response.status_code
            if code in (403, 429) and not self._disabled:
                self._disabled = True
                logger.warning("Alpha Vantage: HTTP %d — disabling for this session", code)
            return None
        except Exception as exc:
            logger.debug("Alpha Vantage fetch error for %s %s: %s", ticker, quarter, exc)
            return None

        # API overloads 200 OK for errors — check for info/note messages
        if any(k in data for k in ("Information", "Note", "Error Message")):
            if not self._disabled:
                logger.debug("Alpha Vantage API message for %s %s: %s", ticker, quarter, data)
            return None

        parts = data.get("transcript") or []
        if not parts:
            return None

        # Join all speaker turns into a single document
        text = "\n".join(
            f"{p.get('speaker', 'Speaker')}: {p.get('speech', '')}"
            for p in parts
            if p.get("speech", "").strip()
        )
        if len(text) < 500:
            return None

        year = int(quarter[:4])
        q    = int(quarter[5])
        month, year_offset = _QUARTER_MONTH[q]
        call_date = f"{year + year_offset}-{month:02d}-15"

        return {
            "text":       text,
            "call_date":  call_date,
            "quarter":    quarter,
            "filing_id":  f"av_{ticker}_{quarter}",
        }

    @staticmethod
    def _recent_quarters(n: int) -> List[str]:
        """Return the last n quarter strings newest-first: ['2025Q1', '2024Q4', ...]"""
        today = date.today()
        q    = (today.month - 1) // 3 + 1
        year = today.year
        out  = []
        for _ in range(n):
            out.append(f"{year}Q{q}")
            q -= 1
            if q == 0:
                q = 4
                year -= 1
        return out
