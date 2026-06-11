# EarningsSentiment

A real-time earnings intelligence platform that scores CEO confidence from earnings call transcripts using Claude AI, then correlates those scores against post-earnings stock returns to surface predictive patterns.

---

## What it does

Every time a public company files an earnings call transcript with the SEC, the pipeline:

1. **Ingests** the transcript from EDGAR (SEC filings), FMP (structured archives), or Alpha Vantage
2. **Scores** the CEO's language via Claude — confidence score (0–100), key phrases, guidance direction, Q&A defensiveness, and a one-paragraph trade brief
3. **Correlates** the score against 1d, 3d, and 7d post-call price moves via yfinance
4. **Surfaces** the results in a live feed, leaderboard, sector breakdown, predictability scatter, and earnings calendar

The result is a dataset and UI that answers: *does how a CEO talks on earnings calls actually predict what the stock does next?*

---

## Architecture

```
                        ┌─────────────┐
  EDGAR / FMP / AV ───▶ │   Ingestor  │ ──▶ raw-transcripts ──▶ ┌─────────────────┐
                        │  (Python)   │ ──▶ raw-prices       ──▶ │  Scoring Svc    │
                        └─────────────┘                          │  (Python/Claude)│
                                                                  └────────┬────────┘
                                                                           │ scored-transcripts
                                                                  ┌────────▼────────┐
                                                                  │ Correlation Svc │
                                                                  │ (Python/yfinance)│
                                                                  └────────┬────────┘
                                                                           │
                                                                  ┌────────▼────────┐
                                                                  │    MongoDB      │
                                                                  └────────┬────────┘
                                                                           │
                                                                  ┌────────▼────────┐
                                                                  │   BFF (Node.js) │ ◀── JWT auth
                                                                  └────────┬────────┘
                                                                           │
                                                                  ┌────────▼────────┐
                                                                  │  Frontend       │
                                                                  │  (Next.js 14)   │
                                                                  └─────────────────┘
```

**Kafka topics:** `raw-transcripts` · `raw-prices` · `scored-transcripts`

**MongoDB collections:** `price_reactions` · `scores` · `companies` · `users` · `raw_prices`

---

## Stack

| Layer | Technology |
|---|---|
| Ingestor | Python · EDGAR API · FMP API · Alpha Vantage |
| Scoring | Python · Anthropic Claude API (`claude-sonnet-4-6`) |
| Correlation | Python · yfinance |
| Message bus | Apache Kafka (Confluent) |
| Database | MongoDB 7 |
| BFF API | Node.js · Express · JWT |
| Frontend | Next.js 14 (App Router) · Tailwind CSS · Recharts |
| Infrastructure | Docker Compose (local) · AWS ECS Fargate + MSK + Atlas (production) |

---

## Features

- **Live feed** — scored calls stream in as they are filed; cards show 1d/3d/7d returns with sparklines
- **CEO confidence scoring** — Claude scores language 0–100 with key phrases, guidance flag (raised/maintained/lowered/withdrawn), Q&A defensiveness, and a trade brief
- **Post-earnings drift chart** — average price path day 0→7 across all calls, with ±1 std dev band and ghost lines for each prior call
- **Predictability scatter** — Pearson r between confidence score and 7d return; regression line overlay
- **Score trend & sector-relative return** — confidence trajectory over recent calls; company avg vs sector avg
- **Leaderboard** — companies ranked by average 7d post-call return with win rate and track record
- **Sector pulse** — aggregate post-earnings returns by sector, sector-level drift chart, company rankings
- **Earnings calendar** — upcoming reports via FMP with historical score/return context for tracked tickers
- **Portfolio watchlist** — save companies, get email notifications when they report
- **Deep analysis (Inspect)** — SSE-streamed Claude analysis of any individual call
- **Search** — full company universe (~10k US-listed companies from EDGAR)

---

## Running locally

### Prerequisites

- Docker and Docker Compose
- An [Anthropic API key](https://console.anthropic.com/)
- An [FMP API key](https://site.financialmodelingprep.com/) (recommended — enables richer transcript archives and the earnings calendar)

### 1. Clone and configure

```bash
git clone https://github.com/njkarp06-design/earnings_sentiment_project.git
cd earnings_sentiment_project
cp .env.example .env   # then fill in your keys (see Environment Variables below)
```

### 2. Start

```bash
docker compose up --build
```

The first run seeds the full EDGAR company universe (~10k companies) and immediately begins ingesting transcripts for the configured tickers. Allow 2–3 minutes for the first scored call to appear.

### 3. Open

| Service | URL |
|---|---|
| Frontend | http://localhost:3000 |
| BFF API | http://localhost:3001 |
| Kafka UI | http://localhost:8080 |
| Ingestor trigger API | http://localhost:8001 |

---

## Environment variables

Create a `.env` file in the project root. All variables are optional unless marked **required**.

```bash
# ── API keys ──────────────────────────────────────────────────────────────────

# Required — powers the scoring service and the Inspect feature
ANTHROPIC_API_KEY=sk-ant-...

# Strongly recommended — unlocks structured transcript archives (years of history)
# and the earnings calendar endpoint
FMP_API_KEY=...

# Optional — Alpha Vantage free tier (25 req/day), used only for on-demand single-ticker fetches
ALPHAVANTAGE_API_KEY=...

# ── Auth ──────────────────────────────────────────────────────────────────────

# Required — change this to a long random string in production
JWT_SECRET=change-me-in-production

# ── Ingestor ──────────────────────────────────────────────────────────────────

# SEC requires a meaningful user agent: "Company contact@email.com"
EDGAR_USER_AGENT=YourName contact@yourcompany.com

# Comma-separated list of tickers the pipeline monitors automatically
TICKERS=AAPL,MSFT,GOOGL,AMZN,META,NVDA,TSLA,JPM,JNJ,XOM

# How far back to scan for historical transcripts on startup (days)
LOOKBACK_DAYS=730

# How often to re-scan the full ticker list (hours)
SCHEDULE_INTERVAL_HOURS=2

# ── Scoring ───────────────────────────────────────────────────────────────────

# Claude model used for scoring (defaults to claude-sonnet-4-6)
SCORING_MODEL=claude-sonnet-4-6

# ── Notifications (optional) ──────────────────────────────────────────────────

# Set to "resend" to enable email notifications when portfolio companies report
NOTIFICATION_PROVIDER=none
RESEND_API_KEY=...
NOTIFY_FROM_EMAIL=onboarding@resend.dev
APP_URL=http://localhost:3000

# ── MongoDB (Docker Compose defaults) ────────────────────────────────────────

MONGO_ROOT_USER=admin
MONGO_ROOT_PASSWORD=password

# ── Frontend ──────────────────────────────────────────────────────────────────

# BFF URL — override if deploying frontend separately
NEXT_PUBLIC_API_URL=http://localhost:3001
CORS_ORIGIN=http://localhost:3000
```

---

## BFF API

Base URL: `http://localhost:3001`

**Public**

| Method | Path | Description |
|---|---|---|
| `GET` | `/feed` | Latest 50 scored calls (last 12 months), deduplicated by call date |
| `GET` | `/feed?since=<ISO>` | Incremental feed — only items correlated after the given timestamp |
| `GET` | `/leaderboard` | Companies ranked by avg 7d post-call return |
| `GET` | `/sectors` | Sector summary stats (avg returns, win rate, company count) |
| `GET` | `/sectors/:sector` | Sector drift path + per-company rankings |
| `GET` | `/pulse` | Market pulse bar — avg confidence + 7d return per sector |
| `GET` | `/companies/:ticker/history` | All calls for a ticker, newest first |
| `GET` | `/companies/:ticker/latest` | Most recent call for a ticker |
| `GET` | `/companies/:ticker/accuracy` | Track record by score bucket (high/mid/low) |
| `GET` | `/companies/:ticker` | Basic company info from EDGAR universe |
| `GET` | `/search?q=` | Search company universe by ticker or name |
| `GET` | `/calendar` | Upcoming earnings (30 days) via FMP |

**Auth required** (`Authorization: Bearer <token>`)

| Method | Path | Description |
|---|---|---|
| `POST` | `/auth/register` | Create account |
| `POST` | `/auth/login` | Sign in, returns JWT |
| `GET` | `/auth/me` | Current user profile |
| `PATCH` | `/auth/preferences` | Update notification settings |
| `GET` | `/portfolio` | Watchlist items with latest earnings data |
| `POST` | `/portfolio/:ticker` | Add ticker to watchlist |
| `DELETE` | `/portfolio/:ticker` | Remove ticker from watchlist |
| `GET` | `/suggestions` | AI-recommended companies based on watchlist sectors |
| `POST` | `/companies/:ticker/ingest` | Trigger on-demand EDGAR+FMP scan for a ticker |
| `POST` | `/companies/rebackfill` | Force re-score all tracked tickers |
| `POST` | `/inspect` | SSE stream — Claude deep analysis of a single call |

---

## Demo data

To populate the UI without waiting for live ingestion, run the demo injection script while the stack is up:

```bash
python inject_demo_data.py
```

This writes a set of realistic mock `price_reactions` records to MongoDB so all pages render immediately.

---

## Project structure

```
earnings_sentiment_project/
├── ingestor/              # Python — EDGAR/FMP/AV ingestion, Kafka producer
├── scoring-service/       # Python — Claude scoring, Kafka consumer/producer
├── correlation-service/   # Python — yfinance price correlation, Kafka consumer
├── bff/                   # Node.js Express — REST API, JWT auth, MongoDB queries
├── frontend/              # Next.js 14 — full UI
├── infra/                 # Terraform — AWS ECS, MSK, ALB, ECR, Secrets Manager
├── mongo/                 # MongoDB init scripts
├── docker-compose.yml
└── inject_demo_data.py    # Seed script for demo/testing
```

---

## Production (AWS)

The `infra/` directory contains Terraform modules for deploying to AWS:

- **ECS Fargate** — all five application services as containers
- **Amazon MSK** — managed Kafka
- **MongoDB Atlas** — managed MongoDB (configured via Secrets Manager)
- **ALB** — public load balancers for BFF and frontend
- **ECR** — container image registry
- **CloudWatch** — structured logs from all services
- **GitHub Actions** — CI/CD pipeline (`.github/workflows/`)

See [infra/README.md](infra/) for Terraform setup and the required GitHub Secrets.

---

## License

MIT
