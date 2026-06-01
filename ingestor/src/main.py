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
from .store import ProcessedStore

load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(name)s — %(message)s",
)
logger = logging.getLogger(__name__)


# ── Pass 1: EDGAR ─────────────────────────────────────────────────────────────

def _edgar_scan(
    cfg: Config,
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

    for ticker in cfg.tickers:
        info = edgar.get_company_info(ticker)
        if not info:
            logger.warning("EDGAR: no CIK for %s — skipping", ticker)
            continue

        cik = info["cik"]
        company_name = info["name"]

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
                store.mark_processed(acc_no)
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
    cfg: Config,
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
    targets = [t for t in cfg.tickers if t not in skip_tickers]
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
    since = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(
        days=cfg.lookback_days
    )
    logger.info(
        "Ingest run started | tickers=%d | since=%s | fmp=%s",
        len(cfg.tickers),
        since.date(),
        "enabled" if fmp else "disabled",
    )

    # Pass 1: EDGAR
    edgar_found = _edgar_scan(cfg, edgar, producer, store, since)
    logger.info("EDGAR pass complete | transcripts found for: %s", sorted(edgar_found))

    # Pass 2: FMP fallback (only if key is configured)
    if fmp:
        _fmp_scan(cfg, fmp, producer, store, since, skip_tickers=edgar_found)
    elif cfg.fmp_api_key == "":
        logger.info("FMP disabled — set FMP_API_KEY to enable fallback")

    logger.info("Ingest run complete")


# ── Entry point ───────────────────────────────────────────────────────────────

def main() -> None:
    cfg = Config.from_env()

    edgar = EdgarClient(user_agent=cfg.edgar_user_agent)
    producer = KafkaProducer(bootstrap_servers=cfg.kafka_bootstrap_servers)
    store = ProcessedStore(mongo_uri=cfg.mongo_uri)
    fmp = FmpClient(cfg.fmp_api_key) if cfg.fmp_api_key else None

    # Run once immediately so you don't wait until the scheduled hour
    run_ingest_job(cfg, edgar, producer, store, fmp)

    scheduler = BlockingScheduler(timezone="UTC")
    scheduler.add_job(
        run_ingest_job,
        trigger="cron",
        hour=cfg.schedule_hour,
        minute=0,
        args=[cfg, edgar, producer, store, fmp],
        id="nightly_ingest",
        max_instances=1,
        misfire_grace_time=3600,
    )

    logger.info("Scheduler started — next run at %02d:00 UTC daily", cfg.schedule_hour)
    try:
        scheduler.start()
    except (KeyboardInterrupt, SystemExit):
        logger.info("Shutting down ingestor")
        producer.close()
        store.close()


if __name__ == "__main__":
    main()
