// Phase 4 placeholder.
// REST endpoints:
//   GET /companies/:ticker/history
//   GET /companies/:ticker/latest
//   GET /leaderboard
//   GET /feed
//   POST /auth/login  POST /auth/register

const express = require('express');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(express.json());

app.get('/health', (_req, res) => res.json({ status: 'ok' }));

app.listen(PORT, () => {
  console.log(`BFF listening on :${PORT} (stub — implement in Phase 4)`);
});
