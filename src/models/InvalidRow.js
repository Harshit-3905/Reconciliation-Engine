const mongoose = require('mongoose');

const invalidRowSchema = new mongoose.Schema(
  {
    fileId: { type: mongoose.Schema.Types.ObjectId, ref: 'File', required: true, index: true },
    rowNumber: { type: Number, required: true },
    rawRow: { type: mongoose.Schema.Types.Mixed, required: true },
    reasons: { type: [String], required: true },
  },
  { timestamps: true, versionKey: false }
);

module.exports = mongoose.model('InvalidRow', invalidRowSchema);
