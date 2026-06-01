const mongoose = require('mongoose');

// Matches the document shape written by the correlation service (Phase 3).
// strict: false allows any extra fields the Python service may add later.
const schema = new mongoose.Schema(
  {
    filing_id:        { type: String, unique: true, sparse: true },
    ticker:           String,
    company_name:     String,
    call_date:        String,
    confidence_score: Number,
    key_phrases:      [String],
    model_used:       String,
    scored_at:        String,
    correlated_at:    String,
    call_date_close:  Number,
    return_1d:        Number,
    return_3d:        Number,
    return_7d:        Number,
  },
  { strict: false },
);

module.exports = mongoose.model('PriceReaction', schema, 'price_reactions');
