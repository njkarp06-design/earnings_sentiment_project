# Phase 2 placeholder.
# Responsibilities:
#   - Consume raw-transcripts topic
#   - Call Claude API with structured prompt → score (0-100) + key phrases
#   - Publish result to scored-transcripts topic

import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def main() -> None:
    logger.info("Scoring service starting (stub) — implement in Phase 2")


if __name__ == "__main__":
    main()
