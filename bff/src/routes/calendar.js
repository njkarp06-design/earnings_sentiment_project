const router  = require('express').Router();
const jwt     = require('jsonwebtoken');
const User    = require('../models/User');

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

    const fmpRes = await fetch(
      `${FMP_BASE}/earnings-calendar?from=${from}&to=${to}&apikey=${FMP_API_KEY}`
    );

    if (!fmpRes.ok) {
      return res.status(502).json({ error: 'FMP API request failed' });
    }

    const data = await fmpRes.json();
    if (!Array.isArray(data)) return res.json([]);

    // ── Enrich + sort ─────────────────────────────────────────────────────────
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
        // 'portfolio' → user's own watchlist  |  'system' → server TICKERS  |  null → neither
        source: inPortfolio ? 'portfolio' : inSystem ? 'system' : null,
      };
    });

    // Sort: portfolio first → system tracked → the rest; within each group by date
    const rank = (s) => s === 'portfolio' ? 0 : s === 'system' ? 1 : 2;
    enriched.sort((a, b) => {
      const r = rank(a.source) - rank(b.source);
      return r !== 0 ? r : a.date.localeCompare(b.date);
    });

    res.json(enriched);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
