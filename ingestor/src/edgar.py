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

# Earnings press releases don't have "operator" / "q&a" but do have dense
# financial-results language.  Require ≥ this many signals to accept them.
_EARNINGS_PR_THRESHOLD = 4

_EARNINGS_PR_SIGNALS = [
    "revenue",
    "earnings per share",
    "net income",
    "gross margin",
    "guidance",
    "outlook",
    "financial results",
    "quarterly results",
    "first quarter",
    "second quarter",
    "third quarter",
    "fourth quarter",
    "fiscal quarter",
]


class EdgarClient:
    def __init__(self, user_agent: str) -> None:
        self._headers = {
            "User-Agent": user_agent,
            "Accept-Encoding": "gzip, deflate",
        }
        # Populated lazily on first call to get_company_info()
        self._cik_map: Optional[Dict[str, Dict]] = None
        # Reverse map: cik_padded → {ticker, name} — built alongside _cik_map
        self._reverse_cik_map: Dict[str, Dict] = {}

    # ── Public API ────────────────────────────────────────────────────────────

    def get_company_info(self, ticker: str) -> Optional[Dict]:
        """Return {'cik': '0000320193', 'name': 'Apple Inc.'} or None."""
        if self._cik_map is None:
            self._cik_map = self._build_cik_map()
        return self._cik_map.get(ticker.upper())

    def cik_to_info(self, cik: str) -> Optional[Dict]:
        """Return {'ticker': str, 'name': str} for a CIK, or None if unknown.

        Accepts any zero-padding variant (e.g. '320193' or '0000320193').
        Only covers exchange-listed companies in the SEC company_tickers.json.
        """
        if self._cik_map is None:
            self._cik_map = self._build_cik_map()
        try:
            cik_padded = str(int(cik)).zfill(10)
        except (ValueError, TypeError):
            return None
        return self._reverse_cik_map.get(cik_padded)

    def get_all_companies(self) -> Dict[str, Dict]:
        """Return the full {ticker → {cik, name}} map for universe seeding."""
        if self._cik_map is None:
            self._cik_map = self._build_cik_map()
        return dict(self._cik_map)

    def get_recent_8k_filings(self, cik: str, since: datetime) -> List[Dict]:
        """
        Return all 8-K filings since `since`, paginating through EDGAR's full
        history (recent batch + any archived batches in filings.files).
        """
        url = f"{_DATA_BASE}/submissions/CIK{cik}.json"
        data = self._get(url).json()

        results = self._collect_8k_from_batch(data["filings"]["recent"], since)

        # Paginate archived batches (EDGAR moves older filings here).
        # Batches are returned newest-first, so stop as soon as a batch is
        # entirely before `since` — no earlier batch can have newer filings.
        for file_ref in data["filings"].get("files", []):
            batch_url = f"{_DATA_BASE}/submissions/{file_ref['name']}"
            try:
                batch = self._get(batch_url).json()
            except Exception as exc:
                logger.warning("Could not fetch filing batch %s: %s", file_ref["name"], exc)
                continue
            batch_results = self._collect_8k_from_batch(batch, since)
            results.extend(batch_results)
            # Early-exit: if the newest filing in this batch predates `since`
            # then all remaining (older) batches will too.
            dates = batch.get("filingDate") or []
            if dates:
                try:
                    if datetime.strptime(dates[0], "%Y-%m-%d") < since:
                        break
                except ValueError:
                    pass

        return results

    def _collect_8k_from_batch(self, recent: dict, since: datetime) -> List[Dict]:
        results = []
        forms      = recent.get("form", [])
        dates      = recent.get("filingDate", [])
        accessions = recent.get("accessionNumber", [])
        for i, form in enumerate(forms):
            if form not in ("8-K", "8-K/A"):
                continue
            if i >= len(dates) or i >= len(accessions):
                continue
            try:
                filing_date = datetime.strptime(dates[i], "%Y-%m-%d")
            except (ValueError, TypeError):
                continue
            if filing_date < since:
                continue
            results.append({
                "accession_number": accessions[i],
                "filing_date": dates[i],
            })
        return results

    def fetch_transcript(self, cik: str, accession_number: str) -> Optional[Dict]:
        """
        Try to extract earnings content from the given 8-K filing.
        Accepts both call transcripts and earnings press releases.
        Returns {'text': str, 'accession_number': str} or None.
        """
        cik_int = int(cik)
        acc_nodash = accession_number.replace("-", "")

        # 1. Get the filing's document index (JSON first, HTML fallback)
        items = self._get_filing_items(cik_int, acc_nodash, accession_number)
        if not items:
            logger.debug("No filing index for %s", accession_number)
            return None

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
        """Download and cache the full ticker → CIK + name mapping.

        Also builds the reverse CIK → {ticker, name} map so that the RSS
        feed poller can resolve any CIK it encounters back to a ticker.
        """
        data = self._get(f"{_EDGAR_BASE}/files/company_tickers.json").json()
        forward: Dict[str, Dict] = {}
        reverse: Dict[str, Dict] = {}
        for v in data.values():
            cik_padded = str(v["cik_str"]).zfill(10)
            ticker = v["ticker"].upper()
            name = v["title"]
            forward[ticker] = {"cik": cik_padded, "name": name}
            reverse[cik_padded] = {"ticker": ticker, "name": name}
        self._reverse_cik_map = reverse
        return forward

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

    def _get_filing_items(
        self, cik_int: int, acc_nodash: str, accession_number: str
    ) -> List[Dict]:
        """
        Return the document list for a filing.
        Tries the JSON index first; falls back to the HTML index which EDGAR
        always provides even when the JSON variant is absent.
        """
        base = f"{_EDGAR_BASE}/Archives/edgar/data/{cik_int}/{acc_nodash}"

        # JSON index (available for most recent filings)
        try:
            data = self._get(f"{base}/{accession_number}-index.json").json()
            items = data.get("directory", {}).get("item", [])
            if items:
                return items
        except Exception:
            pass

        # HTML index fallback (.htm and .html are both in use on EDGAR)
        for ext in ("-index.htm", "-index.html"):
            try:
                resp = self._get(f"{base}/{accession_number}{ext}")
                items = self._parse_html_index(resp.content)
                if items:
                    return items
            except Exception:
                continue

        return []

    def _parse_html_index(self, content: bytes) -> List[Dict]:
        """
        Parse an EDGAR HTML filing index page into a list of
        {'name': filename, 'type': exhibit_type} dicts.

        EDGAR index pages contain one or more tables with headers
        Seq / Description / Document / Type / Size.  We parse every
        such table so both primary documents and all exhibits are
        captured; type-filtering happens downstream in _exhibit_candidates.
        """
        soup = BeautifulSoup(content, "lxml")
        items: List[Dict] = []

        for table in soup.find_all("table"):
            rows = table.find_all("tr")
            if len(rows) < 2:
                continue
            header_cells = rows[0].find_all(["th", "td"])
            headers = [c.get_text(strip=True).lower() for c in header_cells]
            if "document" not in headers or "type" not in headers:
                continue

            doc_col  = headers.index("document")
            type_col = headers.index("type")

            for row in rows[1:]:
                cells = row.find_all(["td", "th"])
                if len(cells) <= max(doc_col, type_col):
                    continue
                # Use href rather than cell text — some cells append "iXBRL" etc.
                a_tag = cells[doc_col].find("a")
                if a_tag:
                    name = (a_tag.get("href") or "").split("/")[-1].strip()
                    if not name:
                        name = a_tag.get_text(strip=True)
                else:
                    name = cells[doc_col].get_text(strip=True)

                doc_type = cells[type_col].get_text(strip=True)
                if name:
                    items.append({"name": name, "type": doc_type})

        return items

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
        Accept the document if it looks like either:
          (a) an earnings call transcript – ≥ _TRANSCRIPT_THRESHOLD of the
              call-specific signal phrases (operator, q&a, …), or
          (b) an earnings press release – ≥ _EARNINGS_PR_THRESHOLD of the
              financial-results signal phrases (revenue, EPS, guidance, …).
        Both paths require a minimum document length to filter stubs.
        """
        if len(text) <= 3_000:
            return False
        text_lower = text.lower()
        transcript_hits = sum(1 for s in _TRANSCRIPT_SIGNALS if s in text_lower)
        if transcript_hits >= _TRANSCRIPT_THRESHOLD:
            return True
        pr_hits = sum(1 for s in _EARNINGS_PR_SIGNALS if s in text_lower)
        return pr_hits >= _EARNINGS_PR_THRESHOLD

    def _get(self, url: str) -> requests.Response:
        time.sleep(_REQUEST_DELAY)
        resp = requests.get(url, headers=self._headers, timeout=30)
        resp.raise_for_status()
        return resp
