const mongoose = require('mongoose');

const transactionSchema = new mongoose.Schema(
  {
    fileId: { type: mongoose.Schema.Types.ObjectId, ref: 'File', required: true, index: true },
    rowNumber: { type: Number, required: true },
    transactionId: { type: String, required: true },
    timestamp: { type: Date, required: true },
    type: {
      type: String,
      enum: ['BUY', 'SELL', 'TRANSFER_IN', 'TRANSFER_OUT'],
      required: true,
    },
    asset: { type: String, required: true },
    quantity: { type: Number, required: true },
    priceUsd: { type: Number },
    fee: { type: Number, default: 0 },
    note: { type: String },
  },
  { timestamps: true, versionKey: false }
);

transactionSchema.index({ fileId: 1, transactionId: 1 });

module.exports = mongoose.model('Transaction', transactionSchema);
