"""
Ingestor service — Phase 1.

Three-pass strategy per scheduled run:
  Pass 1 — EDGAR: scan 8-K filings for earnings call transcripts.
  Pass 2 — FMP:   fetch structured transcripts for ALL tickers (not just
                  EDGAR misses).  FMP archives many years of quarterly data
                  regardless of 8-K exhibit availability.  Cross-source
                  deduplication is handled by is_processed + has_price_reaction_for_date.
  Pass 3 — Alpha Vantage (on-demand only): 25 req/day free tier, used only
                  for single-ticker ingest_one calls.

All passes publish to the same Kafka topics:
  raw-transcripts  →  scoring-service   (Phase 2)
  raw-prices       →  correlation-service (Phase 3)
"""

import logging
import threading
from datetime import datetime, timedelta, timezone
from functools import partial
from typing import Optional, Set

from apscheduler.schedulers.background import BackgroundScheduler
from dotenv import load_dotenv

from .api import create_app
from .alphavantage import AlphaVantageClient
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
    Fetch transcripts from FMP for all tickers not in skip_tickers.

    FMP archives structured transcripts going back many years regardless of
    whether EDGAR has a matching 8-K exhibit.  Callers pass skip_tickers=set()
    to fetch the full history for every ticker; the is_processed and
    has_price_reaction_for_date guards prevent cross-source duplicates.
    """
    targets = [t for t in tickers if t not in skip_tickers]
    if not targets:
        logger.debug("FMP: all tickers excluded by skip_tickers — nothing to scan")
        return

    logger.info("FMP: scanning %d ticker(s) for historical + recent transcripts", len(targets))

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

            # Skip quarters already stored by EDGAR — they use a different filing_id
            # so is_processed would not catch the cross-source duplicate.
            if store.has_price_reaction_for_date(ticker, call_date):
                store.mark_processed(filing_id)
                continue

            # Prefer the authoritative name from EDGAR (already in the companies
            # collection) over falling back to the ticker symbol.  Use
            # prefer_existing_name=True so this call never overwrites a real name
            # that EDGAR has already set.
            real_name = store.get_company_name(ticker) or ticker
            store.upsert_company(ticker, real_name, prefer_existing_name=True)

            _publish_transcript_and_prices(
                ticker, real_name, call_date, filing_id, "",
                transcript["content"], producer, store,
                source="fmp",
            )


# ── Pass 3: Alpha Vantage (on-demand only — free tier is 25 req/day) ─────────

def _av_scan(
    tickers: list,
    av: AlphaVantageClient,
    producer: KafkaProducer,
    store: ProcessedStore,
    n_quarters: int = 8,
    skip_tickers: Set[str] = None,
) -> None:
    """
    Fetch recent transcripts from Alpha Vantage for tickers not covered by EDGAR/FMP.
    Only used in on-demand ingest_one — the 25 req/day free limit makes it unsuitable
    for bulk scheduled scans.
    """
    targets = [t for t in tickers if t not in (skip_tickers or set())]
    if not targets:
        return

    logger.info("AV: fetching last %d quarters for %d ticker(s): %s", n_quarters, len(targets), targets)

    for ticker in targets:
        transcripts = av.fetch_recent_transcripts(ticker, n_quarters)
        for t in transcripts:
            filing_id = t["filing_id"]
            if store.is_processed(filing_id):
                continue
            real_name = store.get_company_name(ticker) or ticker
            store.upsert_company(ticker, real_name, prefer_existing_name=True)
            _publish_transcript_and_prices(
                ticker, real_name, t["call_date"], filing_id, "",
                t["text"], producer, store, source="alpha_vantage",
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
    # Merge static env tickers with every user's portfolio watchlist, plus any
    # company seen in price_reactions within the last 90 days.  The last set
    # catches RSS-discovered companies whose one-time _backfill_ticker daemon
    # thread was interrupted (e.g. by a container restart) so they are retried
    # on every scheduled cycle instead of silently losing their history.
    watchlist_tickers = store.get_watchlist_tickers()
    recent_tickers    = store.get_recent_reaction_tickers(lookback_days=90)
    all_tickers = sorted(set(cfg.tickers) | watchlist_tickers | recent_tickers)
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

    # Pass 2: FMP — scan all tickers, not just EDGAR misses.
    # EDGAR only surfaces 8-K exhibits that pass the transcript detector; FMP
    # has structured archives for every quarter going back many years.  We pass
    # skip_tickers=set() so every ticker gets its full FMP history, relying on
    # the is_processed and has_price_reaction_for_date guards for dedup.
    if fmp:
        _fmp_scan(all_tickers, fmp, producer, store, since, skip_tickers=set())
    elif cfg.fmp_api_key == "":
        logger.info("FMP disabled — set FMP_API_KEY to enable fallback")

    logger.info("Ingest run complete")


# ── RSS-triggered historical backfill ────────────────────────────────────────

def _backfill_ticker(
    ticker: str,
    cfg: Config,
    edgar: EdgarClient,
    producer: KafkaProducer,
    store: ProcessedStore,
    fmp: Optional[FmpClient],
    av: Optional[AlphaVantageClient] = None,
) -> None:
    """
    Run a full EDGAR + FMP + Alpha Vantage history scan for a single ticker
    in a daemon thread. Called whenever the RSS poller discovers a new company's
    earnings call so that company's entire prior call history is also ingested.
    The is_processed guard makes repeat calls cheap — already-processed quarters
    are skipped instantly, so calling this more than once per ticker is safe.
    """
    since = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(days=cfg.lookback_days)

    def _run() -> None:
        logger.info("Backfill: %s — full history scan started", ticker)
        try:
            found = _edgar_scan([ticker], edgar, producer, store, since)
            # Always run FMP regardless of EDGAR result — EDGAR covers 8-K text
            # exhibits only; FMP has structured transcript archives going back
            # many years.  We pass skip_tickers=set() so FMP processes all
            # quarters; is_processed and has_price_reaction_for_date handle
            # cross-source deduplication.
            if fmp:
                _fmp_scan([ticker], fmp, producer, store, since, skip_tickers=set())
            if av:
                _av_scan([ticker], av, producer, store, n_quarters=4, skip_tickers=found)
        except Exception as exc:
            logger.error("Backfill: %s — error: %s", ticker, exc)
        logger.info("Backfill: %s — complete", ticker)

    threading.Thread(target=_run, daemon=True, name=f"backfill-{ticker}").start()


# ── On-demand single-ticker ingest (used by the HTTP trigger API) ─────────────

def ingest_one(
    ticker: str,
    cfg: Config,
    edgar: EdgarClient,
    producer: KafkaProducer,
    store: ProcessedStore,
    fmp: Optional[FmpClient],
    av: Optional[AlphaVantageClient] = None,
) -> None:
    """Run an immediate multi-source scan for a single ticker.

    Pass 1 — EDGAR 90-day window     (fast, surfaces the latest 8-K exhibit)
    Pass 2 — FMP all available qtrs  (fills recent + older structured quarters)
    Pass 3 — Alpha Vantage 8 qtrs    (free tier, fills gaps not in FMP)
    Pass 4 — Full historical backfill spawned in background thread
    """
    since = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(days=90)

    info = edgar.get_company_info(ticker)
    if info:
        store.upsert_company(ticker, info["name"])

    edgar_found = _edgar_scan([ticker], edgar, producer, store, since)

    # Always run FMP — EDGAR covers only what it found; FMP archives every quarter.
    # is_processed + has_price_reaction_for_date handle cross-source dedup.
    if fmp:
        _fmp_scan([ticker], fmp, producer, store, since, skip_tickers=set())

    if av:
        _av_scan([ticker], av, producer, store, n_quarters=8, skip_tickers=edgar_found)

    # Spawn full historical backfill so history depth builds in the background
    # even if the 90-day window only surfaced the latest call.
    _backfill_ticker(ticker, cfg, edgar, producer, store, fmp, av=av)


# ── Stale-price refresh job ──────────────────────────────────────────────────

_REFRESH_BATCH = 30   # max records per run to avoid hammering yfinance
_REFRESH_DELAY = 2.0  # seconds between yfinance calls within a batch

def _refresh_stale_prices(producer: KafkaProducer, store: ProcessedStore) -> None:
    """
    Re-fetch and re-publish raw OHLCV prices for PriceReaction documents that
    still have any null return (1d/3d/7d) despite being old enough for price
    data to be available.

    This covers transcripts ingested on their call date when yfinance had no
    future data yet.  Re-publishing to the raw-prices topic refreshes the
    raw_prices collection used for chart data.  The return fields themselves
    (return_1d/3d/7d) are filled by the correlation service's
    backfill_pending_returns job (runs every 4 h).
    """
    import time as _time

    stale = store.get_stale_price_records(min_age_days=1)
    if not stale:
        logger.debug("Price refresh: no stale records")
        return

    logger.info("Price refresh: %d record(s) with at least one null return", len(stale))
    refreshed = 0

    for doc in stale[:_REFRESH_BATCH]:
        ticker    = doc.get("ticker")
        call_date = doc.get("call_date")
        if not ticker or not call_date:
            continue

        price_rows = fetch_price_window(ticker, call_date)
        if price_rows:
            try:
                producer.publish_prices(normalise_prices(ticker, call_date, price_rows))
                refreshed += 1
                logger.info("Price refresh: re-published %s %s", ticker, call_date)
            except Exception as exc:
                logger.warning("Price refresh: publish failed for %s: %s", ticker, exc)
        else:
            logger.debug("Price refresh: still no price data for %s %s", ticker, call_date)

        _time.sleep(_REFRESH_DELAY)

    logger.info("Price refresh: %d/%d records re-published", refreshed, min(len(stale), _REFRESH_BATCH))


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
    av  = AlphaVantageClient(cfg.alphavantage_api_key) if cfg.alphavantage_api_key else None

    # Seed the full company universe on startup (no-op if already done).
    # This gives the BFF search endpoint a complete universe to query against.
    _seed_company_universe(edgar, store)

    # Run the per-ticker scan immediately so you don't wait until the first hour
    run_ingest_job(cfg, edgar, producer, store, fmp)

    # Immediately refresh any calls that already have null returns — don't wait
    # for the first scheduled tick two hours from now.
    _refresh_stale_prices(producer, store)

    # Callback: when RSS discovers a new company, spawn a full history backfill
    # for that ticker in a daemon thread (is_processed keeps repeat calls cheap).
    _on_new_ticker = partial(
        _backfill_ticker, cfg=cfg, edgar=edgar, producer=producer, store=store, fmp=fmp, av=av
    )

    # Run the RSS poll immediately too — catches any filings since last run
    rss_feed.poll(edgar, store, producer, _on_new_ticker)

    # BackgroundScheduler ticks in a daemon thread so Flask can own the main thread.
    scheduler = BackgroundScheduler(timezone="UTC")

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
    scheduler.add_job(
        rss_feed.poll,
        trigger="interval",
        minutes=cfg.rss_poll_interval_minutes,
        args=[edgar, store, producer, _on_new_ticker],
        id="rss_feed_poll",
        max_instances=1,
        misfire_grace_time=300,
    )

    # ── Stale-price refresh (every 2 hours) ────────────────────────────────────
    # Re-publishes prices for calls ingested on their call date when yfinance
    # had no future data yet — fills in return_1d / return_3d / return_7d as
    # each window elapses.
    scheduler.add_job(
        _refresh_stale_prices,
        trigger="interval",
        hours=2,
        args=[producer, store],
        id="price_refresh",
        max_instances=1,
        misfire_grace_time=3600,
    )

    scheduler.start()
    logger.info(
        "Scheduler started — per-ticker every %d hour(s), RSS every %d minute(s)",
        cfg.schedule_interval_hours,
        cfg.rss_poll_interval_minutes,
    )

    # ── HTTP trigger API (Flask owns the main thread) ─────────────────────────
    # Bind ingest_one with all shared objects so the API only needs the ticker.
    _ingest_one = partial(ingest_one, cfg=cfg, edgar=edgar,
                          producer=producer, store=store, fmp=fmp, av=av)

    app = create_app(_ingest_one)
    logger.info("HTTP trigger API listening on :8001")
    try:
        app.run(host="0.0.0.0", port=8001, threaded=True)
    except (KeyboardInterrupt, SystemExit):
        pass
    finally:
        logger.info("Shutting down ingestor")
        scheduler.shutdown(wait=False)
        producer.close()
        store.close()


if __name__ == "__main__":
    main()
