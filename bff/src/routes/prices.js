const router   = require('express').Router();
const RawPrice = require('../models/RawPrice');

// GET /prices/:ticker?days=N
// Returns OHLCV rows from the raw_prices cache, sorted oldest→newest.
// Defaults to the last 90 days of available data.
router.get('/:ticker', async (req, res, next) => {
  try {
    const ticker = req.params.ticker.toUpperCase();
    const days   = Math.min(parseInt(req.query.days, 10) || 90, 365);

    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    const cutoffStr = cutoff.toISOString().slice(0, 10);

    const rows = await RawPrice
      .find({ ticker, date: { $gte: cutoffStr } })
      .sort({ date: 1 })
      .select('-_id -__v');

    res.json(rows);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
