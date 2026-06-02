const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  email:                   { type: String, required: true, unique: true, lowercase: true, trim: true },
  password:                { type: String, required: true },
  watchlist:               { type: [String], default: [] },
  notifications_enabled:   { type: Boolean, default: false },
  notifications_email:     { type: String,  default: '' },
  created_at:              { type: Date, default: Date.now },
});

module.exports = mongoose.model('User', schema, 'users');
