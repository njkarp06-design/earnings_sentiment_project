const router        = require('express').Router();
const User          = require('../models/User');
const PriceReaction = require('../models/PriceReaction');
const requireAuth   = require('../middleware/auth');

const TICKER_RE   = /^[A-Z]{1,10}$/;

// All portfolio routes require a valid JWT.
router.use(requireAuth);

// GET /portfolio
// Returns the most recent correlated call for each ticker in the user's watchlist.
// Uses a single aggregation (one round-trip) with (ticker, call_date) dedup so
// EDGAR+FMP duplicates never surface and EDGAR records are preferred.
router.get('/', async (req, res, next) => {
  try {
    const user = await User.findById(req.user.sub).select('watchlist');
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (!user.watchlist.length) return res.json([]);

    const items = await PriceReaction.aggregate([
      { $match: { ticker: { $in: user.watchlist } } },
      { $addFields: { _name_quality: { $cond: [{ $ne: ['$company_name', '$ticker'] }, 1, 0] } } },
      { $sort: { call_date: -1, _name_quality: -1, correlated_at: -1 } },
      // Deduplicate by (ticker, call_date) — prefer EDGAR-sourced records
      { $group: { _id: { ticker: '$ticker', call_date: '$call_date' }, doc: { $first: '$$ROOT' } } },
      { $replaceRoot: { newRoot: '$doc' } },
      { $sort: { call_date: -1 } },
      // Keep only the single most-recent call per ticker
      { $group: { _id: '$ticker', doc: { $first: '$$ROOT' } } },
      { $replaceRoot: { newRoot: '$doc' } },
      { $project: { _id: 0, __v: 0, _name_quality: 0 } },
    ]);

    res.json(items);
  } catch (err) {
    next(err);
  }
});

// POST /portfolio/:ticker
// Adds a ticker to the user's watchlist (silently idempotent via $addToSet).
router.post('/:ticker', async (req, res, next) => {
  try {
    const ticker = req.params.ticker.toUpperCase();
    if (!TICKER_RE.test(ticker)) {
      return res.status(400).json({ error: 'Invalid ticker — must be 1–10 uppercase letters' });
    }
    await User.findByIdAndUpdate(
      req.user.sub,
      { $addToSet: { watchlist: ticker } },
    );
    res.json({ ok: true, ticker });
  } catch (err) {
    next(err);
  }
});

// DELETE /portfolio/:ticker
// Removes a ticker from the user's watchlist.
router.delete('/:ticker', async (req, res, next) => {
  try {
    const ticker = req.params.ticker.toUpperCase();
    if (!TICKER_RE.test(ticker)) {
      return res.status(400).json({ error: 'Invalid ticker — must be 1–10 uppercase letters' });
    }
    await User.findByIdAndUpdate(
      req.user.sub,
      { $pull: { watchlist: ticker } },
    );
    res.json({ ok: true, ticker });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
