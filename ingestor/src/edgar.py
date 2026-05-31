"""
SEC EDGAR client.

Responsibilities:
  - Resolve ticker → CIK (cached for the lifetime of the process)
  - List recent 8-K filings for a CIK
  - Download exhibit HTML/text and detect whether it's an earnings-call transcript
"""

import logging
import time
from datetime import datetime
from typing import Dict, List, Optional

import requests
from bs4 import BeautifulSoup

logger = logging.getLogger(__name__)

_EDGAR_BASE = "https://www.sec.gov"
_DATA_BASE = "https://data.sec.gov"

# SEC fair-use guidance: ≤ 10 requests/second
_REQUEST_DELAY = 0.12   # seconds between requests

# Exhibit doc-types we bother downloading
_EXHIBIT_TYPES = {"ex-99.1", "ex-99.2", "ex-99.3", "ex-99"}

# A filing is classified as a transcript when ≥ this many signals appear
_TRANSCRIPT_THRESHOLD = 2

_TRANSCRIPT_SIGNALS = [
    "operator",
    "q&a",
    "question-and-answer",
    "questions and answers",
    "[operator instructions]",
    "(operator instructions)",
    "thank you for standing by",
    "thank you for joining",
    "earnings call",
    "conference call",
    "good morning, everyone",
    "good afternoon, everyone",
    "good evening, everyone",
]


class EdgarClient:
    def __init__(self, user_agent: str) -> None:
        self._headers = {
            "User-Agent": user_agent,
            "Accept-Encoding": "gzip, deflate",
        }
        # Populated lazily on first call to get_company_info()
        self._cik_map: Optional[Dict[str, Dict]] = None

    # ── Public API ────────────────────────────────────────────────────────────

    def get_company_info(self, ticker: str) -> Optional[Dict]:
        """Return {'cik': '0000320193', 'name': 'Apple Inc.'} or None."""
        if self._cik_map is None:
            self._cik_map = self._build_cik_map()
        return self._cik_map.get(ticker.upper())

    def get_recent_8k_filings(self, cik: str, since: datetime) -> List[Dict]:
        """
        Return a list of dicts with keys accession_number and filing_date
        for all 8-K filings since `since`.
        """
        url = f"{_DATA_BASE}/submissions/CIK{cik}.json"
        data = self._get(url).json()
        recent = data["filings"]["recent"]

        results = []
        for i, form in enumerate(recent["form"]):
            if form not in ("8-K", "8-K/A"):
                continue
            filing_date = datetime.strptime(recent["filingDate"][i], "%Y-%m-%d")
            if filing_date < since:
                continue
            results.append(
                {
                    "accession_number": recent["accessionNumber"][i],
                    "filing_date": recent["filingDate"][i],
                }
            )
        return results

    def fetch_transcript(self, cik: str, accession_number: str) -> Optional[Dict]:
        """
        Try to extract an earnings-call transcript from the given 8-K filing.
        Returns {'text': str, 'accession_number': str} or None.
        """
        cik_int = int(cik)
        acc_nodash = accession_number.replace("-", "")

        # 1. Get the filing's document index
        idx_url = (
            f"{_EDGAR_BASE}/Archives/edgar/data/{cik_int}"
            f"/{acc_nodash}/{accession_number}-index.json"
        )
        try:
            idx_data = self._get(idx_url).json()
        except Exception as exc:
            logger.debug("No index JSON for %s: %s", accession_number, exc)
            return None

        items = idx_data.get("directory", {}).get("item", [])

        # 2. Collect candidate exhibit files (HTML/text only)
        candidates = self._exhibit_candidates(items)

        # 3. Download each candidate and check content
        for filename in candidates:
            url = (
                f"{_EDGAR_BASE}/Archives/edgar/data/{cik_int}"
                f"/{acc_nodash}/{filename}"
            )
            try:
                text = self._fetch_and_clean(url)
            except Exception as exc:
                logger.debug("Failed to fetch %s: %s", url, exc)
                continue

            if text and self._is_transcript(text):
                return {"text": text, "accession_number": accession_number}

        return None

    # ── Private helpers ───────────────────────────────────────────────────────

    def _build_cik_map(self) -> Dict[str, Dict]:
        """Download and cache the full ticker → CIK + name mapping."""
        data = self._get(f"{_EDGAR_BASE}/files/company_tickers.json").json()
        return {
            v["ticker"].upper(): {
                "cik": str(v["cik_str"]).zfill(10),
                "name": v["title"],
            }
            for v in data.values()
        }

    def _exhibit_candidates(self, items: List[Dict]) -> List[str]:
        """
        From a filing index item list, return filenames worth downloading.
        Preference: explicit exhibit type, then keyword in filename.
        """
        candidates = []
        for item in items:
            name = item.get("name", "")
            doc_type = item.get("type", "").lower()

            if not name.lower().endswith((".htm", ".html", ".txt")):
                continue

            name_lower = name.lower()
            has_keyword = any(
                kw in name_lower
                for kw in ("transcript", "conference", "call", "earn")
            )

            if doc_type in _EXHIBIT_TYPES or has_keyword:
                candidates.append(name)

        return candidates

    def _fetch_and_clean(self, url: str) -> str:
        resp = self._get(url)
        content_type = resp.headers.get("Content-Type", "")

        if "html" in content_type or url.lower().endswith((".htm", ".html")):
            soup = BeautifulSoup(resp.content, "lxml")
            for tag in soup(["script", "style"]):
                tag.decompose()
            raw = soup.get_text(separator="\n")
        else:
            raw = resp.text

        # Collapse blank lines
        lines = [line.strip() for line in raw.splitlines()]
        return "\n".join(line for line in lines if line)

    def _is_transcript(self, text: str) -> bool:
        """
        Heuristic: require at least _TRANSCRIPT_THRESHOLD signal phrases
        and a minimum length (real transcripts are long).
        """
        text_lower = text.lower()
        hits = sum(1 for sig in _TRANSCRIPT_SIGNALS if sig in text_lower)
        return hits >= _TRANSCRIPT_THRESHOLD and len(text) > 3_000

    def _get(self, url: str) -> requests.Response:
        time.sleep(_REQUEST_DELAY)
        resp = requests.get(url, headers=self._headers, timeout=30)
        resp.raise_for_status()
        return resp
