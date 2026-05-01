const path = require('path');
const multer = require('multer');
const config = require('../config');
const { ValidationError } = require('../errors');
const { REASONS } = require('../validation/reasons');

// Accept both the canonical CSV mimetype and common variants browsers send
// (Excel installs sometimes report application/vnd.ms-excel for .csv uploads).
const ALLOWED_MIME_TYPES = new Set([
  'text/csv',
  'application/csv',
  'application/vnd.ms-excel',
  'text/plain',
  'application/octet-stream',
]);

function csvFileFilter(_req, file, cb) {
  const ext = path.extname(file.originalname || '').toLowerCase();
  if (ext !== '.csv') {
    return cb(new ValidationError(REASONS.INVALID_FILE_TYPE));
  }
  if (file.mimetype && !ALLOWED_MIME_TYPES.has(file.mimetype)) {
    return cb(new ValidationError(REASONS.INVALID_FILE_TYPE));
  }
  cb(null, true);
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.maxFileSizeBytes },
  fileFilter: csvFileFilter,
});

/**
 * Enforce that a file was actually attached and that it is non-empty.
 * Runs after `upload.single('file')`.
 */
function requireNonEmptyFile(req, _res, next) {
  if (!req.file) {
    return next(new ValidationError(REASONS.NO_FILE_UPLOADED));
  }
  if (!req.file.buffer || req.file.buffer.length === 0 || req.file.size === 0) {
    return next(new ValidationError(REASONS.EMPTY_FILE));
  }
  next();
}

/**
 * Accept exactly two CSV files (userFile + exchangeFile) for reconciliation.
 */
const uploadPair = upload.fields([
  { name: 'userFile', maxCount: 1 },
  { name: 'exchangeFile', maxCount: 1 },
]);

/**
 * Enforce that both files were attached and are non-empty.
 * Runs after `uploadPair`.
 */
function requireBothFiles(req, _res, next) {
  const userFile = req.files && req.files.userFile && req.files.userFile[0];
  const exchangeFile = req.files && req.files.exchangeFile && req.files.exchangeFile[0];

  if (!userFile) return next(new ValidationError(REASONS.USER_FILE_REQUIRED));
  if (!exchangeFile) return next(new ValidationError(REASONS.EXCHANGE_FILE_REQUIRED));

  if (!userFile.buffer || userFile.buffer.length === 0) {
    return next(new ValidationError(REASONS.USER_FILE_EMPTY));
  }
  if (!exchangeFile.buffer || exchangeFile.buffer.length === 0) {
    return next(new ValidationError(REASONS.EXCHANGE_FILE_EMPTY));
  }
  next();
}

module.exports = { upload, requireNonEmptyFile, uploadPair, requireBothFiles };
