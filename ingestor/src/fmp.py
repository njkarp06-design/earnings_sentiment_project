"""
Financial Modeling Prep (FMP) transcript client.

Used as a fallback when SEC EDGAR has no transcript for a ticker.
FMP aggregates earnings call transcripts from company IR sites and
covers most S&P 500 names including those that don't file on EDGAR.

Endpoints used:
  GET /api/v4/earning_call_transcript?symbol={symbol}&apikey={key}
      → list of available [quarter, year] pairs

  GET /api/v3/earning_call_transcript/{symbol}?quarter={q}&year={year}&apikey={key}
      → [{"symbol", "quarter", "year", "date", "content"}]
"""

import logging
from typing import Dict, List, Optional, Tuple

import requests

logger = logging.getLogger(__name__)

_FMP_BASE = "https://financialmodelingprep.com/api"


class FmpClient:
    def __init__(self, api_key: str) -> None:
        self._api_key = api_key

    def list_available(self, ticker: str) -> List[Tuple[int, int]]:
        """
        Return list of (quarter, year) tuples for which FMP has a transcript.
        Most recent first.
        """
        url = f"{_FMP_BASE}/v4/earning_call_transcript"
        data = self._get(url, params={"symbol": ticker})
        if data is None:
            return []

        results = []
        for item in data:
            # FMP returns either [[q, y], ...] or [{"quarter": q, "year": y}, ...]
            if isinstance(item, list) and len(item) == 2:
                results.append((int(item[0]), int(item[1])))
            elif isinstance(item, dict):
                results.append((int(item["quarter"]), int(item["year"])))
        return results

    def fetch_transcript(
        self, ticker: str, quarter: int, year: int
    ) -> Optional[Dict]:
        """
        Fetch the transcript for a specific quarter/year.
        Returns {"symbol", "quarter", "year", "date", "content"} or None.
        """
        url = f"{_FMP_BASE}/v3/earning_call_transcript/{ticker}"
        data = self._get(url, params={"quarter": quarter, "year": year})
        if not data:
            return None
        # API returns a list; first element is the transcript
        return data[0] if isinstance(data, list) and data else None

    # ── Private ───────────────────────────────────────────────────────────────

    def _get(self, url: str, params: Dict = None):
        p = {"apikey": self._api_key, **(params or {})}
        try:
            resp = requests.get(url, params=p, timeout=15)
            resp.raise_for_status()
            return resp.json()
        except requests.HTTPError as exc:
            logger.warning("FMP request failed [%s]: HTTP %s", url, exc.response.status_code)
            return None
        except Exception as exc:
            logger.warning("FMP request failed [%s]: %s", url, type(exc).__name__)
            return None
