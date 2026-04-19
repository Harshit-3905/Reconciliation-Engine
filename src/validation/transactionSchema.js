const { KNOWN_ASSETS, normalizeAsset } = require('./assetAliases');
const { REASONS, withValue, withGot } = require('./reasons');

const VALID_TYPES = new Set(['BUY', 'SELL', 'TRANSFER_IN', 'TRANSFER_OUT']);
const REQUIRES_PRICE = new Set(['BUY', 'SELL']);

const REQUIRED_HEADERS = [
  'transaction_id',
  'timestamp',
  'type',
  'asset',
  'quantity',
  'price_usd',
  'fee',
  'note',
];

function isBlank(v) {
  return v === undefined || v === null || String(v).trim() === '';
}

function parseNumber(v) {
  if (isBlank(v)) return null;
  const n = Number(String(v).trim());
  return Number.isFinite(n) ? n : NaN;
}

function parseTimestamp(v) {
  if (isBlank(v)) return { ok: false, reason: REASONS.TIMESTAMP_MISSING };
  const s = String(v).trim();
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) {
    return { ok: false, reason: withValue(REASONS.TIMESTAMP_INVALID, s) };
  }
  // Guard against half-formed ISO strings like "2024-03-09T" that some JS engines
  // may partially parse. Require at least a date + time block when a T is present.
  if (s.includes('T')) {
    const [, timePart] = s.split('T');
    if (!timePart || timePart.length < 4) {
      return { ok: false, reason: withValue(REASONS.TIMESTAMP_INVALID, s) };
    }
  }
  return { ok: true, date: d };
}

/**
 * Validate a single parsed CSV row.
 * @param {object} row   - raw row keyed by header
 * @param {Set<string>} seenIds - transaction_ids already seen in this file
 * @returns {{ valid: boolean, normalized?: object, reasons: string[] }}
 */
function validateRow(row, seenIds) {
  const reasons = [];

  // transaction_id
  const transactionId = isBlank(row.transaction_id) ? null : String(row.transaction_id).trim();
  if (!transactionId) {
    reasons.push(REASONS.TRANSACTION_ID_REQUIRED);
  } else if (seenIds.has(transactionId)) {
    reasons.push(REASONS.DUPLICATE_TRANSACTION_ID);
  }

  // timestamp
  const ts = parseTimestamp(row.timestamp);
  if (!ts.ok) reasons.push(ts.reason);

  // type
  const rawType = isBlank(row.type) ? null : String(row.type).trim().toUpperCase();
  if (!rawType) {
    reasons.push(REASONS.TYPE_REQUIRED);
  } else if (!VALID_TYPES.has(rawType)) {
    reasons.push(withGot(REASONS.TYPE_INVALID, `"${row.type}"`));
  }

  // asset
  const asset = normalizeAsset(row.asset);
  if (!asset) {
    reasons.push(REASONS.ASSET_REQUIRED);
  } else if (!KNOWN_ASSETS.has(asset)) {
    reasons.push(withValue(REASONS.ASSET_UNKNOWN, row.asset));
  }

  // quantity
  const quantity = parseNumber(row.quantity);
  if (quantity === null) {
    reasons.push(REASONS.QUANTITY_REQUIRED);
  } else if (Number.isNaN(quantity)) {
    reasons.push(withGot(REASONS.QUANTITY_NOT_A_NUMBER, `"${row.quantity}"`));
  } else if (quantity <= 0) {
    reasons.push(withGot(REASONS.QUANTITY_NOT_POSITIVE, quantity));
  }

  // price_usd — required for BUY/SELL, optional for transfers
  const priceRaw = row.price_usd;
  let priceUsd = null;
  if (!isBlank(priceRaw)) {
    const p = parseNumber(priceRaw);
    if (Number.isNaN(p)) {
      reasons.push(withGot(REASONS.PRICE_USD_NOT_A_NUMBER, `"${priceRaw}"`));
    } else if (p < 0) {
      reasons.push(withGot(REASONS.PRICE_USD_NEGATIVE, p));
    } else {
      priceUsd = p;
    }
  } else if (rawType && REQUIRES_PRICE.has(rawType)) {
    reasons.push(REASONS.PRICE_USD_REQUIRED_FOR_TRADE);
  }

  // fee — optional, defaults to 0
  let fee = 0;
  if (!isBlank(row.fee)) {
    const f = parseNumber(row.fee);
    if (Number.isNaN(f)) {
      reasons.push(withGot(REASONS.FEE_NOT_A_NUMBER, `"${row.fee}"`));
    } else if (f < 0) {
      reasons.push(withGot(REASONS.FEE_NEGATIVE, f));
    } else {
      fee = f;
    }
  }

  if (reasons.length > 0) {
    return { valid: false, reasons };
  }

  // Record the id only after we know the row is otherwise valid; if invalid
  // for other reasons we still want subsequent occurrences to also be flagged
  // so we always record.
  seenIds.add(transactionId);

  return {
    valid: true,
    reasons: [],
    normalized: {
      transactionId,
      timestamp: ts.date,
      type: rawType,
      asset,
      quantity,
      priceUsd,
      fee,
      note: isBlank(row.note) ? undefined : String(row.note).trim(),
    },
  };
}

/**
 * Ensure the CSV header contains every expected column. Returns a list of
 * missing column names (empty if OK).
 */
function checkHeaders(headers) {
  if (!Array.isArray(headers)) return REQUIRED_HEADERS.slice();
  const present = new Set(headers.map((h) => String(h).trim().toLowerCase()));
  return REQUIRED_HEADERS.filter((h) => !present.has(h));
}

module.exports = { validateRow, checkHeaders, REQUIRED_HEADERS, VALID_TYPES };
