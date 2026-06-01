const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  email:      { type: String, required: true, unique: true, lowercase: true, trim: true },
  password:   { type: String, required: true },   // bcrypt hash
  watchlist:  { type: [String], default: [] },
  created_at: { type: Date, default: Date.now },
});

module.exports = mongoose.model('User', schema, 'users');
