const express = require('express');

const { upload, requireNonEmptyFile } = require('../middlewares/upload');
const File = require('../models/File');
const Transaction = require('../models/Transaction');
const InvalidRow = require('../models/InvalidRow');
const { ingestCsv } = require('../services/csvIngest');
const { ValidationError, NotFoundError } = require('../errors');
const { REASONS } = require('../validation/reasons');

const router = express.Router();
const models = { File, Transaction, InvalidRow };

// POST /files — upload one CSV
router.post('/', upload.single('file'), requireNonEmptyFile, async (req, res, next) => {
  try {
    const fileDoc = await ingestCsv({
      filename: req.file.originalname,
      buffer: req.file.buffer,
      models,
    });

    res.status(201).json({
      fileId: fileDoc._id,
      filename: fileDoc.filename,
      totalRows: fileDoc.totalRows,
      validCount: fileDoc.validCount,
      invalidCount: fileDoc.invalidCount,
      status: fileDoc.status,
    });
  } catch (err) {
    next(err);
  }
});

// GET /files — summary of all uploaded files
router.get('/', async (_req, res, next) => {
  try {
    const files = await File.find({}).sort({ uploadedAt: -1 }).lean();
    res.json(
      files.map((f) => ({
        fileId: f._id,
        filename: f.filename,
        uploadedAt: f.uploadedAt,
        totalRows: f.totalRows,
        validCount: f.validCount,
        invalidCount: f.invalidCount,
        status: f.status,
      }))
    );
  } catch (err) {
    next(err);
  }
});

// GET /files/:id — full detail including invalid rows with reasons
router.get('/:id', async (req, res, next) => {
  try {
    const file = await File.findById(req.params.id).lean();
    if (!file) throw new NotFoundError(REASONS.FILE_NOT_FOUND);

    const limit = Math.min(Number(req.query.limit) || 100, 1000);
    const offset = Math.max(Number(req.query.offset) || 0, 0);

    const [invalidRows, invalidTotal] = await Promise.all([
      InvalidRow.find({ fileId: file._id })
        .sort({ rowNumber: 1 })
        .skip(offset)
        .limit(limit)
        .lean(),
      InvalidRow.countDocuments({ fileId: file._id }),
    ]);

    res.json({
      fileId: file._id,
      filename: file.filename,
      uploadedAt: file.uploadedAt,
      status: file.status,
      totalRows: file.totalRows,
      validCount: file.validCount,
      invalidCount: file.invalidCount,
      invalidRows: {
        total: invalidTotal,
        limit,
        offset,
        items: invalidRows.map((r) => ({
          rowNumber: r.rowNumber,
          reasons: r.reasons,
          rawRow: r.rawRow,
        })),
      },
    });
  } catch (err) {
    if (err.name === 'CastError') {
      return next(new ValidationError(REASONS.INVALID_FILE_ID));
    }
    next(err);
  }
});

module.exports = router;
