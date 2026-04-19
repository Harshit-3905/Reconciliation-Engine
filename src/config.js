require('dotenv').config();

const config = {
  port: parseInt(process.env.PORT, 10) || 3000,
  mongodbUri: process.env.MONGODB_URI,
  maxFileSizeBytes: parseInt(process.env.MAX_FILE_SIZE_MB, 10) * 1024 * 1024 || 25 * 1024 * 1024,
};

module.exports = config;
