const mongoose = require('mongoose');

const summarySchema = new mongoose.Schema(
  {
    totalUserTransactions: { type: Number, default: 0 },
    totalExchangeTransactions: { type: Number, default: 0 },
    matchedCount: { type: Number, default: 0 },
    discrepancyCount: { type: Number, default: 0 },
    unmatchedUserCount: { type: Number, default: 0 },
    unmatchedExchangeCount: { type: Number, default: 0 },
  },
  { _id: false }
);

const tolerancesSchema = new mongoose.Schema(
  {
    timestampToleranceMs: { type: Number },
    quantityTolerancePct: { type: Number },
  },
  { _id: false }
);

const reconciliationReportSchema = new mongoose.Schema(
  {
    userFileId: { type: mongoose.Schema.Types.ObjectId, ref: 'File', required: true },
    exchangeFileId: { type: mongoose.Schema.Types.ObjectId, ref: 'File', required: true },
    status: {
      type: String,
      enum: ['processing', 'completed', 'failed'],
      default: 'processing',
    },
    tolerances: { type: tolerancesSchema },
    summary: { type: summarySchema, default: () => ({}) },
    error: { type: String },
  },
  { timestamps: true, versionKey: false }
);

module.exports = mongoose.model('ReconciliationReport', reconciliationReportSchema);
