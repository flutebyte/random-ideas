const mongoose = require('mongoose');

const uploadSchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    originalName: { type: String, required: true },
    mimeType: {
      type: String,
      enum: ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'],
      required: true,
    },
    size: { type: Number, required: true },
    storageType: { type: String, enum: ['local', 's3'], default: 'local' },
    localPath: String,
    s3Bucket: String,
    s3Key: String,
    extracted: {
      status: {
        type: String,
        enum: ['pending', 'processing', 'done', 'failed'],
        default: 'pending',
      },
      data: mongoose.Schema.Types.Mixed,
      error: String,
      processedAt: Date,
    },
  },
  { timestamps: true }
);

uploadSchema.index({ 'extracted.status': 1 });

module.exports = mongoose.model('Upload', uploadSchema);
