const mongoose = require('mongoose');
const config = require('./config');

async function connect() {
  if (!config.mongodbUri) {
    throw new Error('MONGODB_URI is not set. Copy .env.example to .env and configure it.');
  }
  await mongoose.connect(config.mongodbUri);
  console.log(`Connected to MongoDB at ${config.mongodbUri}`);
  return mongoose.connection;
}

async function disconnect() {
  await mongoose.disconnect();
}

module.exports = { connect, disconnect };
