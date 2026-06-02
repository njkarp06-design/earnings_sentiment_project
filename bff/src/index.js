require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const { connect } = require('./db');

if (!process.env.JWT_SECRET) {
  console.error('FATAL: JWT_SECRET is not set — add it to .env before starting');
  process.exit(1);
}
if (process.env.JWT_SECRET === 'changeme') {
  console.warn('WARNING: JWT_SECRET is "changeme" — use a strong secret in production');
}
if (!process.env.ANTHROPIC_API_KEY) {
  console.warn('WARNING: ANTHROPIC_API_KEY is not set — the /inspect endpoint will fail at runtime');
}

const app  = express();
const PORT = process.env.PORT || 3001;

const corsOrigin = process.env.CORS_ORIGIN || 'http://localhost:3000';
app.use(cors({ origin: corsOrigin }));
app.use(express.json());

// ── Routes ──────────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => res.json({ status: 'ok' }));
app.use('/auth',        require('./routes/auth'));
app.use('/feed',        require('./routes/feed'));
app.use('/search',      require('./routes/search'));
app.use('/portfolio',   require('./routes/portfolio'));
app.use('/inspect',     require('./routes/inspect'));
app.use('/suggestions', require('./routes/suggestions'));
app.use('/pulse',       require('./routes/pulse'));
app.use('/companies',   require('./routes/companies'));
app.use('/leaderboard', require('./routes/leaderboard'));
app.use('/calendar',    require('./routes/calendar'));

// ── 404 handler ──────────────────────────────────────────────────────────────
app.use((_req, res) => res.status(404).json({ error: 'Not found' }));

// ── Global error handler ─────────────────────────────────────────────────────
// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

// ── Start ────────────────────────────────────────────────────────────────────
connect()
  .then(() => {
    app.listen(PORT, () => console.log(`BFF listening on :${PORT}`));
  })
  .catch(err => {
    console.error('MongoDB connection failed:', err.message);
    process.exit(1);
  });
