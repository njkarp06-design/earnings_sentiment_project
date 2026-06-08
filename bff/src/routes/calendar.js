const router        = require('express').Router();
const jwt           = require('jsonwebtoken');
const User          = require('../models/User');
const PriceReaction = require('../models/PriceReaction');

const FMP_BASE      = 'https://financialmodelingprep.com/stable';
const FMP_API_KEY   = process.env.FMP_API_KEY || '';
const SERVER_TICKERS = new Set(
  (process.env.TICKERS || '').split(',').map(t => t.trim().toUpperCase()).filter(Boolean)
);

// GET /calendar?from=YYYY-MM-DD&to=YYYY-MM-DD
// Auth optional — if a valid Bearer token is present, the user's watchlist
// tickers are also marked tracked with source='portfolio'.
// Unauthenticated requests still see server-tracked tickers (source='system').
router.get('/', async (req, res, next) => {
  try {
    if (!FMP_API_KEY) {
      return res.status(503).json({ error: 'FMP_API_KEY not configured' });
    }

    // ── Build tracked sets ────────────────────────────────────────────────────
    const portfolioTickers = new Set();

    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      try {
        const payload = jwt.verify(authHeader.slice(7), process.env.JWT_SECRET);
        const user    = await User.findById(payload.sub).select('watchlist');
        if (user?.watchlist?.length) {
          user.watchlist.forEach(t => portfolioTickers.add(t.toUpperCase()));
        }
      } catch {
        // Expired / invalid token — degrade gracefully, just use server list
      }
    }

    // ── Fetch calendar from FMP ───────────────────────────────────────────────
    const today  = new Date();
    const future = new Date(today);
    future.setDate(future.getDate() + 30);

    const from = req.query.from || today.toISOString().slice(0, 10);
    const to   = req.query.to   || future.toISOString().slice(0, 10);

    const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
    if (!DATE_RE.test(from) || !DATE_RE.test(to)) {
      return res.status(400).json({ error: 'from and to must be YYYY-MM-DD dates' });
    }

    const fmpRes = await fetch(
      `${FMP_BASE}/earnings-calendar?from=${from}&to=${to}&apikey=${FMP_API_KEY}`,
      { signal: AbortSignal.timeout(15_000) },
    );

    if (!fmpRes.ok) {
      return res.status(502).json({ error: 'FMP API request failed' });
    }

    const data = await fmpRes.json();
    if (!Array.isArray(data)) return res.json([]);

    // ── Base enrichment ───────────────────────────────────────────────────────
    const enriched = data.map(item => {
      const ticker = (item.symbol || '').toUpperCase();
      const inPortfolio = portfolioTickers.has(ticker);
      const inSystem    = SERVER_TICKERS.has(ticker);

      return {
        date:             item.date,
        ticker,
        eps_estimate:     item.epsEstimated     ?? null,
        revenue_estimate: item.revenueEstimated ?? null,
        tracked:          inPortfolio || inSystem,
        source: inPortfolio ? 'portfolio' : inSystem ? 'system' : null,
      };
    });

    // ── Historical stats from MongoDB for tracked tickers ─────────────────────
    const trackedTickers = [...new Set(enriched.filter(e => e.tracked).map(e => e.ticker))];

    if (trackedTickers.length > 0) {
      const stats = await PriceReaction.aggregate([
        { $match: { ticker: { $in: trackedTickers }, return_7d: { $ne: null }, confidence_score: { $ne: null } } },
        // Deduplicate by (ticker, call_date) — same logic as the /history endpoint —
        // so EDGAR+FMP duplicates for the same quarter aren't double-counted.
        { $addFields: { _name_quality: { $cond: [{ $ne: ['$company_name', '$ticker'] }, 1, 0] } } },
        { $sort: { call_date: -1, _name_quality: -1, correlated_at: -1 } },
        {
          $group: {
            _id: { ticker: '$ticker', call_date: '$call_date' },
            confidence_score: { $first: '$confidence_score' },
            return_7d:        { $first: '$return_7d' },
          },
        },
        {
          $group: {
            _id: '$_id.ticker',
            avg_score:     { $avg: '$confidence_score' },
            avg_return_7d: { $avg: '$return_7d' },
            total:         { $sum: 1 },
            wins:          { $sum: { $cond: [{ $gt: ['$return_7d', 0] }, 1, 0] } },
          },
        },
      ]);

      const statsMap = {};
      for (const s of stats) {
        statsMap[s._id] = {
          avg_score:    parseFloat(s.avg_score.toFixed(0)),
          avg_return_7d: parseFloat(s.avg_return_7d.toFixed(2)),
          win_rate_7d:  s.total > 0
            ? parseFloat(((s.wins / s.total) * 100).toFixed(1))
            : null,
        };
      }

      for (const item of enriched) {
        if (statsMap[item.ticker]) {
          Object.assign(item, statsMap[item.ticker]);
        }
      }
    }

    // ── Sort: portfolio first → system tracked → the rest; within group by date ─
    const rank = (s) => s === 'portfolio' ? 0 : s === 'system' ? 1 : 2;
    enriched.sort((a, b) => {
      const r = rank(a.source) - rank(b.source);
      return r !== 0 ? r : a.date.localeCompare(b.date);
    });

    res.json(enriched);
  } catch (err) {
    if (err.name === 'TimeoutError' || err.name === 'AbortError') {
      return res.status(504).json({ error: 'FMP API timed out' });
    }
    next(err);
  }
});

module.exports = router;
