const mongoose = require('mongoose');

const schema = new mongoose.Schema(
  {
    ticker: String,
    date:   String,   // YYYY-MM-DD
    open:   Number,
    high:   Number,
    low:    Number,
    close:  Number,
    volume: Number,
  },
  { strict: false },
);

schema.index({ ticker: 1, date: 1 }, { unique: true });

module.exports = mongoose.model('RawPrice', schema, 'raw_prices');
