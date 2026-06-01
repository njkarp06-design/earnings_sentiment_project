const router       = require('express').Router();
const PriceReaction = require('../models/PriceReaction');

// GET /companies/:ticker/history
// All scored+correlated calls for a ticker, newest first.
router.get('/:ticker/history', async (req, res, next) => {
  try {
    const ticker = req.params.ticker.toUpperCase();
    const items = await PriceReaction
      .find({ ticker })
      .sort({ call_date: -1 })
      .select('-_id -__v');
    res.json(items);
  } catch (err) {
    next(err);
  }
});

// GET /companies/:ticker/latest
// Most recent scored+correlated call for a ticker.
router.get('/:ticker/latest', async (req, res, next) => {
  try {
    const ticker = req.params.ticker.toUpperCase();
    const item = await PriceReaction
      .findOne({ ticker })
      .sort({ call_date: -1 })
      .select('-_id -__v');
    if (!item) return res.status(404).json({ error: `No data found for ${ticker}` });
    res.json(item);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
