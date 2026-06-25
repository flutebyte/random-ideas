const { PutObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const { s3Client } = require('../../config/s3');
const fs = require('fs');
const path = require('path');

const uploadToS3 = async (filePath, mimeType, originalName) => {
  const bucket = process.env.AWS_S3_BUCKET;
  const key = `uploads/${Date.now()}-${path.basename(originalName)}`;

  await s3Client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: fs.createReadStream(filePath),
      ContentType: mimeType,
    })
  );

  return { key, bucket };
};

const downloadFromS3 = async (bucket, key) => {
  const command = new GetObjectCommand({ Bucket: bucket, Key: key });
  const response = await s3Client.send(command);

  const chunks = [];
  for await (const chunk of response.Body) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
};

module.exports = { uploadToS3, downloadFromS3 };
