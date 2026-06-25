export const humanFileSize = (bytes) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

export const isImage = (mimeType) => mimeType?.startsWith('image/');

export const isPDF = (mimeType) => mimeType === 'application/pdf';

export const getFileIcon = (mimeType) => (isPDF(mimeType) ? '📄' : '🖼️');
