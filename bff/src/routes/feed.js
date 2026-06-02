const router        = require('express').Router();
const PriceReaction = require('../models/PriceReaction');

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

// GET /feed
// ?since=<ISO timestamp>  — only return items correlated after that time
// Each item gets a computed `pending` flag: call < 7 days old + has null returns.
router.get('/', async (req, res, next) => {
  try {
    const query = {};
    if (req.query.since) {
      query.correlated_at = { $gt: req.query.since };
    }

    const items = await PriceReaction
      .find(query)
      .sort({ correlated_at: -1 })
      .limit(50)
      .select('-_id filing_id ticker company_name sector call_date confidence_score trend key_phrases return_1d return_3d return_7d call_date_close price_series correlated_at');

    const now = Date.now();
    const enriched = items.map(item => {
      const obj = item.toObject ? item.toObject() : item;
      const callAge = now - new Date(obj.call_date + 'T12:00:00').getTime();
      obj.pending = callAge < SEVEN_DAYS_MS &&
        (obj.return_1d == null || obj.return_3d == null || obj.return_7d == null);
      return obj;
    });

    res.json(enriched);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
