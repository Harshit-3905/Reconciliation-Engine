// Fixed validation reason codes and message templates.
// Use the helper functions for reasons that embed dynamic values.

const REASONS = {
  TRANSACTION_ID_REQUIRED: 'transaction_id is required',
  DUPLICATE_TRANSACTION_ID: 'duplicate transaction_id within file',

  TIMESTAMP_MISSING: 'timestamp missing',
  TIMESTAMP_INVALID: 'timestamp is not a valid ISO-8601 date',

  TYPE_REQUIRED: 'type is required',
  TYPE_INVALID: 'type must be one of BUY/SELL/TRANSFER_IN/TRANSFER_OUT',

  ASSET_REQUIRED: 'asset is required',
  ASSET_UNKNOWN: 'unknown asset',

  QUANTITY_REQUIRED: 'quantity is required',
  QUANTITY_NOT_A_NUMBER: 'quantity must be a number',
  QUANTITY_NOT_POSITIVE: 'quantity must be a positive number',

  PRICE_USD_NOT_A_NUMBER: 'price_usd must be a number',
  PRICE_USD_NEGATIVE: 'price_usd must be non-negative',
  PRICE_USD_REQUIRED_FOR_TRADE: 'price_usd is required for BUY/SELL transactions',

  FEE_NOT_A_NUMBER: 'fee must be a number',
  FEE_NEGATIVE: 'fee must be non-negative',

  MISSING_REQUIRED_COLUMNS: 'CSV is missing required columns',
  NO_FILE_UPLOADED: 'No file uploaded. Use multipart field "file".',
  FILE_NOT_FOUND: 'File not found',
  INVALID_FILE_ID: 'Invalid file id',
  INVALID_FILE_TYPE: 'Invalid file type: only CSV files are accepted',
  EMPTY_FILE: 'Uploaded file is empty',

  // Reconciliation
  USER_FILE_REQUIRED: 'User file is required. Use multipart field "userFile".',
  EXCHANGE_FILE_REQUIRED: 'Exchange file is required. Use multipart field "exchangeFile".',
  USER_FILE_EMPTY: 'User file is empty',
  EXCHANGE_FILE_EMPTY: 'Exchange file is empty',
  RECONCILIATION_NOT_FOUND: 'Reconciliation report not found',
  INVALID_REPORT_ID: 'Invalid report id',
};

// Helpers that append the offending value for diagnostics.
function withValue(reason, value) {
  return `${reason}: "${value}"`;
}

function withGot(reason, value) {
  return `${reason} (got ${value})`;
}

module.exports = { REASONS, withValue, withGot };
