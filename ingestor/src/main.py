"""
Ingestor service — Phase 1.

Two-pass strategy per nightly run:
  Pass 1 — EDGAR: scan recent 8-K filings for earnings call transcripts.
  Pass 2 — FMP:   for any ticker that EDGAR found nothing for, fall back to
                  Financial Modeling Prep (requires FMP_API_KEY in env).

Both passes publish to the same Kafka topics:
  raw-transcripts  →  scoring-service   (Phase 2)
  raw-prices       →  correlation-service (Phase 3)
"""

import logging
from datetime import datetime, timedelta, timezone
from typing import Optional, Set

from apscheduler.schedulers.blocking import BlockingScheduler
from dotenv import load_dotenv

from .config import Config
from .edgar import EdgarClient
from .fmp import FmpClient
from .normaliser import normalise_transcript, normalise_prices
from .prices import fetch_price_window
from .producer import KafkaProducer
from . import rss_feed
from .s3_archive import archive_transcript
from .store import ProcessedStore

load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(name)s — %(message)s",
)
logger = logging.getLogger(__name__)


# ── Pass 1: EDGAR ─────────────────────────────────────────────────────────────

def _edgar_scan(
    tickers: list,
    edgar: EdgarClient,
    producer: KafkaProducer,
    store: ProcessedStore,
    since: datetime,
) -> Set[str]:
    """
    Scan EDGAR 8-K filings for all tickers.
    Returns the set of tickers for which at least one transcript was found.
    """
    found_tickers: Set[str] = set()

    for ticker in tickers:
        info = edgar.get_company_info(ticker)
        if not info:
            logger.warning("EDGAR: no CIK for %s — skipping", ticker)
            continue

        cik = info["cik"]
        company_name = info["name"]
        store.upsert_company(ticker, company_name)

        try:
            filings = edgar.get_recent_8k_filings(cik, since)
        except Exception as exc:
            logger.error("EDGAR: failed to list filings for %s: %s", ticker, exc)
            continue

        logger.info("EDGAR: %s — %d 8-K filings to check", ticker, len(filings))

        for filing in filings:
            acc_no = filing["accession_number"]
            filing_date = filing["filing_date"]

            if store.is_processed(acc_no):
                continue

            try:
                result = edgar.fetch_transcript(cik, acc_no)
            except Exception as exc:
                logger.error("EDGAR: error on %s: %s", acc_no, exc)
                # Do NOT mark processed — transient network/rate-limit errors
                # should retry on the next scheduled run.
                continue

            if not result:
                store.mark_processed(acc_no)
                continue

            if _publish_transcript_and_prices(
                ticker, company_name, filing_date, acc_no, cik,
                result["text"], producer, store,
            ):
                found_tickers.add(ticker)

    return found_tickers


# ── Pass 2: FMP fallback ──────────────────────────────────────────────────────

def _fmp_scan(
    tickers: list,
    fmp: FmpClient,
    producer: KafkaProducer,
    store: ProcessedStore,
    since: datetime,
    skip_tickers: Set[str],
) -> None:
    """
    For tickers EDGAR didn't find anything for, query FMP.
    skip_tickers is the set of tickers already covered by EDGAR this run.
    """
    targets = [t for t in tickers if t not in skip_tickers]
    if not targets:
        logger.info("FMP: EDGAR covered all tickers — no fallback needed")
        return

    logger.info("FMP: fallback scan for %d tickers: %s", len(targets), targets)

    for ticker in targets:
        available = fmp.list_available(ticker)

        for quarter, year in available:
            filing_id = f"fmp_{ticker}_{year}_Q{quarter}"

            if store.is_processed(filing_id):
                continue

            # Filter by lookback window using approximate reporting month.
            # Calls happen ~1 month after quarter end, not at quarter start.
            # Q4 calls fall in January of the following year.
            approx_month = {1: 4, 2: 7, 3: 10, 4: 1}.get(quarter, 4)
            approx_year = year + 1 if quarter == 4 else year
            try:
                approx_date = datetime(approx_year, approx_month, 1)
            except ValueError:
                continue
            if approx_date < since:
                continue

            transcript = fmp.fetch_transcript(ticker, quarter, year)
            if not transcript or not transcript.get("content"):
                store.mark_processed(filing_id)
                continue

            # FMP date field: "2024-02-01 17:00:00" → "2024-02-01"
            call_date = transcript["date"][:10]
            store.upsert_company(ticker, ticker)  # FMP has no company name in the transcript

            _publish_transcript_and_prices(
                ticker, ticker, call_date, filing_id, "",
                transcript["content"], producer, store,
                source="fmp",
            )


# ── Shared publish helper ─────────────────────────────────────────────────────

def _publish_transcript_and_prices(
    ticker: str,
    company_name: str,
    call_date: str,
    filing_id: str,
    cik: str,
    raw_text: str,
    producer: KafkaProducer,
    store: ProcessedStore,
    source: str = "sec_edgar",
) -> bool:
    """Publish transcript + price window. Returns True if transcript published."""
    t_msg = normalise_transcript(
        ticker=ticker,
        company_name=company_name,
        call_date=call_date,
        filing_id=filing_id,
        cik=cik,
        raw_text=raw_text,
        source=source,
    )
    archive_transcript(t_msg)  # no-op locally; writes to S3 on AWS
    try:
        producer.publish_transcript(t_msg)
    except Exception as exc:
        logger.error("Kafka transcript publish failed [%s]: %s", filing_id, exc)
        return False  # don't mark processed — retry next run

    price_rows = fetch_price_window(ticker, call_date)
    if price_rows:
        p_msg = normalise_prices(ticker, call_date, price_rows)
        try:
            producer.publish_prices(p_msg)
        except Exception as exc:
            logger.error("Kafka price publish failed [%s]: %s", ticker, exc)
    else:
        logger.warning("No price data for %s on %s", ticker, call_date)

    store.mark_processed(filing_id)
    return True


# ── Main job ──────────────────────────────────────────────────────────────────

def run_ingest_job(
    cfg: Config,
    edgar: EdgarClient,
    producer: KafkaProducer,
    store: ProcessedStore,
    fmp: Optional[FmpClient],
) -> None:
    # Merge static env tickers with every user's portfolio watchlist
    watchlist_tickers = store.get_watchlist_tickers()
    all_tickers = sorted(set(cfg.tickers) | watchlist_tickers)
    new_from_watchlist = watchlist_tickers - set(cfg.tickers)

    since = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(
        days=cfg.lookback_days
    )
    logger.info(
        "Ingest run started | env=%d | watchlist=%d (+%d new) | total=%d | since=%s | fmp=%s",
        len(cfg.tickers),
        len(watchlist_tickers),
        len(new_from_watchlist),
        len(all_tickers),
        since.date(),
        "enabled" if fmp else "disabled",
    )
    if new_from_watchlist:
        logger.info("Watchlist additions: %s", sorted(new_from_watchlist))

    # Pass 1: EDGAR
    edgar_found = _edgar_scan(all_tickers, edgar, producer, store, since)
    logger.info("EDGAR pass complete | transcripts found for: %s", sorted(edgar_found))

    # Pass 2: FMP fallback (only if key is configured)
    if fmp:
        _fmp_scan(all_tickers, fmp, producer, store, since, skip_tickers=edgar_found)
    elif cfg.fmp_api_key == "":
        logger.info("FMP disabled — set FMP_API_KEY to enable fallback")

    logger.info("Ingest run complete")


# ── Entry point ───────────────────────────────────────────────────────────────

def _seed_company_universe(edgar: EdgarClient, store: ProcessedStore) -> None:
    """Populate the companies collection from EDGAR's full ticker→CIK map.

    Only runs when the collection has fewer than 1 000 entries so that normal
    restarts don't trigger an unnecessary EDGAR download.
    """
    if not store.needs_company_seed():
        logger.info("Company universe already seeded — skipping")
        return
    logger.info("Seeding company universe from EDGAR company_tickers.json …")
    companies = edgar.get_all_companies()
    n = store.seed_companies(companies)
    logger.info("Company universe seed complete — %d companies upserted (%d total in map)",
                n, len(companies))


def main() -> None:
    cfg = Config.from_env()

    edgar = EdgarClient(user_agent=cfg.edgar_user_agent)
    producer = KafkaProducer(bootstrap_servers=cfg.kafka_bootstrap_servers)
    store = ProcessedStore(mongo_uri=cfg.mongo_uri)
    fmp = FmpClient(cfg.fmp_api_key) if cfg.fmp_api_key else None

    # Seed the full company universe on startup (no-op if already done).
    # This gives the BFF search endpoint a complete universe to query against.
    _seed_company_universe(edgar, store)

    # Run the per-ticker scan immediately so you don't wait until the first hour
    run_ingest_job(cfg, edgar, producer, store, fmp)

    # Run the RSS poll immediately too — catches any filings since last run
    rss_feed.poll(edgar, store, producer)

    scheduler = BlockingScheduler(timezone="UTC")

    # ── Per-ticker backfill scan (every N hours) ───────────────────────────────
    scheduler.add_job(
        run_ingest_job,
        trigger="interval",
        hours=cfg.schedule_interval_hours,
        args=[cfg, edgar, producer, store, fmp],
        id="periodic_ingest",
        max_instances=1,
        misfire_grace_time=3600,
    )

    # ── Universal RSS feed poll (every N minutes) ──────────────────────────────
    # Polls the EDGAR live 8-K Atom feed to catch earnings filings from any
    # public company — no ticker whitelist needed.
    scheduler.add_job(
        rss_feed.poll,
        trigger="interval",
        minutes=cfg.rss_poll_interval_minutes,
        args=[edgar, store, producer],
        id="rss_feed_poll",
        max_instances=1,
        misfire_grace_time=300,
    )

    logger.info(
        "Scheduler started — per-ticker every %d hour(s), RSS every %d minute(s)",
        cfg.schedule_interval_hours,
        cfg.rss_poll_interval_minutes,
    )
    try:
        scheduler.start()
    except (KeyboardInterrupt, SystemExit):
        logger.info("Shutting down ingestor")
        producer.close()
        store.close()


if __name__ == "__main__":
    main()
