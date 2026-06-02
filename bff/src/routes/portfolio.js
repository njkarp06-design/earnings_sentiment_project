const router        = require('express').Router();
const User          = require('../models/User');
const PriceReaction = require('../models/PriceReaction');
const requireAuth   = require('../middleware/auth');

const FEED_SELECT = '-_id filing_id ticker company_name sector call_date confidence_score trend key_phrases return_1d return_3d return_7d call_date_close price_series correlated_at';

// All portfolio routes require a valid JWT.
router.use(requireAuth);

// GET /portfolio
// Returns the most recent correlated call for each ticker in the user's watchlist.
router.get('/', async (req, res, next) => {
  try {
    const user = await User.findById(req.user.sub).select('watchlist');
    if (!user) return res.status(404).json({ error: 'User not found' });

    const items = await Promise.all(
      user.watchlist.map((ticker) =>
        PriceReaction.findOne({ ticker })
          .sort({ call_date: -1 })
          .select(FEED_SELECT),
      ),
    );

    res.json(items.filter(Boolean));
  } catch (err) {
    next(err);
  }
});

// POST /portfolio/:ticker
// Adds a ticker to the user's watchlist (silently idempotent via $addToSet).
router.post('/:ticker', async (req, res, next) => {
  try {
    const ticker = req.params.ticker.toUpperCase();
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
