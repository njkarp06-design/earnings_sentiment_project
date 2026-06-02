// Runs once when the mongo container is first created.
// Creates collections with schema validation for the earnings_sentiment DB.

db = db.getSiblingDB('earnings_sentiment');

db.createCollection('companies', {
  validator: {
    $jsonSchema: {
      bsonType: 'object',
      required: ['ticker', 'name'],
      properties: {
        ticker:   { bsonType: 'string' },
        name:     { bsonType: 'string' },
        sector:   { bsonType: 'string' },
        exchange: { bsonType: 'string' },
      },
    },
  },
});

db.createCollection('transcripts', {
  validator: {
    $jsonSchema: {
      bsonType: 'object',
      required: ['ticker', 'call_date', 'filing_id', 'raw_text'],
      properties: {
        ticker:    { bsonType: 'string' },
        call_date: { bsonType: 'string' },
        filing_id: { bsonType: 'string' },
        raw_text:  { bsonType: 'string' },
      },
    },
  },
});

db.createCollection('scores');          // confidence_score, key_phrases, model_used, scored_at
db.createCollection('price_reactions'); // ticker, call_date, return_1d, return_3d, return_7d
db.createCollection('raw_prices');      // ticker, date, open, high, low, close, volume
db.createCollection('users');           // auth, watchlist

// Indexes
db.companies.createIndex({ ticker: 1 }, { unique: true });
db.transcripts.createIndex({ ticker: 1, call_date: -1 });
db.transcripts.createIndex({ filing_id: 1 }, { unique: true });
db.scores.createIndex({ filing_id: 1 }, { unique: true });
db.price_reactions.createIndex({ filing_id: 1 }, { unique: true, sparse: true });
db.price_reactions.createIndex({ ticker: 1, call_date: -1 });
db.price_reactions.createIndex({ correlated_at: -1 });  // feed endpoint sort
db.raw_prices.createIndex({ ticker: 1, date: 1 }, { unique: true });
db.users.createIndex({ email: 1 }, { unique: true });

print('earnings_sentiment DB initialised');
