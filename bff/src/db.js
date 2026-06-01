const mongoose = require('mongoose');

async function connect() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log('MongoDB connected');
}

module.exports = { connect };
