const express = require('express');

const { uploadPair, requireBothFiles } = require('../middlewares/upload');
const { ingestCsv } = require('../services/csvIngest');
const { reconcile, DEFAULT_TOLERANCES } = require('../services/reconciliation');
const { ValidationError, NotFoundError } = require('../errors');
const { REASONS } = require('../validation/reasons');

const File = require('../models/File');
const Transaction = require('../models/Transaction');
const InvalidRow = require('../models/InvalidRow');
const ReconciliationReport = require('../models/ReconciliationReport');
const ReconciliationResult = require('../models/ReconciliationResult');

const router = express.Router();
const ingestModels = { File, Transaction, InvalidRow };
const reconcileModels = { Transaction, ReconciliationReport, ReconciliationResult };

// ── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Parse optional tolerance overrides from the multipart form body.
 * Invalid or missing values are left out so the defaults apply.
 */
function parseTolerances(body) {
  const tolerances = {};
  if (body.timestampToleranceMs != null) {
    const v = Number(body.timestampToleranceMs);
    if (Number.isFinite(v) && v >= 0) tolerances.timestampToleranceMs = v;
  }
  if (body.quantityTolerancePct != null) {
    const v = Number(body.quantityTolerancePct);
    if (Number.isFinite(v) && v >= 0) tolerances.quantityTolerancePct = v;
  }
  return tolerances;
}

function formatTransaction(t) {
  if (!t) return null;
  return {
    transactionId: t.transactionId,
    timestamp: t.timestamp,
    type: t.type,
    asset: t.asset,
    quantity: t.quantity,
    priceUsd: t.priceUsd,
    fee: t.fee,
    note: t.note,
  };
}

function formatResultItem(r) {
  const item = { status: r.status };
  if (r.userTransactionId) {
    item.userTransaction = formatTransaction(r.userTransactionId);
  }
  if (r.exchangeTransactionId) {
    item.exchangeTransaction = formatTransaction(r.exchangeTransactionId);
  }
  if (r.discrepancies && r.discrepancies.length > 0) {
    item.discrepancies = r.discrepancies;
  }
  return item;
}

// ── POST /reconciliations — upload two CSVs and reconcile ───────────────────

router.post('/', uploadPair, requireBothFiles, async (req, res, next) => {
  try {
    const userFile = req.files.userFile[0];
    const exchangeFile = req.files.exchangeFile[0];

    // Ingest both files through the existing pipeline
    let userFileDoc;
    try {
      userFileDoc = await ingestCsv({
        filename: userFile.originalname,
        buffer: userFile.buffer,
        models: ingestModels,
      });
    } catch (err) {
      if (err.statusCode) {
        throw new ValidationError(`User file: ${err.message}`);
      }
      throw err;
    }

    let exchangeFileDoc;
    try {
      exchangeFileDoc = await ingestCsv({
        filename: exchangeFile.originalname,
        buffer: exchangeFile.buffer,
        models: ingestModels,
      });
    } catch (err) {
      if (err.statusCode) {
        throw new ValidationError(`Exchange file: ${err.message}`);
      }
      throw err;
    }

    // Run reconciliation (tolerances are optional form fields)
    const tolerances = parseTolerances(req.body);
    const report = await reconcile({
      userFileId: userFileDoc._id,
      exchangeFileId: exchangeFileDoc._id,
      tolerances,
      models: reconcileModels,
    });

    res.status(201).json({
      reportId: report._id,
      status: report.status,
      tolerances: report.tolerances,
      userFile: {
        fileId: userFileDoc._id,
        filename: userFileDoc.filename,
        validCount: userFileDoc.validCount,
        invalidCount: userFileDoc.invalidCount,
      },
      exchangeFile: {
        fileId: exchangeFileDoc._id,
        filename: exchangeFileDoc.filename,
        validCount: exchangeFileDoc.validCount,
        invalidCount: exchangeFileDoc.invalidCount,
      },
      summary: report.summary,
    });
  } catch (err) {
    next(err);
  }
});

// ── GET /reconciliations — list all reports ─────────────────────────────────

router.get('/', async (_req, res, next) => {
  try {
    const reports = await ReconciliationReport.find({})
      .sort({ createdAt: -1 })
      .populate('userFileId', 'filename')
      .populate('exchangeFileId', 'filename')
      .lean();

    res.json(
      reports.map((r) => ({
        reportId: r._id,
        status: r.status,
        createdAt: r.createdAt,
        userFile: { fileId: r.userFileId._id, filename: r.userFileId.filename },
        exchangeFile: { fileId: r.exchangeFileId._id, filename: r.exchangeFileId.filename },
        summary: r.summary,
      }))
    );
  } catch (err) {
    next(err);
  }
});

// ── GET /reconciliations/:id — detailed report with paginated results ───────

const VALID_STATUSES = new Set(['matched', 'discrepancy', 'unmatched_user', 'unmatched_exchange']);

router.get('/:id', async (req, res, next) => {
  try {
    const report = await ReconciliationReport.findById(req.params.id)
      .populate('userFileId', 'filename')
      .populate('exchangeFileId', 'filename')
      .lean();

    if (!report) throw new NotFoundError(REASONS.RECONCILIATION_NOT_FOUND);

    const limit = Math.min(Number(req.query.limit) || 100, 1000);
    const offset = Math.max(Number(req.query.offset) || 0, 0);

    // Optional status filter
    const filter = { reportId: report._id };
    if (req.query.status && VALID_STATUSES.has(req.query.status)) {
      filter.status = req.query.status;
    }

    const [results, totalResults] = await Promise.all([
      ReconciliationResult.find(filter)
        .sort({ status: 1 })
        .skip(offset)
        .limit(limit)
        .populate('userTransactionId')
        .populate('exchangeTransactionId')
        .lean(),
      ReconciliationResult.countDocuments(filter),
    ]);

    res.json({
      reportId: report._id,
      status: report.status,
      createdAt: report.createdAt,
      userFile: { fileId: report.userFileId._id, filename: report.userFileId.filename },
      exchangeFile: {
        fileId: report.exchangeFileId._id,
        filename: report.exchangeFileId.filename,
      },
      summary: report.summary,
      results: {
        total: totalResults,
        limit,
        offset,
        items: results.map(formatResultItem),
      },
    });
  } catch (err) {
    if (err.name === 'CastError') {
      return next(new ValidationError(REASONS.INVALID_REPORT_ID));
    }
    next(err);
  }
});

module.exports = router;
