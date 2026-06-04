"""
EDGAR RSS 8-K feed poller.

Polls the SEC's live Atom feed of 8-K filings to catch earnings content from
ANY public company — no ticker whitelist required.

This complements the per-ticker scan in main.py:
  - Per-ticker scan  → backfills the configured lookback window for known tickers.
  - RSS poller       → real-time, universal coverage for all listed companies.

Processing flow per feed entry:
  1. Skip if accession number is already in ProcessedStore (dedup).
  2. Resolve CIK → {ticker, name} via the reverse CIK map built from
     SEC company_tickers.json.  Entries without a known ticker (OTC/foreign
     issuers, investment trusts, etc.) are marked processed and skipped.
  3. Fetch the filing exhibits and run the is_transcript() detector.
  4. If earnings content found: publish raw-transcripts + raw-prices to Kafka,
     upsert the company record, and mark the filing processed.
     If not earnings content: mark processed and continue.
"""

import logging
import xml.etree.ElementTree as ET
from typing import List, Optional

import requests

from .edgar import EdgarClient
from .normaliser import normalise_transcript, normalise_prices
from .prices import fetch_price_window
from .producer import KafkaProducer
from .s3_archive import archive_transcript
from .store import ProcessedStore

logger = logging.getLogger(__name__)

_ATOM_FEED_URL = (
    "https://www.sec.gov/cgi-bin/browse-edgar"
    "?action=getcurrent&type=8-K&dateb=&owner=include&count=100&output=atom"
)
_ATOM_NS = "http://www.w3.org/2005/Atom"


def poll(
    edgar: EdgarClient,
    store: ProcessedStore,
    producer: KafkaProducer,
    on_new_ticker=None,
) -> int:
    """
    Fetch the EDGAR 8-K Atom feed and process any new earnings filings.
    Returns the number of transcripts published to Kafka.

    on_new_ticker: optional callable(ticker) invoked after each newly
    discovered earnings call is published — used to trigger a full
    historical backfill for that company.
    """
    entries = _fetch_feed_entries(edgar)
    if not entries:
        return 0

    published = 0
    for entry in entries:
        cik = entry["cik"]
        acc_no = entry["accession_number"]
        filing_date = entry["filing_date"]
        feed_company_name = entry["company_name"]

        if store.is_processed(acc_no):
            continue

        # Resolve CIK → ticker.  Entries with no ticker (OTC/foreign/trust) are
        # skipped — they won't have meaningful earnings call content anyway.
        info = edgar.cik_to_info(cik)
        if not info:
            store.mark_processed(acc_no)
            continue

        ticker = info["ticker"]
        name = info["name"] or feed_company_name
        store.upsert_company(ticker, name)

        try:
            result = edgar.fetch_transcript(cik, acc_no)
        except Exception as exc:
            # Transient network / rate-limit error — don't mark processed so it
            # retries on the next poll interval.
            logger.warning("RSS %s [%s]: fetch error — %s", ticker, acc_no, exc)
            continue

        if not result:
            store.mark_processed(acc_no)
            continue

        if _publish(ticker, name, filing_date, acc_no, cik, result["text"], producer, store):
            published += 1
            logger.info("RSS: published %s  %s", ticker, filing_date)
            if on_new_ticker is not None:
                try:
                    on_new_ticker(ticker)
                except Exception as exc:
                    logger.warning("RSS: backfill callback error for %s: %s", ticker, exc)

    if published:
        logger.info("RSS poll complete — %d new transcript(s) published", published)
    else:
        logger.debug("RSS poll complete — no new earnings filings")

    return published


# ── Internal helpers ──────────────────────────────────────────────────────────

def _fetch_feed_entries(edgar: EdgarClient) -> List[dict]:
    """Download and parse the EDGAR 8-K Atom feed into a list of entry dicts."""
    try:
        resp = requests.get(
            _ATOM_FEED_URL,
            headers={
                "User-Agent": edgar._headers["User-Agent"],
                "Accept-Encoding": "gzip, deflate",
            },
            timeout=30,
        )
        resp.raise_for_status()
    except Exception as exc:
        logger.warning("RSS feed fetch failed: %s", exc)
        return []

    try:
        root = ET.fromstring(resp.content)
    except ET.ParseError as exc:
        logger.warning("RSS feed XML parse error: %s", exc)
        return []

    entries = []
    for el in root.findall(f"{{{_ATOM_NS}}}entry"):
        entry = _parse_entry(el)
        if entry:
            entries.append(entry)

    logger.debug("RSS feed: %d entries fetched", len(entries))
    return entries


def _parse_entry(el: ET.Element) -> Optional[dict]:
    """
    Parse one <entry> element from the EDGAR Atom feed.

    <id> format:  urn:tag:www.sec.gov,2008:accession-number=0000320193-25-000049
    CIK:          the first 10-digit segment of the accession number
    <updated>:    2025-01-30T17:04:22-05:00  →  filing_date = "2025-01-30"
    <title>:      "8-K - APPLE INC (0000320193) (Filer)"  →  company_name = "APPLE INC"
    """
    id_el = el.find(f"{{{_ATOM_NS}}}id")
    updated_el = el.find(f"{{{_ATOM_NS}}}updated")
    title_el = el.find(f"{{{_ATOM_NS}}}title")

    if id_el is None or updated_el is None:
        return None

    raw_id = (id_el.text or "").strip()
    if "accession-number=" not in raw_id:
        return None

    acc_no = raw_id.split("accession-number=")[-1].strip()
    # The first dash-delimited segment is the zero-padded CIK (10 digits)
    cik = acc_no.split("-")[0]

    # Take the date portion only (first 10 chars of the ISO timestamp)
    filing_date = (updated_el.text or "")[:10]

    # Parse company name from title: "8-K - APPLE INC (0000320193) (Filer)"
    company_name = ""
    if title_el is not None and title_el.text:
        parts = title_el.text.split(" - ", 1)
        if len(parts) == 2:
            name_part = parts[1]
            paren_idx = name_part.find(" (")
            if paren_idx > 0:
                name_part = name_part[:paren_idx]
            company_name = name_part.strip()

    return {
        "cik": cik,
        "accession_number": acc_no,
        "filing_date": filing_date,
        "company_name": company_name,
    }


def _publish(
    ticker: str,
    company_name: str,
    filing_date: str,
    filing_id: str,
    cik: str,
    raw_text: str,
    producer: KafkaProducer,
    store: ProcessedStore,
) -> bool:
    """Publish transcript + price window to Kafka. Returns True on success."""
    t_msg = normalise_transcript(
        ticker=ticker,
        company_name=company_name,
        call_date=filing_date,
        filing_id=filing_id,
        cik=cik,
        raw_text=raw_text,
        source="sec_edgar_rss",
    )
    archive_transcript(t_msg)

    try:
        producer.publish_transcript(t_msg)
    except Exception as exc:
        logger.error("RSS: Kafka transcript publish failed [%s]: %s", filing_id, exc)
        return False  # don't mark processed — retry next poll

    price_rows = fetch_price_window(ticker, filing_date)
    if price_rows:
        try:
            producer.publish_prices(normalise_prices(ticker, filing_date, price_rows))
        except Exception as exc:
            logger.error("RSS: Kafka price publish failed [%s]: %s", ticker, exc)
    else:
        logger.warning("RSS: no price data for %s on %s", ticker, filing_date)

    store.mark_processed(filing_id)
    return True
