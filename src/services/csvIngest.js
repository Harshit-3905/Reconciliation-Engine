const { parse } = require('csv-parse/sync');
const { validateRow, checkHeaders } = require('../validation/transactionSchema');
const { REASONS } = require('../validation/reasons');
const { ValidationError } = require('../errors');

/**
 * Parse a CSV buffer and run every row through the validator.
 * Pure function (no DB access) so it can be unit-tested without MongoDB.
 *
 * @param {Buffer|string} buffer
 * @returns {{
 *   totalRows: number,
 *   valid: Array<{ rowNumber: number, normalized: object }>,
 *   invalid: Array<{ rowNumber: number, rawRow: object, reasons: string[] }>
 * }}
 * @throws {ValidationError} if required columns are missing from the header
 */
function processCsv(buffer) {
  const records = parse(buffer, {
    columns: (header) => header.map((h) => String(h).trim()),
    skip_empty_lines: true,
    trim: true,
    bom: true,
    relax_column_count: true,
  });

  const headers = records.length > 0 ? Object.keys(records[0]) : [];
  const missing = checkHeaders(headers);
  if (missing.length > 0) {
    throw new ValidationError(`${REASONS.MISSING_REQUIRED_COLUMNS}: ${missing.join(', ')}`);
  }

  const seenIds = new Set();
  const valid = [];
  const invalid = [];

  records.forEach((row, idx) => {
    // rowNumber is 1-based, accounting for the header line.
    const rowNumber = idx + 2;
    const result = validateRow(row, seenIds);
    if (result.valid) {
      valid.push({ rowNumber, normalized: result.normalized });
    } else {
      invalid.push({ rowNumber, rawRow: row, reasons: result.reasons });
    }
  });

  return { totalRows: records.length, valid, invalid };
}

/**
 * Ingest a CSV upload: parse, validate, persist. Writes a File doc, a batch
 * of Transaction docs (valid rows), and a batch of InvalidRow docs.
 *
 * If the CSV header is invalid, a ValidationError is thrown immediately
 * without creating any database record.
 */
async function ingestCsv({ filename, buffer, models }) {
  const { File, Transaction, InvalidRow } = models;

  // This throws ValidationError on bad headers — before any DB write.
  const { totalRows, valid, invalid } = processCsv(buffer);

  const fileDoc = await File.create({ filename, status: 'processing' });

  try {
    if (valid.length > 0) {
      await Transaction.insertMany(
        valid.map((v) => ({ fileId: fileDoc._id, rowNumber: v.rowNumber, ...v.normalized })),
        { ordered: false }
      );
    }

    if (invalid.length > 0) {
      await InvalidRow.insertMany(
        invalid.map((i) => ({
          fileId: fileDoc._id,
          rowNumber: i.rowNumber,
          rawRow: i.rawRow,
          reasons: i.reasons,
        }))
      );
    }

    fileDoc.totalRows = totalRows;
    fileDoc.validCount = valid.length;
    fileDoc.invalidCount = invalid.length;
    fileDoc.status = 'completed';
    await fileDoc.save();

    return fileDoc;
  } catch (err) {
    fileDoc.status = 'failed';
    fileDoc.error = err.message;
    await fileDoc.save().catch(() => {});
    throw err;
  }
}

module.exports = { processCsv, ingestCsv };
