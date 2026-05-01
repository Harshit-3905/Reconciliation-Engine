const mongoose = require('mongoose');

const discrepancySchema = new mongoose.Schema(
  {
    field: { type: String, required: true },
    userValue: { type: mongoose.Schema.Types.Mixed },
    exchangeValue: { type: mongoose.Schema.Types.Mixed },
  },
  { _id: false }
);

const reconciliationResultSchema = new mongoose.Schema(
  {
    reportId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ReconciliationReport',
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: ['matched', 'discrepancy', 'unmatched_user', 'unmatched_exchange'],
      required: true,
    },
    userTransactionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Transaction' },
    exchangeTransactionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Transaction' },
    discrepancies: [discrepancySchema],
  },
  { timestamps: true, versionKey: false }
);

module.exports = mongoose.model('ReconciliationResult', reconciliationResultSchema);
