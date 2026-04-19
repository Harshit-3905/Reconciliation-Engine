const config = require('./config');
const { connect } = require('./db');
const { createApp } = require('./app');

async function main() {
  await connect();

  const app = createApp();
  app.listen(config.port, () => {
    console.log(`Crypto txn ingest service listening on :${config.port}`);
  });
}

main().catch((err) => {
  console.error('Fatal startup error:', err);
  process.exit(1);
});
