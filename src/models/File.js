const mongoose = require('mongoose');

const fileSchema = new mongoose.Schema(
  {
    filename: { type: String, required: true },
    uploadedAt: { type: Date, default: Date.now },
    totalRows: { type: Number, default: 0 },
    validCount: { type: Number, default: 0 },
    invalidCount: { type: Number, default: 0 },
    status: {
      type: String,
      enum: ['processing', 'completed', 'failed'],
      default: 'processing',
    },
    error: { type: String },
  },
  { versionKey: false }
);

module.exports = mongoose.model('File', fileSchema);
