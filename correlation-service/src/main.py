# Phase 3 placeholder.
# Responsibilities:
#   - Consume scored-transcripts + raw-prices
#   - Compute 1d / 3d / 7d post-call price returns
#   - Write full record to MongoDB price_reactions collection

import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def main() -> None:
    logger.info("Correlation service starting (stub) — implement in Phase 3")


if __name__ == "__main__":
    main()
