# EarningsSentiment

**Does how a CEO speaks on an earnings call predict what the stock does next?**

EarningsSentiment is a real-time intelligence platform that answers this question at scale. It ingests earnings call transcripts as they are filed with the SEC, scores the CEO's language using Claude AI, and automatically correlates those scores against 1-day, 3-day, and 7-day post-call price moves — building an ever-growing dataset of whether executive language actually signals anything.

---

## How the scoring works

Every transcript is sent to Claude with a structured analytical prompt. Claude returns five signals:

| Signal | What it measures |
|---|---|
| **Confidence score** (0–100) | Overall CEO language confidence — from crisis language (0–29) through cautious (30–49), neutral (50–69), confident (70–89), to exceptionally specific and grounded (90–100) |
| **Key phrases** | The 3 verbatim phrases that drove the score most |
| **Guidance flag** | Did management raise, maintain, lower, or withdraw forward guidance? |
| **Trade brief** | Two plain-English sentences for a short-term trader: what the tone signals for the next week, and the single most important forward-looking statement |
| **Q&A defensiveness** (0–10) | How much more evasive management became during analyst Q&A vs. their prepared remarks — a divergence signal many analysts miss |

The system prompt is sent with Claude's prompt caching, so repeated calls for different transcripts reuse the cached context — cutting latency by ~80% and token cost by ~90% on cache hits.

---

## Architecture

```
  Data Sources                Kafka Pipeline              Storage & API
  ────────────                ──────────────              ─────────────

  SEC EDGAR  ──┐                                          ┌─ MongoDB
  FMP        ──┼──▶ Ingestor ──▶ raw-transcripts ──▶ Scoring Service ─┤
  Alpha Vant ──┘         │                                │             └─ BFF (Node.js)
                         └──▶ raw-prices ──▶ Correlation Service          │
                                                    (yfinance)          Frontend
                                                          │             (Next.js 14)
                                                    price_reactions
```

**Services**

| Service | Language | Role |
|---|---|---|
| `ingestor` | Python | Polls EDGAR 8-K RSS feed + scheduled scans; publishes transcripts and price windows to Kafka |
| `scoring-service` | Python | Consumes `raw-transcripts`; calls Claude; publishes to `scored-transcripts` |
| `correlation-service` | Python | Consumes `scored-transcripts`; fetches 1d/3d/7d returns via yfinance; writes `price_reactions` to MongoDB |
| `bff` | Node.js / Express | REST API with JWT auth; serves all frontend data from MongoDB |
| `frontend` | Next.js 14 | Full UI — feed, leaderboard, sectors, company pages, calendar, portfolio |

**Kafka topics:** `raw-transcripts` · `raw-prices` · `scored-transcripts`

**MongoDB collections:** `price_reactions` · `scores` · `companies` · `users` · `raw_prices`

---

## Features

**Pipeline**
- Multi-source ingestion: EDGAR (SEC 8-K filings), FMP structured archives, Alpha Vantage
- Cross-source deduplication — EDGAR and FMP records for the same call are merged cleanly, always preferring the authoritative EDGAR company name
- 4-hourly backfill of return windows as trading days elapse post-call
- On-demand single-ticker ingest triggered from the UI

**Analysis**
- Confidence score with key phrase extraction
- Guidance direction (raised / maintained / lowered / withdrawn)
- Q&A defensiveness score — divergence between prepared remarks and analyst Q&A
- Plain-English trade brief for each call
- Post-earnings drift chart — average price path day 0→7, ±1 std dev band, ghost lines for each prior call
- Predictability scatter — Pearson r correlation between CEO confidence and 7d return with regression overlay
- Score trend over recent calls; company avg 7d return vs sector benchmark

**UI**
- Live feed — cards stream in with sparklines, score, key phrases, and return badges; incrementally polls for new items
- Leaderboard — companies ranked by average 7d post-call return with win rate and score
- Sector pulse — aggregate drift charts and company rankings per sector
- Earnings calendar — upcoming reports via FMP with historical score/return context for tracked tickers
- Company page — full call history, score chart, drift profile, predictability scatter, track record by score bucket, individual call deep-dives
- Portfolio watchlist — save companies; email alerts when they report (via Resend)
- Deep analysis — SSE-streamed Claude analysis of any individual call (10 req/hour per user)
- Search — full ~10k US-listed company universe from EDGAR

---

## Running locally

### Prerequisites

- [Docker](https://docs.docker.com/get-docker/) and Docker Compose
- [Anthropic API key](https://console.anthropic.com/) — required for scoring
- [FMP API key](https://site.financialmodelingprep.com/) — strongly recommended (structured transcript archives going back years, plus the earnings calendar)

### 1. Clone

```bash
git clone https://github.com/njkarp06-design/earnings_sentiment_project.git
cd earnings_sentiment_project
```

### 2. Configure

```bash
cp .env.example .env
```

At minimum, set these three in `.env`:

```bash
ANTHROPIC_API_KEY=sk-ant-...
FMP_API_KEY=...
EDGAR_USER_AGENT=YourName contact@yourcompany.com   # SEC requires a real contact
```

See [Environment variables](#environment-variables) for the full reference.

### 3. Start

```bash
docker compose up --build
```

On first run the ingestor seeds the full EDGAR company universe (~10k US-listed companies) then immediately begins scanning transcripts for the configured tickers. Allow 2–3 minutes for the first scored call to appear in the feed.

### 4. Open

| | URL |
|---|---|
| **App** | http://localhost:3000 |
| BFF API | http://localhost:3001 |
| Kafka UI | http://localhost:8080 |
| Ingestor trigger API | http://localhost:8001 |

### Seed demo data

To populate all pages immediately without waiting for live ingestion:

```bash
python tools/inject_demo_data.py
```

---

## Environment variables

All values are optional unless marked **required**.

### Core

| Variable | Default | Notes |
|---|---|---|
| `ANTHROPIC_API_KEY` | — | **Required.** Powers scoring and the Inspect feature |
| `FMP_API_KEY` | — | Strongly recommended. Enables structured transcript archives and `/calendar` |
| `ALPHAVANTAGE_API_KEY` | — | Optional. Free tier (25 req/day) — used only for on-demand single-ticker fetches |
| `JWT_SECRET` | `changeme` | **Required in production.** Use a long random string |
| `EDGAR_USER_AGENT` | `EarningsSentimentResearch contact@example.com` | SEC requires a real company name and contact email |

### Ingestor

| Variable | Default | Notes |
|---|---|---|
| `TICKERS` | `AAPL,MSFT,GOOGL,AMZN,META,NVDA,TSLA,JPM,JNJ,XOM` | Comma-separated list of tickers the pipeline monitors automatically |
| `LOOKBACK_DAYS` | `730` | How far back to scan for historical transcripts on startup |
| `SCHEDULE_INTERVAL_HOURS` | `2` | How often to re-scan the full ticker list |

### Scoring

| Variable | Default | Notes |
|---|---|---|
| `SCORING_MODEL` | `claude-sonnet-4-6` | Claude model ID to use for scoring |

### Notifications (optional)

| Variable | Default | Notes |
|---|---|---|
| `NOTIFICATION_PROVIDER` | `none` | Set to `resend` to enable email alerts |
| `RESEND_API_KEY` | — | Required if `NOTIFICATION_PROVIDER=resend` |
| `NOTIFY_FROM_EMAIL` | `onboarding@resend.dev` | Sender address |
| `APP_URL` | `http://localhost:3000` | Used in notification email links |

### Frontend / networking

| Variable | Default | Notes |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | `http://localhost:3001` | BFF URL as seen by the browser |
| `CORS_ORIGIN` | `http://localhost:3000` | Allowed CORS origin for the BFF |

---

## API reference

Base URL: `http://localhost:3001`

### Public endpoints

| Method | Path | Description |
|---|---|---|
| `GET` | `/feed` | Latest 50 scored calls (last 12 months) |
| `GET` | `/feed?since=<ISO>` | Incremental feed — items correlated after timestamp |
| `GET` | `/leaderboard` | Tickers ranked by avg 7d post-call return |
| `GET` | `/sectors` | Summary stats per sector (avg returns, win rate) |
| `GET` | `/sectors/:sector` | Drift path + company rankings for one sector |
| `GET` | `/pulse` | Market pulse — avg confidence + return per sector |
| `GET` | `/search?q=` | Search ~10k company universe by ticker or name |
| `GET` | `/calendar` | Upcoming earnings (30 days) with historical context |
| `GET` | `/companies/:ticker/history` | All scored calls for a ticker |
| `GET` | `/companies/:ticker/latest` | Most recent call |
| `GET` | `/companies/:ticker/accuracy` | Track record by confidence bucket |
| `GET` | `/companies/:ticker` | Company info from EDGAR universe |

### Authenticated endpoints (`Authorization: Bearer <token>`)

| Method | Path | Description |
|---|---|---|
| `POST` | `/auth/register` | Create account |
| `POST` | `/auth/login` | Sign in — returns JWT |
| `GET` | `/auth/me` | Current user + notification prefs |
| `PATCH` | `/auth/preferences` | Update notification settings |
| `GET` | `/portfolio` | Watchlist with latest earnings data |
| `POST` | `/portfolio/:ticker` | Add to watchlist |
| `DELETE` | `/portfolio/:ticker` | Remove from watchlist |
| `GET` | `/suggestions` | Recommended companies based on watchlist sectors |
| `POST` | `/companies/:ticker/ingest` | Trigger on-demand scan for a ticker |
| `POST` | `/companies/rebackfill` | Force re-score all tracked tickers |
| `POST` | `/inspect` | SSE stream — Claude deep analysis of a call (10 req/hour) |

---

## Project structure

```
earnings_sentiment_project/
├── ingestor/              # EDGAR/FMP/Alpha Vantage ingestion + Kafka producer
├── scoring-service/       # Claude scoring — Kafka consumer/producer
├── correlation-service/   # yfinance price correlation — Kafka consumer
├── bff/                   # Node.js Express REST API + JWT auth
├── frontend/              # Next.js 14 App Router UI
├── infra/                 # Terraform — AWS ECS, MSK, ALB, ECR, Secrets Manager
├── mongo/                 # MongoDB init scripts
├── tools/                 # Dev/test utilities (inject_demo_data, inject_fields, etc.)
├── presentation/          # Bootcamp presentation script + screenshots
└── docker-compose.yml
```

---

## Deploying to AWS

The `infra/` directory contains Terraform for a full production deployment:

- **ECS Fargate** for all five application services
- **Amazon MSK** (managed Kafka)
- **MongoDB Atlas** via Secrets Manager
- **ALBs** for BFF and frontend
- **ECR** for container images
- **CloudWatch** for structured logs
- **GitHub Actions** CI/CD (`.github/workflows/`)

Six GitHub Secrets are needed before the first deploy — see `infra/` for the full checklist.

---

## License

MIT
