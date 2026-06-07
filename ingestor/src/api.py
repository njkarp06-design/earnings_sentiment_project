"""
Lightweight Flask HTTP server — on-demand ingestion triggers.

Endpoints:
  GET  /health                  — liveness probe.
  POST /trigger/<TICKER>        — immediately runs an EDGAR + FMP scan for a
                                  single ticker and publishes to Kafka.
  POST /rebackfill/<TICKER>     — clears all processed flags for a ticker then
                                  runs a full historical re-ingest.  Use this
                                  after upgrading a data-source plan or after
                                  improving transcript detection to surface
                                  calls previously missed.
  POST /rebackfill-all          — same as above but for every tracked ticker
                                  (cfg.tickers + watchlists + RSS-discovered)
                                  in one shot.

Runs in the main thread alongside the APScheduler BackgroundScheduler so
the scheduler can tick in the background while Flask handles HTTP requests.
"""

import logging
import re
import threading
from typing import Callable, Optional

from flask import Flask, jsonify

_TICKER_RE = re.compile(r"^[A-Z]{1,10}$")

logger = logging.getLogger(__name__)

# Tracks tickers whose on-demand scan is currently running so we don't
# double-trigger the same ticker from two concurrent requests.
_in_progress: set = set()
_lock = threading.Lock()


def create_app(
    ingest_one: Callable[[str], None],
    rebackfill_one: Optional[Callable[[str], None]] = None,
    rebackfill_all: Optional[Callable[[], None]] = None,
) -> Flask:
    """
    Build and return the Flask app.

    ingest_one:      callable(ticker) — runs a full EDGAR + FMP scan.
    rebackfill_one:  callable(ticker) — clears processed flags then re-ingests.
                     Optional; if None, POST /rebackfill/<ticker> returns 501.
    rebackfill_all:  callable() — re-backfills every tracked ticker in sequence.
                     Optional; if None, POST /rebackfill-all returns 501.
    """
    app = Flask(__name__)

    # Silence Flask's default request logger — the ingestor has its own format.
    logging.getLogger("werkzeug").setLevel(logging.WARNING)

    @app.get("/health")
    def health():
        return jsonify({"status": "ok"})

    @app.post("/trigger/<ticker>")
    def trigger(ticker: str):
        ticker = ticker.upper()
        if not _TICKER_RE.match(ticker):
            return jsonify({"error": "Invalid ticker — must be 1–10 uppercase letters"}), 400

        with _lock:
            if ticker in _in_progress:
                return jsonify({"status": "already_running", "ticker": ticker}), 202
            _in_progress.add(ticker)

        def _run():
            try:
                logger.info("On-demand ingest: %s", ticker)
                ingest_one(ticker)
            except Exception as exc:
                logger.error("On-demand ingest failed for %s: %s", ticker, exc)
            finally:
                with _lock:
                    _in_progress.discard(ticker)

        threading.Thread(target=_run, daemon=True, name=f"trigger-{ticker}").start()
        return jsonify({"status": "triggered", "ticker": ticker})

    @app.post("/rebackfill/<ticker>")
    def rebackfill(ticker: str):
        if rebackfill_one is None:
            return jsonify({"error": "rebackfill_one not configured"}), 501

        ticker = ticker.upper()
        if not _TICKER_RE.match(ticker):
            return jsonify({"error": "Invalid ticker — must be 1–10 uppercase letters"}), 400

        with _lock:
            if ticker in _in_progress:
                return jsonify({"status": "already_running", "ticker": ticker}), 202
            _in_progress.add(ticker)

        def _run():
            try:
                logger.info("Force re-backfill: %s", ticker)
                rebackfill_one(ticker)
            except Exception as exc:
                logger.error("Re-backfill failed for %s: %s", ticker, exc)
            finally:
                with _lock:
                    _in_progress.discard(ticker)

        threading.Thread(target=_run, daemon=True, name=f"rebackfill-{ticker}").start()
        return jsonify({"status": "triggered", "ticker": ticker, "mode": "force_rebackfill"})

    @app.post("/rebackfill-all")
    def rebackfill_all_route():
        if rebackfill_all is None:
            return jsonify({"error": "rebackfill_all not configured"}), 501

        key = "__rebackfill_all__"
        with _lock:
            if key in _in_progress:
                return jsonify({"status": "already_running", "mode": "rebackfill_all"}), 202
            _in_progress.add(key)

        def _run():
            try:
                logger.info("Bulk re-backfill triggered via API")
                rebackfill_all()
            except Exception as exc:
                logger.error("Bulk re-backfill failed: %s", exc)
            finally:
                with _lock:
                    _in_progress.discard(key)

        threading.Thread(target=_run, daemon=True, name="rebackfill-all").start()
        return jsonify({"status": "triggered", "mode": "rebackfill_all"})

    return app
