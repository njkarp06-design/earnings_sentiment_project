const router       = require('express').Router();
const PriceReaction = require('../models/PriceReaction');

// GET /feed
// Returns the 24 most recent correlated earnings calls across all tickers.
router.get('/', async (_req, res, next) => {
  try {
    const items = await PriceReaction
      .find({})
      .sort({ correlated_at: -1 })
      .limit(24)
      .select('-_id filing_id ticker company_name sector call_date confidence_score trend key_phrases return_1d return_3d return_7d call_date_close price_series correlated_at');
    res.json(items);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
