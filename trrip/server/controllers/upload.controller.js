const fs = require('fs').promises;
const Upload = require('../models/Upload');
const AppError = require('../utils/AppError');
const asyncHandler = require('../utils/asyncHandler');
const { extractTripData } = require('../services/ai/extractTripData');
const { uploadToS3 } = require('../services/storage/s3Storage');

const useS3 = process.env.USE_S3 === 'true';

exports.uploadFiles = asyncHandler(async (req, res) => {
  if (!req.files || req.files.length === 0) {
    throw new AppError('No files uploaded', 400);
  }

  const uploads = await Promise.all(
    req.files.map(async (file) => {
      let storageType = 'local';
      let localPath = file.path;
      let s3Key, s3Bucket;

      if (useS3) {
        try {
          const result = await uploadToS3(file.path, file.mimetype, file.originalname);
          s3Key = result.key;
          s3Bucket = result.bucket;
          storageType = 's3';
          localPath = null;
          // Remove temp file — fire and forget, not critical
          fs.unlink(file.path).catch(() => {});
        } catch (err) {
          // S3 upload failed — fall back to local storage for this file
          console.error(`S3 upload failed for ${file.originalname}, keeping local:`, err.message);
        }
      }

      return Upload.create({
        owner: req.user._id,
        originalName: file.originalname,
        mimeType: file.mimetype,
        size: file.size,
        storageType,
        localPath,
        s3Key,
        s3Bucket,
        extracted: { status: 'pending' },
      });
    })
  );

  // Fire async extraction per upload — do not await
  uploads.forEach((upload) => {
    extractTripData(upload).catch((err) =>
      console.error(`Extraction failed for upload ${upload._id}:`, err.message)
    );
  });

  res.status(201).json({
    success: true,
    uploadIds: uploads.map((u) => u._id),
    uploads,
  });
});

exports.getUploadStatus = asyncHandler(async (req, res) => {
  const upload = await Upload.findOne({ _id: req.params.id, owner: req.user._id });
  if (!upload) throw new AppError('Upload not found', 404);

  res.json({
    success: true,
    status: upload.extracted.status,
    extractedData: upload.extracted.status === 'done' ? upload.extracted.data : undefined,
    error: upload.extracted.status === 'failed' ? upload.extracted.error : undefined,
  });
});
