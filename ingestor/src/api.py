"""
Lightweight Flask HTTP server — on-demand ingestion triggers.

Exposes one endpoint:
  POST /trigger/<TICKER>   — immediately runs an EDGAR + FMP scan for a
                             single ticker and publishes to Kafka.
  GET  /health             — liveness probe.

Runs in the main thread alongside the APScheduler BackgroundScheduler so
the scheduler can tick in the background while Flask handles HTTP requests.
"""

import logging
import re
import threading
from typing import Callable

from flask import Flask, jsonify

_TICKER_RE = re.compile(r"^[A-Z]{1,10}$")

logger = logging.getLogger(__name__)

# Tracks tickers whose on-demand scan is currently running so we don't
# double-trigger the same ticker from two concurrent requests.
_in_progress: set = set()
_lock = threading.Lock()


def create_app(ingest_one: Callable[[str], None]) -> Flask:
    """
    Build and return the Flask app.

    ingest_one: callable that accepts a single uppercase ticker string and
                runs a full EDGAR + FMP scan for it (blocking, in the
                calling thread).
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
                # Already running — tell the caller to just keep polling.
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

    return app
