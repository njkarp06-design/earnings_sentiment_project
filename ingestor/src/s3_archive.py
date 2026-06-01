"""
Best-effort S3 archiving for raw transcripts.
Active when S3_TRANSCRIPT_BUCKET is set (ECS/AWS); silently no-ops otherwise.
"""
import json
import logging
import os

import boto3

logger = logging.getLogger(__name__)

_bucket = os.getenv("S3_TRANSCRIPT_BUCKET", "")
_s3 = boto3.client("s3") if _bucket else None


def archive_transcript(transcript: dict) -> None:
    """Write transcript JSON to s3://<bucket>/transcripts/<ticker>/<filing_id>.json."""
    if not _s3:
        return
    try:
        ticker    = transcript.get("ticker", "unknown")
        filing_id = transcript.get("filing_id", "unknown")
        key = f"transcripts/{ticker}/{filing_id}.json"
        _s3.put_object(
            Bucket=_bucket,
            Key=key,
            Body=json.dumps(transcript, default=str),
            ContentType="application/json",
        )
        logger.debug("Archived to s3://%s/%s", _bucket, key)
    except Exception as exc:
        logger.warning("S3 archive skipped for %s: %s", transcript.get("filing_id"), exc)
