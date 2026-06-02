const router = require('express').Router();

const FMP_BASE    = 'https://financialmodelingprep.com/api/v3';
const FMP_API_KEY = process.env.FMP_API_KEY || '';
const TRACKED     = (process.env.TICKERS || '')
  .split(',').map(t => t.trim().toUpperCase()).filter(Boolean);

// GET /calendar?from=YYYY-MM-DD&to=YYYY-MM-DD
// Defaults to today → +30 days.  Marks each entry with `tracked: true` when
// the ticker is in our configured watchlist.
router.get('/', async (req, res, next) => {
  try {
    if (!FMP_API_KEY) {
      return res.status(503).json({ error: 'FMP_API_KEY not configured' });
    }

    const today   = new Date();
    const future  = new Date(today);
    future.setDate(future.getDate() + 30);

    const from = req.query.from || today.toISOString().slice(0, 10);
    const to   = req.query.to   || future.toISOString().slice(0, 10);

    const url = `${FMP_BASE}/earning_calendar?from=${from}&to=${to}&apikey=${FMP_API_KEY}`;
    const fmpRes = await fetch(url);

    if (!fmpRes.ok) {
      return res.status(502).json({ error: 'FMP API request failed' });
    }

    const data = await fmpRes.json();
    if (!Array.isArray(data)) {
      return res.json([]);
    }

    const enriched = data.map(item => ({
      date:              item.date,
      ticker:            item.symbol,
      eps_estimate:      item.epsEstimated ?? null,
      revenue_estimate:  item.revenueEstimated ?? null,
      tracked:           TRACKED.includes((item.symbol || '').toUpperCase()),
    }));

    // Sort: tracked tickers first, then by date
    enriched.sort((a, b) => {
      if (a.tracked !== b.tracked) return a.tracked ? -1 : 1;
      return a.date.localeCompare(b.date);
    });

    res.json(enriched);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
