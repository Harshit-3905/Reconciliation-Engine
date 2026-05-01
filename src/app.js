const express = require('express');
const filesRouter = require('./routes/files');
const reconciliationsRouter = require('./routes/reconciliations');
const errorHandler = require('./middlewares/errorHandler');

function createApp() {
  const app = express();
  app.use(express.json());

  app.get('/health', (_req, res) => res.json({ status: 'ok' }));
  app.use('/files', filesRouter);
  app.use('/reconciliations', reconciliationsRouter);

  app.use(errorHandler);

  return app;
}

module.exports = { createApp };
