"""
Portfolio notification service.

Sends an email to every user who has a ticker in their watchlist when
that company's earnings call is correlated and written to MongoDB.

Active only when NOTIFICATION_PROVIDER=resend and RESEND_API_KEY is set.
Idempotent — tracks sent notifications in _sent_notifications collection
so re-runs never double-email.
"""

import logging
import os
from datetime import datetime, timezone

logger = logging.getLogger(__name__)

_PROVIDER   = os.getenv("NOTIFICATION_PROVIDER", "none")
_API_KEY    = os.getenv("RESEND_API_KEY", "")
_APP_URL    = os.getenv("APP_URL", "http://localhost:3000")
_FROM_EMAIL = os.getenv("NOTIFY_FROM_EMAIL", "onboarding@resend.dev")


def notify_portfolio_users(db, doc: dict) -> None:
    """Send email to all users with this ticker in their watchlist."""
    if _PROVIDER != "resend" or not _API_KEY:
        return

    ticker    = doc.get("ticker", "")
    call_date = doc.get("call_date", "")
    if not ticker or not call_date:
        return

    # Find users who follow this ticker AND have opted in to notifications
    users = list(db.users.find(
        {"watchlist": ticker, "notifications_enabled": True},
        {"email": 1, "notifications_email": 1, "_id": 1},
    ))
    if not users:
        return

    # Ensure idempotency index exists
    db._sent_notifications.create_index(
        [("user_id", 1), ("ticker", 1), ("call_date", 1)],
        unique=True,
        background=True,
    )

    # Which users already notified for this call?
    already = {
        str(n["user_id"])
        for n in db._sent_notifications.find(
            {"ticker": ticker, "call_date": call_date}, {"user_id": 1}
        )
    }

    import resend
    resend.api_key = _API_KEY

    for user in users:
        user_id = str(user["_id"])
        if user_id in already:
            continue
        try:
            to = user.get("notifications_email") or user["email"]
            _send(to, doc)
            db._sent_notifications.insert_one({
                "user_id": user_id,
                "ticker":  ticker,
                "call_date": call_date,
                "sent_at": datetime.now(timezone.utc).isoformat(),
            })
            logger.info("Notification sent  %s → %s", ticker, user["email"])
        except Exception as exc:
            logger.warning("Notification failed %s → %s: %s", ticker, user["email"], exc)


def _send(to_email: str, doc: dict) -> None:
    import resend

    ticker   = doc.get("ticker", "")
    company  = doc.get("company_name") or ticker
    score    = doc.get("confidence_score")
    phrases  = doc.get("key_phrases", [])[:3]
    ret_1d   = doc.get("return_1d")
    call_date = doc.get("call_date", "")

    score_color = "#10b981" if score and score >= 70 else "#f59e0b" if score and score >= 45 else "#ef4444"
    score_label = "High confidence" if score and score >= 70 else "Neutral" if score and score >= 45 else "Cautious"

    ret_html = ""
    if ret_1d is not None:
        sign  = "+" if ret_1d >= 0 else ""
        color = "#10b981" if ret_1d >= 0 else "#ef4444"
        ret_html = f"""
        <div style="margin-bottom:20px">
          <p style="color:{color};font-size:22px;font-weight:700;margin:0">
            {sign}{ret_1d:.2f}%
            <span style="color:#94a3b8;font-size:13px;font-weight:400"> 1-day return</span>
          </p>
        </div>"""

    phrases_html = "".join(
        f'<span style="background:#1e293b;color:#cbd5e1;padding:4px 12px;border-radius:20px;'
        f'font-size:12px;margin:2px 4px 2px 0;display:inline-block">{p}</span>'
        for p in phrases
    )

    company_url = f"{_APP_URL}/companies/{ticker}"

    html = f"""
    <div style="font-family:system-ui,-apple-system,sans-serif;max-width:520px;margin:0 auto;
                background:#0f172a;color:#e2e8f0;padding:32px;border-radius:12px">

      <p style="color:#64748b;font-size:11px;text-transform:uppercase;letter-spacing:0.1em;margin:0 0 8px">
        Portfolio Alert
      </p>
      <h1 style="color:#f1f5f9;font-size:26px;font-weight:700;margin:0 0 4px">{ticker}</h1>
      <p style="color:#94a3b8;margin:0 0 28px;font-size:14px">{company} &nbsp;·&nbsp; {call_date}</p>

      <div style="background:#1e293b;border-radius:10px;padding:20px 24px;margin-bottom:20px">
        <p style="color:#64748b;font-size:11px;text-transform:uppercase;letter-spacing:0.1em;margin:0 0 6px">
          CEO Confidence
        </p>
        <p style="color:{score_color};font-size:32px;font-weight:700;margin:0 0 2px">
          {score}
          <span style="font-size:16px;color:#64748b;font-weight:400">/100</span>
        </p>
        <p style="color:{score_color};font-size:13px;margin:0">{score_label}</p>
      </div>

      {ret_html}

      {f'<div style="margin-bottom:24px"><p style="color:#64748b;font-size:11px;text-transform:uppercase;letter-spacing:0.1em;margin:0 0 8px">Key Phrases</p>{phrases_html}</div>' if phrases else ''}

      <a href="{company_url}"
         style="display:inline-block;background:#2563eb;color:#ffffff;padding:12px 28px;
                border-radius:8px;text-decoration:none;font-weight:600;font-size:14px">
        View Full Analysis →
      </a>

      <hr style="border:none;border-top:1px solid #1e293b;margin:28px 0 16px">
      <p style="color:#475569;font-size:11px;margin:0">
        You're receiving this because <strong>{ticker}</strong> is in your EarningsSentiment portfolio.
      </p>
    </div>
    """

    resend.Emails.send({
        "from":    _FROM_EMAIL,
        "to":      [to_email],
        "subject": f"{ticker} just reported — CEO confidence {score}/100",
        "html":    html,
    })
